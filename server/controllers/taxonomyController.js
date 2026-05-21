const Taxonomy = require('../models/Taxonomy');
const { logAction } = require('../utils/auditLogger');

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

const mapActivity = async (req, res) => {
  try {
    const { text, department } = req.body;

    if (!text || text.trim().length < 3) {
      return res.status(400).json({ message: 'Input text too short for analysis.' });
    }

    // 1. Fetch active taxonomy with tags
    const query = { isActive: true };
    if (department && department !== 'All Departments') {
      query.$or = [{ department }, { department: { $exists: false } }, { department: null }];
    }
    const allTaxonomy = await Taxonomy.find(query).lean();

    if (!allTaxonomy.length) {
      return res.json({ mapped: false, confidence: 0 });
    }

    // 2. Prepare candidates
    const candidates = [];
    allTaxonomy.forEach(item => {
      item.subProcesses.forEach(sub => {
        candidates.push({ majorProcess: item.majorProcess, process: item.process, subProcess: sub });
      });
    });

    if (!candidates.length) {
      return res.json({ mapped: false, confidence: 0 });
    }

    // 3. Semantic Similarity Match
    const extract = await getExtractor();
    const textOutput = await extract(text, { pooling: 'mean', normalize: true });
    const textEmbedding = Array.from(textOutput.data);

    const candidateTexts = candidates.map(c => c.subProcess);
    const candidateOutputs = await extract(candidateTexts, { pooling: 'mean', normalize: true });
    
    candidates.forEach((cand, i) => {
        const startIdx = i * candidateOutputs.dims[1];
        const endIdx = startIdx + candidateOutputs.dims[1];
        const candEmbedding = candidateOutputs.data.slice(startIdx, endIdx);
        
        // Compute cosine similarity and map to 0-100 confidence
        cand.confidence = Math.max(0, Math.round(cos_sim(textEmbedding, candEmbedding) * 100));
    });

    // Sort and filter
    candidates.sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0];
    
    // We want unique alternative subProcesses
    const seenSubs = new Set([best.subProcess]);
    const alternatives = [];
    for (let i = 1; i < candidates.length; i++) {
        if (alternatives.length >= 3) break;
        if (!seenSubs.has(candidates[i].subProcess) && candidates[i].confidence > 25) {
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

    if (best.confidence < 35) {
      return res.json({
        mapped: false,
        message: 'No clear match found. Please use a more descriptive activity name.',
        confidence: best.confidence
      });
    }

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

    res.json({ message: 'Taxonomy deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { mapActivity, createTaxonomy, updateTaxonomy, deleteTaxonomy };
