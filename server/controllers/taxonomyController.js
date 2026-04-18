const Taxonomy = require('../models/Taxonomy');
const stringSimilarity = require('string-similarity');
const { logAction } = require('../utils/auditLogger');

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

    // 2. Build candidates and calculate scores
    const stopwords = new Set(['the', 'and', 'a', 'of', 'for', 'with', 'to', 'in', 'on', 'at', 'by', 'an', 'is']);
    const inputWords = text.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stopwords.has(w));
    
    const scoredCandidates = [];
    allTaxonomy.forEach(item => {
      const itemTags = (item.tags || []).map(t => t.toLowerCase());
      
      item.subProcesses.forEach(sub => {
        const subWords = sub.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stopwords.has(w));
        
        // Baseline: String Similarity
        const baseline = stringSimilarity.compareTwoStrings(text.toLowerCase(), sub.toLowerCase());
        
        // Boost 1: Word Overlap (Intersection)
        const overlap = inputWords.filter(w => subWords.includes(w)).length;
        const overlapBonus = overlap > 0 ? (overlap / Math.max(inputWords.length, 1)) * 0.4 : 0;
        
        // Boost 2: Tag Matching
        const tagMatch = inputWords.some(w => itemTags.includes(w));
        const tagBonus = tagMatch ? 0.2 : 0;
        
        const finalConfidence = Math.min(99, Math.round((baseline * 0.4 + overlapBonus + tagBonus) * 100));
        
        scoredCandidates.push({
          majorProcess: item.majorProcess,
          process: item.process,
          subProcess: sub,
          confidence: finalConfidence
        });
      });
    });

    // 3. Sort and filter
    scoredCandidates.sort((a, b) => b.confidence - a.confidence);
    const best = scoredCandidates[0];
    const alternatives = scoredCandidates
      .slice(1, 4)
      .filter(c => c.confidence > 25 && c.subProcess !== best.subProcess);

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

    if (best.confidence < 25) {
      return res.json({ mapped: false, confidence: best.confidence });
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
      confidence: best.confidence
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
