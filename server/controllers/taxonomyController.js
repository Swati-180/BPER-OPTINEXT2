const Taxonomy = require('../models/Taxonomy');
const { logAction } = require('../utils/auditLogger');
const stringSimilarity = require('string-similarity');

// Only load the transformer model in development.
// The Xenova model uses >512MB RAM which crashes Render's free tier (512MB limit).
// In production we use pure string + tag similarity which works well with our seeded synonym tags.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let extractor = null;
async function getExtractor() {
  if (IS_PRODUCTION) return null;
  if (!extractor) {
    const { pipeline } = await import('@xenova/transformers');
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
}

function cos_sim(a, b) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Lightweight candidate cache — stores only raw data (no embeddings), tiny memory footprint
let candidateCache = null;
let candidateCacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getCandidates() {
  const now = Date.now();
  if (candidateCache && now < candidateCacheExpiry) {
    return candidateCache;
  }
  console.log('Building taxonomy candidate cache...');
  const allActive = await Taxonomy.find({ isActive: true }).lean();
  const candidates = [];
  allActive.forEach(item => {
    item.subProcesses.forEach(sub => {
      candidates.push({
        majorProcess: item.majorProcess,
        process: item.process,
        subProcess: sub,
        department: item.department,
        tags: item.tags || []
      });
    });
  });
  candidateCache = candidates;
  candidateCacheExpiry = now + CACHE_TTL_MS;
  console.log(`Taxonomy candidate cache built with ${candidates.length} items.`);
  return candidates;
}

function invalidateCandidateCache() {
  candidateCache = null;
  candidateCacheExpiry = 0;
}

/**
 * Score a candidate against user input using string similarity + tag matching.
 * Returns a score 0-100.
 * This works well because all taxonomy entries have been seeded with synonym tags.
 */
function scoreCandidate(text, cand) {
  const lowerText = text.toLowerCase().trim();

  // 1. Direct match against subProcess name
  const subSim = stringSimilarity.compareTwoStrings(lowerText, cand.subProcess.toLowerCase());

  // 2. Match against full hierarchy string
  const fullHierarchy = `${cand.majorProcess} ${cand.process} ${cand.subProcess}`.toLowerCase();
  const fullSim = stringSimilarity.compareTwoStrings(lowerText, fullHierarchy);

  // 3. Keyword overlap — split input and subProcess into words and count matches
  const subWords = cand.subProcess.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const inputWords = lowerText.split(/\W+/).filter(w => w.length > 2);
  let wordOverlapScore = 0;
  if (subWords.length > 0 && inputWords.length > 0) {
    const matches = inputWords.filter(w => subWords.some(sw => sw.includes(w) || w.includes(sw)));
    wordOverlapScore = matches.length / Math.max(inputWords.length, subWords.length);
  }

  // 4. Tag matching — seeded synonyms give broad domain coverage
  let bestTagSim = 0;
  for (const tag of cand.tags) {
    const tagLower = tag.toLowerCase();
    // Bigram similarity
    const tagSim = stringSimilarity.compareTwoStrings(lowerText, tagLower);
    if (tagSim > bestTagSim) bestTagSim = tagSim;
    // Substring check — e.g. "money" inside tag "money transfer"
    if (tagLower.includes(lowerText) || lowerText.includes(tagLower)) {
      bestTagSim = Math.max(bestTagSim, 0.80);
    }
  }

  // 5. Substring bonus — if user's input appears directly in the subProcess name
  let substringBonus = 0;
  if (cand.subProcess.toLowerCase().includes(lowerText)) substringBonus = 0.25;
  else if (lowerText.length > 3 && cand.majorProcess.toLowerCase().includes(lowerText)) substringBonus = 0.15;

  // 6. Weighted blend
  const blended = (subSim * 0.30) + (fullSim * 0.10) + (wordOverlapScore * 0.20) + (bestTagSim * 0.30) + substringBonus;

  // If tag is a very strong hit, let it dominate
  const final = bestTagSim >= 0.75 ? Math.max(blended, bestTagSim) : blended;

  return Math.min(100, Math.round(final * 100));
}

const mapActivity = async (req, res) => {
  try {
    const { text, department } = req.body;

    if (!text || text.trim().length < 3) {
      return res.status(400).json({ message: 'Input text too short for analysis.' });
    }

    // 1. Fetch lightweight candidates from cache / DB
    const allCandidates = await getCandidates();

    if (!allCandidates.length) {
      return res.json({ mapped: false, confidence: 0 });
    }

    // 2. Filter by department if specified
    let candidates = allCandidates;
    if (department && department !== 'All Departments') {
      const deptFiltered = allCandidates.filter(c => c.department === department || !c.department);
      if (deptFiltered.length > 0) candidates = deptFiltered;
      // else keep all candidates as fallback
    }

    // 3. Score candidates
    let scored;
    if (!IS_PRODUCTION) {
      // Development: try hybrid semantic + string similarity
      try {
        const extract = await getExtractor();
        if (extract) {
          console.log('Using semantic similarity (dev mode)...');
          const textOutput = await extract(text, { pooling: 'mean', normalize: true });
          const textEmbedding = Array.from(textOutput.data);

          const batchSize = 64;
          const candidateTexts = candidates.map(c => `${c.majorProcess} - ${c.process} - ${c.subProcess}`);
          const allEmbeddings = [];
          for (let i = 0; i < candidateTexts.length; i += batchSize) {
            const batchOut = await extract(candidateTexts.slice(i, i + batchSize), { pooling: 'mean', normalize: true });
            allEmbeddings.push(...Array.from({ length: batchOut.dims[0] }, (_, j) => {
              const start = j * batchOut.dims[1];
              return Array.from(batchOut.data.slice(start, start + batchOut.dims[1]));
            }));
          }

          scored = candidates.map((cand, i) => {
            const cosScore = Math.max(0, cos_sim(textEmbedding, allEmbeddings[i]));
            const strScore = scoreCandidate(text, cand) / 100;
            return { ...cand, confidence: Math.round((cosScore * 0.70 + strScore * 0.30) * 100) };
          });
        } else {
          scored = candidates.map(c => ({ ...c, confidence: scoreCandidate(text, c) }));
        }
      } catch (nlpErr) {
        console.warn('NLP model error, using string similarity:', nlpErr.message);
        scored = candidates.map(c => ({ ...c, confidence: scoreCandidate(text, c) }));
      }
    } else {
      // Production: pure string + tag similarity (memory safe, no model loading)
      scored = candidates.map(c => ({ ...c, confidence: scoreCandidate(text, c) }));
    }

    // 4. Sort by confidence descending
    scored.sort((a, b) => b.confidence - a.confidence);
    const best = scored[0];

    // 5. Build unique alternatives list
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

    // 6. Low-confidence: return noMatch with closest suggestion
    if (best.confidence < 35) {
      return res.json({
        mapped: true,
        noMatch: true,
        message: "No exact matches found (HR & Finance only).",
        suggestion: {
          majorProcess: best.majorProcess,
          process: best.process,
          subProcess: best.subProcess
        },
        alternatives: altPayload,
        confidence: best.confidence,
        reason: "Closest suggestion"
      });
    }

    // 7. Audit log for high-confidence matches
    if (best.confidence > 50) {
      await logAction({
        req,
        action: 'NLP_MAPPING_MATCH',
        targetType: 'Taxonomy',
        targetId: 'NLP_ENGINE',
        description: `Mapped "${text.substring(0, 50)}" to ${best.subProcess} (${best.confidence}%)`
      });
    }

    // 8. Return best match
    res.json({
      mapped: true,
      suggestion: {
        majorProcess: best.majorProcess,
        process: best.process,
        subProcess: best.subProcess
      },
      alternatives: altPayload,
      confidence: best.confidence,
      reason: `Best match for "${text}"`
    });

  } catch (err) {
    console.error('Mapping Error:', err);
    res.status(500).json({ message: err.message });
  }
};

const createTaxonomy = async (req, res) => {
  try {
    const { majorProcess, process, subProcesses, department } = req.body;
    
    let entry = await Taxonomy.findOne({ majorProcess, process });
    const isNew = !entry;
    const prevSubProcesses = entry ? [...entry.subProcesses] : [];
    
    if (entry) {
      const existingSubs = entry.subProcesses || [];
      const nextSubs = [...new Set([...existingSubs, ...subProcesses])];
      entry.subProcesses = nextSubs;
      await entry.save();
    } else {
      entry = await Taxonomy.create({
        majorProcess,
        process,
        subProcesses,
        department,
        isActive: true
      });
    }

    await logAction({
        req,
        action: 'TAXONOMY_SAVED',
        targetType: 'Taxonomy',
        targetId: entry._id,
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
    if (!entry) {
      return res.status(404).json({ message: 'Taxonomy entry not found.' });
    }

    const prev = {
      majorProcess: entry.majorProcess,
      process: entry.process,
      subProcesses: entry.subProcesses,
      department: entry.department,
    };

    if (typeof majorProcess === 'string' && majorProcess.trim()) {
      entry.majorProcess = majorProcess.trim();
    }
    if (typeof process === 'string' && process.trim()) {
      entry.process = process.trim();
    }
    if (Array.isArray(subProcesses)) {
      entry.subProcesses = subProcesses.map((s) => String(s).trim()).filter(Boolean);
    }

    if (department === null || department === undefined || department === 'All Departments' || String(department).trim() === '') {
      entry.department = undefined;
    } else {
      entry.department = String(department).trim();
    }

    await entry.save();

    await logAction({
      req,
      action: 'TAXONOMY_UPDATED',
      targetType: 'Taxonomy',
      targetId: entry._id,
      description: `Updated taxonomy entry for ${entry.majorProcess} / ${entry.process}`,
      prev,
      next: {
        majorProcess: entry.majorProcess,
        process: entry.process,
        subProcesses: entry.subProcesses,
        department: entry.department,
      },
    });

    invalidateCandidateCache();

    res.json(entry);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'A taxonomy with this major process and process already exists.' });
    }
    res.status(500).json({ message: err.message });
  }
};

const deleteTaxonomy = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await Taxonomy.findById(id);
    if (!entry) {
      return res.status(404).json({ message: 'Taxonomy entry not found.' });
    }

    entry.isActive = false;
    await entry.save();

    await logAction({
      req,
      action: 'TAXONOMY_DELETED',
      targetType: 'Taxonomy',
      targetId: entry._id,
      description: `Soft deleted taxonomy entry for ${entry.majorProcess} / ${entry.process}`,
      prev: {
        majorProcess: entry.majorProcess,
        process: entry.process,
        isActive: true,
      },
      next: {
        isActive: false,
      },
    });

    invalidateCandidateCache();

    res.json({ message: 'Taxonomy deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { mapActivity, createTaxonomy, updateTaxonomy, deleteTaxonomy };
