const WDTSubmission = require('../models/WDTSubmission');
const User = require('../models/User');
const { logAction } = require('../utils/auditLogger');

const submitWDT = async (req, res) => {
  try {
    const { employee, month, year, payload } = req.body;
    
    // 1. Check Submission Window (20th to 31st)
    const today = new Date().getDate();
    const isOverride = process.env.FORCE_WINDOW_OPEN === 'true';
    if (today < 20 && !isOverride) {
      return res.status(403).json({ message: 'Submission window is not yet open for this period.' });
    }

    // 2. Validate hours against user's configured maximum
    const submittingUser = await User.findOne({
      $or: [
        { employeeId: employee?.employeeId },
        { email: employee?.email?.toLowerCase() }
      ]
    }).select('maxMonthlyHours role');

    const isAdmin = submittingUser?.role === 'admin';
    const maxHours = submittingUser?.maxMonthlyHours || 160;

    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const totalHours = rows.reduce((sum, row) => sum + Number(row.timeTakenHoursPerMonth || 0), 0);

    if (!isAdmin && totalHours > maxHours) {
      return res.status(400).json({
        message: `Total submitted hours (${totalHours.toFixed(1)}h) exceeds your configured monthly limit of ${maxHours}h. Please review your entries.`
      });
    }

    // 3. Check for Duplicates (Allow updates for 'Changes Requested')
    const existing = await WDTSubmission.findOne({ 
      $or: [
        { 'employee.employeeId': employee.employeeId },
        { 'employee.email': employee.email?.toLowerCase() }
      ],
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
        existing.pendingFrom = employee.supervisorName || 'Manager'; // Route to supervisor
        await existing.save();

        // Send resubmission notification email
        try {
          const { sendResubmissionEmail } = require('../utils/emailService');
          await sendResubmissionEmail(existing.employee, existing.referenceId);
        } catch (emailErr) {
          console.warn('[Email] Resubmission email failed silently:', emailErr.message);
        }

        return res.status(200).json(existing);
      }

      return res.status(409).json({ message: `A submission for ${month}/${year} already exists and is under review.` });
    }

    const record = await WDTSubmission.create(req.body);

    // Send submission confirmation email
    try {
      const { sendSubmissionConfirmationEmail } = require('../utils/emailService');
      await sendSubmissionConfirmationEmail(record.employee, record.referenceId);
    } catch (emailErr) {
      console.warn('[Email] Submission confirmation email failed silently:', emailErr.message);
    }

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
         const employeeQuery = [];
         if (currentUser.employeeId) {
           employeeQuery.push({ 'employee.employeeId': currentUser.employeeId });
         }
         if (currentUser.email) {
           employeeQuery.push({ 'employee.email': currentUser.email.toLowerCase() });
         }

         if (employeeQuery.length > 0) {
           query['$or'] = employeeQuery;
         } else {
           // Should not happen if authenticated, but for safety:
           return res.json([]);
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

    // Send review notification email to employee
    try {
      const { sendReviewNotificationEmail } = require('../utils/emailService');
      await sendReviewNotificationEmail(submission.employee, submission.referenceId, finalStatus, actualComment, managerName);
    } catch (emailErr) {
      console.warn('[Email] Review notification email failed silently:', emailErr.message);
    }

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
