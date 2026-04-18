const WDTSubmission = require('../models/WDTSubmission');
const User = require('../models/User');
const { logAction } = require('../utils/auditLogger');

const submitWDT = async (req, res) => {
  try {
    const { employee, month, year } = req.body;
    
    // 1. Check Submission Window (20th to 31st)
    const today = new Date().getDate();
    const isOverride = process.env.FORCE_WINDOW_OPEN === 'true';
    if (today < 20 && !isOverride) {
      return res.status(403).json({ message: 'Submission window is not yet open for this period.' });
    }

    // 2. Check for Duplicates (Allow updates for 'Changes Requested')
    const existing = await WDTSubmission.findOne({ 
      'employee.employeeId': employee.employeeId, 
      month, 
      year 
    });

    if (existing) {
      if (existing.status === 'Approved') {
        return res.status(409).json({ message: `Submission for ${month}/${year} is already approved and locked.` });
      }
      
      if (existing.status === 'Changes Requested') {
        // Perform Update instead of Create
        Object.assign(existing, req.body);
        existing.status = 'Under Review';
        existing.pendingFrom = 'Manager'; // Reset to manager
        await existing.save();
        return res.status(200).json(existing);
      }

      return res.status(409).json({ message: `A submission for ${month}/${year} already exists and is under review.` });
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
    const isOverride = process.env.FORCE_WINDOW_OPEN === 'true';
    const isOpen = date >= 20 || isOverride;
    const daysUntilNext = isOpen ? 0 : 20 - date;
    
    res.json({
      isOpen,
      currentMonth: today.getMonth() + 1,
      currentYear: today.getFullYear(),
      daysUntilNext,
      message: isOpen ? (isOverride ? 'Submission Window is Open (Admin Override)' : 'Submission Window is Open') : `Opens in ${daysUntilNext} days`
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
    const isAdmin = currentUser.role === 'admin' || currentUser.email === 'admin@bper.com';
    
    if (!isAdmin) {
       if (currentUser.userType === 'manager' || currentUser.role === 'manager') {
         // Managers see their own department OR forms explicitly pending from them
         query['$or'] = [
            { 'employee.department': currentUser.department },
            { pendingFrom: currentUser.name }
         ];
       } else {
         // Employees only see their own submissions
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
    
    // Support granting edit by putting it back to 'Changes Requested' so employee can edit
    let finalStatus = status;
    let actualComment = comment;
    
    if (status === 'Grant Edit') {
       finalStatus = 'Changes Requested';
       actualComment = '[Administrative Unlock] ' + comment;
    }

    submission.status = finalStatus;
    submission.reviewHistory.unshift({
      reviewedAt: new Date(),
      managerName,
      status: finalStatus,
      comment: actualComment
    });
    
    // Provide a way to revert or re-assign pendingFrom if changes requested
    if (finalStatus === 'Changes Requested') {
      submission.pendingFrom = submission.employee.name; // sending it back to employee
    } else if (finalStatus === 'Approved') {
      submission.pendingFrom = 'NA';
    }
    
    await submission.save();

    // AUDIT LOG
    await logAction({
        req,
        action: status === 'Grant Edit' ? 'FORM_WINDOW_OVERRIDE' : 'SUBMISSION_REVIEWED',
        targetType: 'WDTSubmission',
        targetId: submission._id,
        description: status === 'Grant Edit' ? `Manager ${managerName} unlocked submission ${referenceId}` : `Manager ${managerName} reviewed submission ${referenceId} as ${finalStatus}`,
        prev: { status: submission.status }, 
        next: { status: finalStatus, comment: actualComment }
    });

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
