const ProcessAnalysis = require('../models/ProcessAnalysis');
const WDTSubmission = require('../models/WDTSubmission');

function computeScore(criteria = []) {
  return criteria.reduce((total, value) => {
    if (value === 'H') return total + 1;
    if (value === 'M') return total + 0.5;
    return total;
  }, 0);
}

function normalizeAnalysisRecord(record) {
  const score = typeof record.score === 'number' && Number.isFinite(record.score)
    ? record.score
    : computeScore(Array.isArray(record.criteria) ? record.criteria : []);

  return {
    ...record,
    score,
    consolidated: typeof record.consolidated === 'boolean' ? record.consolidated : score >= 8,
  };
}

const getSixBySixData = async (req, res) => {
  try {
    const { department } = req.query;
    
    // 1. Sync new processes from WDT submissions
    const matchStage = department && department !== 'All Departments' ? { 'employee.department': department } : {};
    
    const aggregatedProcesses = await WDTSubmission.aggregate([
       { $match: matchStage },
       { $unwind: '$payload.rows' },
       { 
         $group: {
           _id: { 
             process: '$payload.rows.subProcess', // Assuming subProcess represents the unique granular task
             department: '$employee.department',
             type: '$payload.rows.activityCategory'
           }
         }
       }
    ]);
    
    // 2. Insert any newly discovered processes blindly as stubs
    for (const item of aggregatedProcesses) {
      if (!item._id.process) continue;
      
      const exists = await ProcessAnalysis.findOne({
        process: item._id.process,
        department: item._id.department
      });
      
      if (!exists) {
        await ProcessAnalysis.create({
          process: item._id.process,
          department: item._id.department,
          type: item._id.type || 'core',
          criteria: Array(12).fill('-'),
          score: 0,
          consolidated: false
        });
      }
    }
    
    // 3. Query the fully populated list
    const query = department && department !== 'All Departments' ? { department } : {};
    const data = await ProcessAnalysis.find(query).sort({ department: 1, type: 1 }).lean();
    res.json(data.map(normalizeAnalysisRecord));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createProcessRecord = async (req, res) => {
  try {
    const payload = normalizeAnalysisRecord(req.body);
    const record = await ProcessAnalysis.create(payload);
    res.status(201).json(normalizeAnalysisRecord(record.toObject()));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const bulkUpdateProcessRecords = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ message: 'rows must be an array' });

    // Iterate safely to ensure the 'pre' save hooks apply securely computing the score natively 
    const results = [];
    for (const row of rows) {
      const record = await ProcessAnalysis.findById(row._id);
      if (record) {
         record.criteria = row.criteria;
         record.consolidated = row.consolidated;
         await record.save(); // pre-save hook handles calculating .score correctly!
         results.push(record);
      }
    }
    
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getSixBySixData, createProcessRecord, bulkUpdateProcessRecords };
