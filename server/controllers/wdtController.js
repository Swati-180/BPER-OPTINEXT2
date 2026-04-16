const WDTSubmission = require('../models/WDTSubmission');

const submitWDT = async (req, res) => {
  try {
    const { employee, month, year } = req.body;
    
    // 1. Check Submission Window (20th to 31st)
    const today = new Date().getDate();
    if (today < 20) {
      return res.status(403).json({ message: 'Submission window is not yet open for this period.' });
    }

    // 2. Check for Duplicates (Only for NEW submissions, not revisions)
    const existing = await WDTSubmission.findOne({ 
      'employee.employeeId': employee.employeeId, 
      month, 
      year 
    });

    if (existing) {
      return res.status(409).json({ message: `A submission for ${month}/${year} already exists.` });
    }

    const record = await WDTSubmission.create(req.body);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getSubmissionWindowStatus = async (req, res) => {
  try {
    const today = new Date();
    const date = today.getDate();
    const isOpen = date >= 20;
    const daysUntilNext = isOpen ? 0 : 20 - date;
    
    res.json({
      isOpen,
      currentMonth: today.getMonth() + 1,
      currentYear: today.getFullYear(),
      daysUntilNext,
      message: isOpen ? 'Submission Window is Open' : `Opens in ${daysUntilNext} days`
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getSubmissions = async (req, res) => {
  try {
    const { role, email } = req.user;
    let query = {};

    if (role === 'employee') {
      // Employees only see their own submissions
      query = { 'employee.email': email };
    } else {
      // Managers see based on department filter
      const { department } = req.query;
      query = department && department !== 'All Departments' ? { 'employee.department': department } : {};
    }

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

module.exports = { 
  submitWDT, 
  getSubmissions, 
  updateSubmissionStatus, 
  getSubmissionByRefId,
  getSubmissionWindowStatus 
};
