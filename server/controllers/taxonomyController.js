const Taxonomy = require('../models/Taxonomy');
const stringSimilarity = require('string-similarity');
const { logAction } = require('../utils/auditLogger');

const mapActivity = async (req, res) => {
  try {
    const { text, department } = req.body;

    if (!text || text.trim().length < 3) {
      return res.status(400).json({ message: 'Input text too short for analysis.' });
    }

    // 1. Fetch active taxonomy
    const query = { isActive: true };
    if (department && department !== 'All Departments') {
      query.$or = [{ department }, { department: { $exists: false } }, { department: null }];
    }
    const allTaxonomy = await Taxonomy.find(query).lean();

    if (!allTaxonomy.length) {
      return res.json({ mapped: false, confidence: 0 });
    }

    // 2. Build candidates
    const candidates = [];
    allTaxonomy.forEach(item => {
      item.subProcesses.forEach(sub => {
        candidates.push({
          majorProcess: item.majorProcess,
          process: item.process,
          subProcess: sub,
          // Weighted search string
          searchString: `${item.process} ${sub}`.toLowerCase()
        });
      });
    });

    // 3. Find Best Match using string-similarity
    const matches = stringSimilarity.findBestMatch(text.toLowerCase(), candidates.map(c => c.searchString));
    const best = candidates[matches.bestMatchIndex];
    let confidence = Math.round(matches.bestMatch.rating * 100);

    // AI Boost: If there is a very high word overlap, boost confidence
    const inputWords = text.toLowerCase().split(/\W+/);
    const matchWords = best.subProcess.toLowerCase().split(/\W+/);
    const overlap = inputWords.filter(w => w.length > 2 && matchWords.includes(w)).length;
    if (overlap >= 2) confidence = Math.max(confidence, 75);

    if (confidence < 25) {
      return res.json({ mapped: false, confidence });
    }

    res.json({
      mapped: true,
      suggestion: {
        majorProcess: best.majorProcess,
        process: best.process,
        subProcess: best.subProcess
      },
      confidence: Math.min(confidence, 99)
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

module.exports = { mapActivity, createTaxonomy };
