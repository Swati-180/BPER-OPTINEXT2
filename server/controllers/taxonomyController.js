const Taxonomy = require('../models/Taxonomy');
const { logAction } = require('../utils/auditLogger');
const stringSimilarity = require('string-similarity');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── Hierarchical taxonomy query handlers ──────────────────────────────────────
// GET /taxonomy/major-processes
const getMajorProcesses = async (req, res) => {
  try {
    const all = await Taxonomy.find({ isActive: true }).lean();
    const unique = [...new Set(all.map(t => t.majorProcess))].filter(Boolean).sort();
    res.json(unique);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /taxonomy/processes-by-major?major=<name>
const getProcessesByMajor = async (req, res) => {
  try {
    const { major } = req.query;
    if (!major) return res.status(400).json({ message: 'major query param is required' });
    const all = await Taxonomy.find({ majorProcess: major, isActive: true }).lean();
    const unique = [...new Set(all.map(t => t.process))].filter(Boolean).sort();
    res.json(unique);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /taxonomy/subprocesses-by-process?major=<name>&process=<name>
const getSubProcessesByProcess = async (req, res) => {
  try {
    const { major, process: proc } = req.query;
    if (!major || !proc) return res.status(400).json({ message: 'major and process query params are required' });
    const item = await Taxonomy.findOne({ majorProcess: major, process: proc, isActive: true }).lean();
    const subs = item?.subProcesses || [];
    res.json([...subs].sort());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
const HF_TOKEN = process.env.HF_TOKEN || null;
// HuggingFace sentence-transformers endpoint (same model as local, zero RAM)
const HF_MODEL_URL = 'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2';

// ─── Local transformer extractor (development only) ────────────────────────────
let extractor = null;
async function getLocalExtractor() {
  if (IS_PRODUCTION) return null;
  if (!extractor) {
    const { pipeline } = await import('@xenova/transformers');
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
}

// ─── Cosine similarity ─────────────────────────────────────────────────────────
function cos_sim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ─── HuggingFace Inference API ─────────────────────────────────────────────────
// Sends texts to HF hosted model → returns pooled sentence embeddings.
// Zero local RAM usage. Free tier (rate-limited) or with HF_TOKEN for higher limits.
async function getHFEmbeddings(texts) {
  const inputs = Array.isArray(texts) ? texts : [texts];
  const headers = { 'Content-Type': 'application/json' };
  if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;

  const response = await fetch(HF_MODEL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ inputs, options: { wait_for_model: true } }),
    signal: AbortSignal.timeout(35000) // 35 second timeout
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HF API ${response.status}: ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  return data; // [[float,...], ...] — one embedding per input text
}

// Flatten an embedding in case it comes wrapped in an extra array
function flatEmbed(emb) {
  if (!emb) return [];
  if (Array.isArray(emb[0]) && typeof emb[0][0] === 'number') return emb[0];
  return emb;
}

// ─── Candidate cache (raw data only — no embeddings, tiny memory) ──────────────
let candidateCache = null;
let candidateCacheExpiry = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getCandidates() {
  const now = Date.now();
  if (candidateCache && now < candidateCacheExpiry) return candidateCache;

  const allActive = await Taxonomy.find({ isActive: true }).lean();
  const candidates = [];
  allActive.forEach(item => {
    item.subProcesses.forEach(sub => {
      candidates.push({
        majorProcess: item.majorProcess,
        process: item.process,
        subProcess: sub,
        department: item.department || null,
        tags: item.tags || []
      });
    });
  });

  candidateCache = candidates;
  candidateCacheExpiry = now + CACHE_TTL_MS;
  console.log(`Candidate cache built: ${candidates.length} candidates.`);
  return candidates;
}

function invalidateCandidateCache() {
  candidateCache = null;
  candidateCacheExpiry = 0;
}

// ─── String pre-filter score ───────────────────────────────────────────────────
// Used to quickly select top-50 candidates before the semantic API call.
// Tags contribute only 15% to avoid false positives (e.g. "hiring" tag on "Vendor Onboarding").
function getPreFilterScore(text, cand) {
  const lower = text.toLowerCase().trim();

  // Name-level string similarity
  const subSim = stringSimilarity.compareTwoStrings(lower, cand.subProcess.toLowerCase());
  const processSim = stringSimilarity.compareTwoStrings(lower, cand.process.toLowerCase());

  // Word-level overlap (handles partial matches like "travel" ↔ "Conveyance and Travel")
  const candWords = `${cand.majorProcess} ${cand.process} ${cand.subProcess}`
    .toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const inputWords = lower.split(/\W+/).filter(w => w.length > 2);
  let wordOverlap = 0;
  if (candWords.length > 0 && inputWords.length > 0) {
    const hits = inputWords.filter(w => candWords.some(cw => cw === w || cw.startsWith(w) || w.startsWith(cw)));
    wordOverlap = hits.length / Math.max(inputWords.length, 1);
  }

  // Tag matching — only for pre-filtering, capped at 15% contribution.
  // This ensures tagged entries appear in top-50 without dominating the final score.
  let tagScore = 0;
  for (const tag of cand.tags) {
    const tagWords = tag.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    if (tagWords.includes(lower) || inputWords.some(iw => tagWords.includes(iw))) {
      tagScore = 0.8;
      break;
    }
    const ts = stringSimilarity.compareTwoStrings(lower, tag.toLowerCase());
    if (ts > tagScore) tagScore = ts;
  }

  return subSim * 0.40 + processSim * 0.15 + wordOverlap * 0.30 + tagScore * 0.15;
}

// ─── mapActivity ───────────────────────────────────────────────────────────────
const mapActivity = async (req, res) => {
  try {
    const { text, department } = req.body;
    if (!text || text.trim().length < 3) {
      return res.status(400).json({ message: 'Input text too short for analysis.' });
    }

    // 1. Fetch candidates (DB or cache)
    const allCandidates = await getCandidates();
    if (!allCandidates.length) return res.json({ mapped: false, confidence: 0 });

    // 2. Department filter
    let candidates = allCandidates;
    if (department && department !== 'All Departments') {
      const filtered = allCandidates.filter(c => c.department === department || !c.department);
      if (filtered.length > 0) candidates = filtered;
    }

    // 3. Score candidates
    let scored;

    if (!IS_PRODUCTION) {
      // ── Development: local Xenova transformer (hybrid 70% semantic + 30% string) ──
      try {
        const extract = await getLocalExtractor();
        if (extract) {
          const textOut = await extract(text, { pooling: 'mean', normalize: true });
          const textEmb = Array.from(textOut.data);

          const BATCH = 64;
          const candTexts = candidates.map(c => `${c.majorProcess} - ${c.process} - ${c.subProcess}`);
          const allEmbs = [];
          for (let i = 0; i < candTexts.length; i += BATCH) {
            const out = await extract(candTexts.slice(i, i + BATCH), { pooling: 'mean', normalize: true });
            for (let j = 0; j < out.dims[0]; j++) {
              const start = j * out.dims[1];
              allEmbs.push(Array.from(out.data.slice(start, start + out.dims[1])));
            }
          }

          scored = candidates.map((c, i) => ({
            ...c,
            confidence: Math.round(
              (Math.max(0, cos_sim(textEmb, allEmbs[i])) * 0.70 +
               getPreFilterScore(text, c) * 0.30) * 100
            )
          }));
        } else {
          scored = candidates.map(c => ({ ...c, confidence: Math.round(getPreFilterScore(text, c) * 100) }));
        }
      } catch (e) {
        console.warn('Local NLP error, using string fallback:', e.message);
        scored = candidates.map(c => ({ ...c, confidence: Math.round(getPreFilterScore(text, c) * 100) }));
      }

    } else {
      // ── Production: HuggingFace API (semantic quality, zero RAM) ──────────────
      //
      // Two-stage approach:
      //   Stage 1 — fast CPU string pre-filter → pick top 50 candidates
      //   Stage 2 — ONE HF API call for [userText + 50 candidates] → re-rank semantically
      //
      // This gives the same quality as the local transformer with only ~1-3 seconds latency.

      // Stage 1: string pre-filter
      const preScored = candidates
        .map(c => ({ ...c, _pre: getPreFilterScore(text, c) }))
        .sort((a, b) => b._pre - a._pre)
        .slice(0, 50);

      try {
        // Stage 2: ONE HF API call — user text + all 50 candidates together
        const allTexts = [
          text,
          ...preScored.map(c => `${c.majorProcess} - ${c.process} - ${c.subProcess}`)
        ];

        const embeddings = await getHFEmbeddings(allTexts);
        const textEmbedding = flatEmbed(embeddings[0]);
        const candEmbeddings = embeddings.slice(1).map(flatEmbed);

        // 80% semantic cosine similarity + 20% string pre-filter score
        scored = preScored.map((c, i) => ({
          ...c,
          confidence: Math.round(
            (Math.max(0, cos_sim(textEmbedding, candEmbeddings[i])) * 0.80 +
             c._pre * 0.20) * 100
          )
        }));

        console.log(`[HF] Mapped "${text}" → top match: "${scored.sort((a,b)=>b.confidence-a.confidence)[0]?.subProcess}" (${scored[0]?.confidence}%)`);

      } catch (hfErr) {
        // HF API unavailable → fall back to string similarity only for top 50
        console.warn('HF API unavailable, using string similarity only:', hfErr.message);
        scored = preScored.map(c => ({ ...c, confidence: Math.round(c._pre * 100) }));
      }
    }

    // 4. Sort by confidence
    scored.sort((a, b) => b.confidence - a.confidence);
    const best = scored[0];

    // 5. Build unique alternatives
    const seenSubs = new Set([best.subProcess]);
    const alternatives = [];
    for (let i = 1; i < scored.length; i++) {
      if (alternatives.length >= 3) break;
      if (!seenSubs.has(scored[i].subProcess)) {
        seenSubs.add(scored[i].subProcess);
        alternatives.push(scored[i]);
      }
    }

    const altPayload = alternatives.map(a => ({
      majorProcess: a.majorProcess,
      process: a.process,
      subProcess: a.subProcess,
      confidence: a.confidence
    }));

    // 6. Low confidence → noMatch with closest suggestion
    if (best.confidence < 35) {
      return res.json({
        mapped: true,
        noMatch: true,
        message: "No exact matches found (HR & Finance only).",
        suggestion: { majorProcess: best.majorProcess, process: best.process, subProcess: best.subProcess },
        alternatives: altPayload,
        confidence: best.confidence,
        reason: "Closest suggestion"
      });
    }

    // 7. Audit log
    if (best.confidence > 50) {
      await logAction({
        req, action: 'NLP_MAPPING_MATCH', targetType: 'Taxonomy', targetId: 'NLP_ENGINE',
        description: `Mapped "${text.substring(0, 50)}" to ${best.subProcess} (${best.confidence}%)`
      });
    }

    // 8. Return result
    res.json({
      mapped: true,
      suggestion: { majorProcess: best.majorProcess, process: best.process, subProcess: best.subProcess },
      alternatives: altPayload,
      confidence: best.confidence,
      reason: `Best match for "${text}"`
    });

  } catch (err) {
    console.error('Mapping Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// ─── Taxonomy CRUD ─────────────────────────────────────────────────────────────
const createTaxonomy = async (req, res) => {
  try {
    const { majorProcess, process, subProcesses, department } = req.body;
    let entry = await Taxonomy.findOne({ majorProcess, process });
    const isNew = !entry;
    const prevSubProcesses = entry ? [...entry.subProcesses] : [];

    if (entry) {
      entry.subProcesses = [...new Set([...entry.subProcesses, ...subProcesses])];
      await entry.save();
    } else {
      entry = await Taxonomy.create({ majorProcess, process, subProcesses, department, isActive: true });
    }

    await logAction({
      req, action: 'TAXONOMY_SAVED', targetType: 'Taxonomy', targetId: entry._id,
      description: `${isNew ? 'Created' : 'Updated'} taxonomy entry for ${majorProcess} / ${process}`,
      prev: isNew ? null : { subProcesses: prevSubProcesses },
      next: { subProcesses: entry.subProcesses }
    });

    invalidateCandidateCache();
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateTaxonomy = async (req, res) => {
  try {
    const { id } = req.params;
    const { majorProcess, process, subProcesses, department } = req.body;
    const entry = await Taxonomy.findById(id);
    if (!entry) return res.status(404).json({ message: 'Taxonomy entry not found.' });

    const prev = { majorProcess: entry.majorProcess, process: entry.process, subProcesses: entry.subProcesses, department: entry.department };

    if (typeof majorProcess === 'string' && majorProcess.trim()) entry.majorProcess = majorProcess.trim();
    if (typeof process === 'string' && process.trim()) entry.process = process.trim();
    if (Array.isArray(subProcesses)) entry.subProcesses = subProcesses.map(s => String(s).trim()).filter(Boolean);

    if (!department || department === 'All Departments' || String(department).trim() === '') {
      entry.department = undefined;
    } else {
      entry.department = String(department).trim();
    }

    await entry.save();

    await logAction({
      req, action: 'TAXONOMY_UPDATED', targetType: 'Taxonomy', targetId: entry._id,
      description: `Updated taxonomy entry for ${entry.majorProcess} / ${entry.process}`,
      prev, next: { majorProcess: entry.majorProcess, process: entry.process, subProcesses: entry.subProcesses, department: entry.department }
    });

    invalidateCandidateCache();
    res.json(entry);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: 'A taxonomy with this major process and process already exists.' });
    res.status(500).json({ message: err.message });
  }
};

const deleteTaxonomy = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await Taxonomy.findById(id);
    if (!entry) return res.status(404).json({ message: 'Taxonomy entry not found.' });

    entry.isActive = false;
    await entry.save();

    await logAction({
      req, action: 'TAXONOMY_DELETED', targetType: 'Taxonomy', targetId: entry._id,
      description: `Soft deleted taxonomy entry for ${entry.majorProcess} / ${entry.process}`,
      prev: { majorProcess: entry.majorProcess, process: entry.process, isActive: true },
      next: { isActive: false }
    });

    invalidateCandidateCache();
    res.json({ message: 'Taxonomy deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { mapActivity, createTaxonomy, updateTaxonomy, deleteTaxonomy, getMajorProcesses, getProcessesByMajor, getSubProcessesByProcess };

