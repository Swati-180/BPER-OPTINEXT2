const WDTSubmission = require('../models/WDTSubmission');
const User = require('../models/User');

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
    const { department } = req.query;
    
    // Fetch the logged-in user to evaluate role and access
    const currentUser = await User.findById(req.user.userId || req.user.id);
    if (!currentUser) return res.status(404).json({ message: 'User not found' });

    let query = {};

    // Standard filter by department if provided via query param
    if (department && department !== 'All Departments') {
       query['employee.department'] = department;
    }

    // Role-based filtering
    if (currentUser.role !== 'admin') {
       if (currentUser.userType === 'manager' || currentUser.role === 'manager') {
         // Managers see their own department OR forms explicitly pending from them
         query['$or'] = [
            { 'employee.department': currentUser.department },
            { pendingFrom: currentUser.name }
         ];
       } else {
         // Employees only see their own submissions
         // Use employeeId if available, fallback to email
         if (currentUser.employeeId) {
             query['employee.employeeId'] = currentUser.employeeId;
         } else {
             query['employee.email'] = currentUser.email;
         }
       }
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
    let { status, comment, managerName } = req.body;
    
    const submission = await WDTSubmission.findOne({ referenceId });
    if (!submission) return res.status(404).json({ message: 'Submission not found' });
    
    // Support granting edit by putting it back to 'Under Review' but adding a note
    let finalStatus = status;
    if (status === 'Grant Edit') {
       finalStatus = 'Under Review';
       comment = '[Granted Edit Access] ' + comment;
    }

    submission.status = finalStatus;
    submission.reviewHistory.unshift({
      reviewedAt: new Date(),
      managerName,
      status: finalStatus,
      comment
    });
    
    // Provide a way to revert or re-assign pendingFrom if changes requested
    if (finalStatus === 'Changes Requested') {
      submission.pendingFrom = submission.employee.name; // sending it back to employee
    } else if (finalStatus === 'Approved') {
      submission.pendingFrom = 'NA';
    } else if (finalStatus === 'Under Review' && status === 'Grant Edit') {
      submission.pendingFrom = submission.employee.name; 
    }
    
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
