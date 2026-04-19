const Taxonomy = require('../models/Taxonomy');
const stringSimilarity = require('string-similarity');

const mapActivityToTaxonomy = async (req, res) => {
  try {
    const { text, context, department } = req.body;

    if (!text || text.trim().length < 3) {
      return res.status(400).json({ message: 'Input text too short for analysis.' });
    }

    // 1. Fetch all active taxonomy entries
    const query = { isActive: true };
    // Optionally filter by department if provided (PRD Task 12)
    if (department && department !== 'All Departments') {
       query.$or = [{ department: department }, { department: { $exists: false } }, { department: null }];
    }
    
    const taxonomyData = await Taxonomy.find(query).lean();

    if (!taxonomyData.length) {
      return res.status(404).json({ message: 'No taxonomy data found in database.' });
    }

    // 2. Prepare candidates list
    // We want to map against subProcesses but keep track of their parents
    const candidates = [];
    taxonomyData.forEach(item => {
      item.subProcesses.forEach(sub => {
        candidates.push({
          majorProcess: item.majorProcess,
          process: item.process,
          subProcess: sub,
          displayText: `${item.majorProcess} ${item.process} ${sub}`
        });
      });
    });

    if (!candidates.length) {
      return res.status(404).json({ message: 'No sub-processes found in taxonomy.' });
    }

    // 3. Find Best Match
    const matches = stringSimilarity.findBestMatch(text, candidates.map(c => c.subProcess));
    const bestMatch = candidates[matches.bestMatchIndex];
    const confidence = Math.round(matches.bestMatch.rating * 100);

    // 4. Return Suggestion
    // Logic: If confidence > 30%, we suggest it. Otherwise, we say no clear match.
    if (confidence < 30) {
      return res.json({
        mapped: false,
        message: 'No clear match found. Please use a more descriptive activity name.',
        confidence
      });
    }

    res.json({
      mapped: true,
      suggestion: {
        majorProcess: bestMatch.majorProcess,
        process: bestMatch.process,
        subProcess: bestMatch.subProcess
      },
      confidence,
      reason: `High semantic overlap with ${bestMatch.subProcess}`
    });

  } catch (err) {
    console.error('NLP Mapping Error:', err);
    res.status(500).json({ message: 'Internal server error during NLP mapping.' });
  }
};

module.exports = { mapActivityToTaxonomy };
