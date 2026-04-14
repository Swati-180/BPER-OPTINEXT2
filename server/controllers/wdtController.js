const WDTSubmission = require('../models/WDTSubmission');

const submitWDT = async (req, res) => {
  try {
    const record = await WDTSubmission.create(req.body);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getSubmissions = async (req, res) => {
  try {
    const { department } = req.query;
    const query = department && department !== 'All Departments' ? { 'employee.department': department } : {};
    const submissions = await WDTSubmission.find(query).sort({ submittedAt: -1 });
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateSubmissionStatus = async (req, res) => {
  try {
    const { referenceId } = req.params;
    const { status, comment, managerName } = req.body;
    
    const submission = await WDTSubmission.findOne({ referenceId });
    if (!submission) return res.status(404).json({ message: 'Submission not found' });
    
    submission.status = status;
    submission.reviewHistory.unshift({
      reviewedAt: new Date(),
      managerName,
      status,
      comment
    });
    
    await submission.save();
    res.json(submission);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getSubmissionByRefId = async (req, res) => {
  try {
    const { referenceId } = req.params;
    const submission = await WDTSubmission.findOne({ referenceId });
    if (!submission) return res.status(404).json({ message: 'Submission not found' });
    res.json(submission);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { submitWDT, getSubmissions, updateSubmissionStatus, getSubmissionByRefId };
