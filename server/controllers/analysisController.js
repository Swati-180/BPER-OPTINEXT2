const ProcessAnalysis = require('../models/ProcessAnalysis');

function computeScore(criteria = []) {
  if (!criteria || criteria.length === 0) return 0;
  
  // PRD: Group 1 (Performance - first 6) looking for 'H'
  const performanceScore = criteria.slice(0, 6).filter(val => val === 'H').length;
  
  // PRD: Group 2 (Characteristics - next 6) looking for 'L'
  const characteristicScore = criteria.slice(6, 12).filter(val => val === 'L').length;
  
  return performanceScore + characteristicScore;
}

function normalizeAnalysisRecord(record) {
  const score = typeof record.score === 'number' && Number.isFinite(record.score)
    ? record.score
    : computeScore(Array.isArray(record.criteria) ? record.criteria : []);

  return {
    ...record,
    score,
    consolidated: typeof record.consolidated === 'boolean' ? record.consolidated : score >= 7,
  };
}

function buildDepartmentFilter(department) {
  if (!department || department === 'All Departments') {
    return {};
  }

  if (department === 'F&A' || department === 'Finance & Accounting' || department === 'Finance & Accounts') {
    return { department: { $in: ['F&A', 'Finance & Accounting', 'Finance & Accounts'] } };
  }

  if (department === 'HR' || department === 'Human Resources') {
    return { department: { $in: ['HR', 'Human Resources'] } };
  }

  return { department };
}

const getSixBySixData = async (req, res) => {
  try {
    const { department } = req.query;
    console.log(`[6x6 Report] Fetching data for department: "${department}"`);
    const query = buildDepartmentFilter(department);

    const data = await ProcessAnalysis.find(query).sort({ department: 1, type: 1, process: 1 }).lean();
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
