const Taxonomy = require('../models/Taxonomy');
const { logAction } = require('../utils/auditLogger');
const stringSimilarity = require('string-similarity');


let extractor = null;
async function getExtractor() {
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

let globalCandidateCache = null;

async function getGlobalCandidateCache() {
  if (!globalCandidateCache) {
    console.log('Building AI Taxonomy candidate embeddings cache...');
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

    if (candidates.length > 0) {
      const extract = await getExtractor();
      const candidateTexts = candidates.map(c => {
        const tagsStr = c.tags && c.tags.length > 0 ? ` (tags: ${c.tags.join(', ')})` : '';
        return `${c.majorProcess} - ${c.process} - ${c.subProcess}${tagsStr}`;
      });

      const batchSize = 64;
      const allDataArrays = [];
      let embeddingDim = null;

      for (let i = 0; i < candidateTexts.length; i += batchSize) {
        const batchTexts = candidateTexts.slice(i, i + batchSize);
        const batchOutputs = await extract(batchTexts, { pooling: 'mean', normalize: true });
        embeddingDim = batchOutputs.dims[1];
        allDataArrays.push(Array.from(batchOutputs.data));
      }
      
      candidates.forEach((cand, i) => {
        const batchIdx = Math.floor(i / batchSize);
        const itemIdxInBatch = i % batchSize;
        const startIdx = itemIdxInBatch * embeddingDim;
        const endIdx = startIdx + embeddingDim;
        cand.embedding = allDataArrays[batchIdx].slice(startIdx, endIdx);
      });
      
      globalCandidateCache = candidates;
      console.log(`AI Taxonomy candidate embeddings cache built successfully with ${candidates.length} items (batched).`);
    } else {
      globalCandidateCache = [];
    }
  }
  return globalCandidateCache;
}

const mapActivity = async (req, res) => {
  try {
    const { text, department } = req.body;

    if (!text || text.trim().length < 3) {
      return res.status(400).json({ message: 'Input text too short for analysis.' });
    }

    // 1. Fetch or build the global cache
    const cachedCandidates = await getGlobalCandidateCache();

    if (!cachedCandidates.length) {
      return res.json({ mapped: false, confidence: 0 });
    }

    // 2. Clone and filter candidates by department in memory (thread-safe clones)
    let candidates = cachedCandidates.map(c => ({ ...c }));
    if (department && department !== 'All Departments') {
      candidates = candidates.filter(c => 
        c.department === department || !c.department
      );
    }

    if (!candidates.length) {
      return res.json({ mapped: false, confidence: 0 });
    }

    // 3. Semantic Similarity Match
    const extract = await getExtractor();
    const textOutput = await extract(text, { pooling: 'mean', normalize: true });
    const textEmbedding = Array.from(textOutput.data);
    
    candidates.forEach((cand) => {
        // Semantic similarity component (0.0 to 1.0)
        const cosSimScore = Math.max(0, cos_sim(textEmbedding, cand.embedding));
        
        // Lexical similarity component (0.0 to 1.0) - comparing user input with subProcess name
        const stringSimScore = stringSimilarity.compareTwoStrings(text.toLowerCase(), cand.subProcess.toLowerCase());
        
        // Lexical similarity component (0.0 to 1.0) - comparing user input with full hierarchy
        const fullStringSimScore = stringSimilarity.compareTwoStrings(text.toLowerCase(), `${cand.majorProcess} - ${cand.process} - ${cand.subProcess}`.toLowerCase());
        
        // Best string match
        let bestStringSim = Math.max(stringSimScore, fullStringSimScore);
        
        // Lexical similarity component (0.0 to 1.0) - comparing user input with individual tags
        if (cand.tags && cand.tags.length > 0) {
            cand.tags.forEach(tag => {
                const tagSim = stringSimilarity.compareTwoStrings(text.toLowerCase(), tag.toLowerCase());
                if (tagSim > bestStringSim) {
                    bestStringSim = tagSim;
                }
            });
        }
        
        // Hybrid confidence computation: 70% semantic, 30% lexical
        const combinedScore = (cosSimScore * 0.70) + (bestStringSim * 0.30);
        
        cand.confidence = Math.max(0, Math.round(combinedScore * 100));
    });

    // Sort and filter
    candidates.sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0];
    
    if (best.confidence < 35) {
      const seenSubs = new Set([best.subProcess]);
      const alternatives = [];
      for (let i = 1; i < candidates.length; i++) {
          if (alternatives.length >= 3) break;
          if (!seenSubs.has(candidates[i].subProcess)) {
              seenSubs.add(candidates[i].subProcess);
              alternatives.push(candidates[i]);
          }
      }
      return res.json({
        mapped: true,
        noMatch: true,
        message: "No exact matches found (HR & Finance only).",
        suggestion: {
          majorProcess: best.majorProcess,
          process: best.process,
          subProcess: best.subProcess
        },
        alternatives: alternatives.map(a => ({
          majorProcess: a.majorProcess,
          process: a.process,
          subProcess: a.subProcess,
          confidence: a.confidence
        })),
        confidence: best.confidence,
        reason: "Closest suggestion"
      });
    }
    
    // We want unique alternative subProcesses
    const seenSubs = new Set([best.subProcess]);
    const alternatives = [];
    for (let i = 1; i < candidates.length; i++) {
        if (alternatives.length >= 3) break;
        if (!seenSubs.has(candidates[i].subProcess)) {
            seenSubs.add(candidates[i].subProcess);
            alternatives.push(candidates[i]);
        }
    }

    // 4. Audit Log
    if (best.confidence > 50) {
      await logAction({
        req,
        action: 'NLP_MAPPING_MATCH',
        targetType: 'Taxonomy',
        targetId: 'NLP_ENGINE',
        description: `Mapped "${text.substring(0, 50)}..." to ${best.subProcess} (${best.confidence}%)`
      });
    }

    // Always return the closest match regardless of confidence score
    res.json({
      mapped: true,
      suggestion: {
        majorProcess: best.majorProcess,
        process: best.process,
        subProcess: best.subProcess
      },
      alternatives: alternatives.map(a => ({
        majorProcess: a.majorProcess,
        process: a.process,
        subProcess: a.subProcess,
        confidence: a.confidence
      })),
      confidence: best.confidence,
      reason: `High semantic overlap with ${best.subProcess}`
    });

  } catch (err) {
    console.error('NLP Error:', err);
    res.status(500).json({ message: err.message });
  }
};

const createTaxonomy = async (req, res) => {
  try {
    const { majorProcess, process, subProcesses, department } = req.body;
    
    // Check for existing to update or create simple one
    let entry = await Taxonomy.findOne({ majorProcess, process });
    const isNew = !entry;
    const prevSubProcesses = entry ? [...entry.subProcesses] : [];
    
    if (entry) {
      // Merge sub-processes
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

    // AUDIT LOG
    await logAction({
        req,
        action: 'TAXONOMY_SAVED',
        targetType: 'Taxonomy',
        targetId: entry._id,
        description: `${isNew ? 'Created' : 'Updated'} taxonomy entry for ${majorProcess} / ${process}`,
        prev: isNew ? null : { subProcesses: prevSubProcesses },
        next: { subProcesses: entry.subProcesses }
    });
    
    // Invalidate AI matching cache
    globalCandidateCache = null;
    
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

    // Invalidate AI matching cache
    globalCandidateCache = null;

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

    // Invalidate AI matching cache
    globalCandidateCache = null;

    res.json({ message: 'Taxonomy deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { mapActivity, createTaxonomy, updateTaxonomy, deleteTaxonomy };
