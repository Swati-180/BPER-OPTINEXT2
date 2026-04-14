const ProcessAnalysis = require('../models/ProcessAnalysis');

const getSixBySixData = async (req, res) => {
  try {
    const { department } = req.query;
    const query = department && department !== 'All Departments' ? { department } : {};
    const data = await ProcessAnalysis.find(query).sort({ department: 1, type: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createProcessRecord = async (req, res) => {
  try {
    const record = await ProcessAnalysis.create(req.body);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getSixBySixData, createProcessRecord };
