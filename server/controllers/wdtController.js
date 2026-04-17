const WDTSubmission = require('../models/WDTSubmission');
const User = require('../models/User');

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
    
    // Fetch the logged-in user to evaluate role and access
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) return res.status(404).json({ message: 'User not found' });

    let query = {};

    // Standard filter by department if provided via query param
    if (department && department !== 'All Departments') {
       query['employee.department'] = department;
    }

    // Role-based filtering
    if (currentUser.role !== 'admin') {
       if (currentUser.userType === 'manager') {
         // Managers see their own department OR forms explicitly pending from them
         query['$or'] = [
            { 'employee.department': currentUser.department },
            { pendingFrom: currentUser.name }
         ];
       } else {
         // Employees only see their own submissions
         query['employee.employeeId'] = currentUser.employeeId;
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

module.exports = { submitWDT, getSubmissions, updateSubmissionStatus, getSubmissionByRefId };
