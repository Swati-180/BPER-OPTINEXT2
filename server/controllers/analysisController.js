const ProcessAnalysis = require('../models/ProcessAnalysis');

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

module.exports = { getSixBySixData, createProcessRecord };
