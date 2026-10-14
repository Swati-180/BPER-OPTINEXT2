const ActivityRequest = require('../models/ActivityRequest');
const Taxonomy = require('../models/Taxonomy');

/**
 * POST /api/activity-requests
 * Employee creates a request independently of BPER form.
 */
exports.createRequest = async (req, res) => {
  try {
    const { majorProcess, process, activityName, justification } = req.body;

    if (!majorProcess || !String(majorProcess).trim()) {
      return res.status(400).json({ message: 'Tower/Major Process is required.' });
    }
    if (!process || !String(process).trim()) {
      return res.status(400).json({ message: 'Process is required.' });
    }
    if (!activityName || !String(activityName).trim()) {
      return res.status(400).json({ message: 'Activity name is required.' });
    }
    if (!justification || !String(justification).trim()) {
      return res.status(400).json({ message: 'Justification is required.' });
    }

    const cleanMajor = String(majorProcess).trim();
    const cleanProcess = String(process).trim();
    const cleanActivity = String(activityName).trim();
    const cleanJustification = String(justification).trim();

    // Check if activity already exists in official taxonomy
    const existingTaxonomy = await Taxonomy.findOne({
      majorProcess: cleanMajor,
      process: cleanProcess,
      subProcesses: { $regex: new RegExp(`^${cleanActivity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (existingTaxonomy) {
      return res.status(409).json({
        message: 'This activity already exists in the official taxonomy.'
      });
    }

    // Check if identical request is already pending for this user
    const pendingDuplicate = await ActivityRequest.findOne({
      'employee.email': req.user.email,
      majorProcess: cleanMajor,
      process: cleanProcess,
      activityName: { $regex: new RegExp(`^${cleanActivity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      status: 'Pending'
    });

    if (pendingDuplicate) {
      return res.status(409).json({
        message: 'You already have a pending request for this activity.'
      });
    }

    const activityRequest = new ActivityRequest({
      employee: {
        userId: req.user.id || req.user._id,
        name: req.user.name || 'Employee',
        email: req.user.email,
        department: req.user.department || req.body.department || 'General',
        designation: req.user.designation || '',
        tower: cleanMajor
      },
      majorProcess: cleanMajor,
      process: cleanProcess,
      activityName: cleanActivity,
      justification: cleanJustification,
      status: 'Pending'
    });

    await activityRequest.save();

    res.status(201).json({
      message: 'Activity request submitted successfully.',
      request: activityRequest
    });
  } catch (err) {
    console.error('Error creating activity request:', err);
    res.status(500).json({ message: err.message || 'Failed to submit activity request.' });
  }
};

/**
 * GET /api/activity-requests/my
 * Employee fetches their own requests.
 */
exports.getMyRequests = async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user.id || req.user._id;

    const requests = await ActivityRequest.find({
      $or: [
        { 'employee.email': userEmail },
        ...(userId ? [{ 'employee.userId': userId }] : [])
      ]
    }).sort({ createdAt: -1 });

    res.json(requests);
  } catch (err) {
    console.error('Error fetching my activity requests:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch activity requests.' });
  }
};

/**
 * GET /api/activity-requests/admin
 * Admin/authorized manager retrieves requests for review with optional status filter.
 */
exports.getAdminRequests = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && ['Pending', 'Approved', 'Rejected'].includes(status)) {
      filter.status = status;
    }

    if (search && String(search).trim()) {
      const q = String(search).trim();
      filter.$or = [
        { 'employee.name': { $regex: q, $options: 'i' } },
        { 'employee.email': { $regex: q, $options: 'i' } },
        { majorProcess: { $regex: q, $options: 'i' } },
        { process: { $regex: q, $options: 'i' } },
        { activityName: { $regex: q, $options: 'i' } },
        { justification: { $regex: q, $options: 'i' } }
      ];
    }

    const requests = await ActivityRequest.find(filter).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error('Error fetching admin activity requests:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch activity requests.' });
  }
};

/**
 * PATCH /api/activity-requests/:id/approve
 * Admin/authorized manager approves a pending request.
 * Adds the activity to the official taxonomy without duplicates.
 * Concurrency-safe: atomically locks request status and safely updates taxonomy via $addToSet.
 */
exports.approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const reviewer = {
      userId: req.user.id || req.user._id,
      name: req.user.name || 'Admin Reviewer',
      email: req.user.email || ''
    };
    const reviewedAt = new Date();
    const adminRemarks = remarks ? String(remarks).trim() : 'Approved';

    // Step 1: Atomic conditional update of the request status from 'Pending' to 'Approved'
    const updatedRequest = await ActivityRequest.findOneAndUpdate(
      { _id: id, status: 'Pending' },
      {
        $set: {
          status: 'Approved',
          reviewedBy: reviewer,
          reviewedAt: reviewedAt,
          adminRemarks: adminRemarks,
          rejectionReason: ''
        }
      },
      { new: true }
    );

    if (!updatedRequest) {
      const existing = await ActivityRequest.findById(id);
      if (!existing) {
        return res.status(404).json({ message: 'Activity request not found.' });
      }
      return res.status(409).json({
        message: `Request has already been processed with status: ${existing.status}.`
      });
    }

    // Step 2: Atomic taxonomy insertion / deduplication
    const cleanActivity = updatedRequest.activityName.trim();
    const dept = updatedRequest.employee.department && updatedRequest.employee.department !== 'All' 
      ? updatedRequest.employee.department 
      : undefined;

    try {
      await Taxonomy.findOneAndUpdate(
        {
          majorProcess: updatedRequest.majorProcess,
          process: updatedRequest.process
        },
        {
          $addToSet: { subProcesses: cleanActivity },
          $setOnInsert: {
            majorProcess: updatedRequest.majorProcess,
            process: updatedRequest.process,
            department: dept,
            portal: 'all',
            isActive: true
          }
        },
        { upsert: true, new: true }
      );
    } catch (taxErr) {
      // If taxonomy update fails, rollback request status to Pending to avoid inconsistent state
      console.error('Taxonomy update failed during approval, rolling back request status:', taxErr);
      await ActivityRequest.findByIdAndUpdate(id, {
        $set: {
          status: 'Pending',
          reviewedBy: null,
          reviewedAt: null,
          adminRemarks: '',
          rejectionReason: ''
        }
      });
      throw new Error(`Failed to update taxonomy: ${taxErr.message}`);
    }

    res.json({
      message: 'Activity request approved and added to taxonomy successfully.',
      request: updatedRequest
    });
  } catch (err) {
    console.error('Error approving activity request:', err);
    res.status(500).json({ message: err.message || 'Failed to approve activity request.' });
  }
};

/**
 * PATCH /api/activity-requests/:id/reject
 * Admin/authorized manager rejects a pending request with mandatory reason.
 * Rejection must not alter official taxonomy or workload calculations.
 * Concurrency-safe: atomically locks request status from 'Pending' to 'Rejected'.
 */
exports.rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, remarks } = req.body;

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'A rejection reason is required.' });
    }

    const reviewer = {
      userId: req.user.id || req.user._id,
      name: req.user.name || 'Admin Reviewer',
      email: req.user.email || ''
    };
    const reviewedAt = new Date();
    const rejectionReason = String(reason).trim();
    const adminRemarks = remarks ? String(remarks).trim() : rejectionReason;

    // Atomic conditional status transition
    const updatedRequest = await ActivityRequest.findOneAndUpdate(
      { _id: id, status: 'Pending' },
      {
        $set: {
          status: 'Rejected',
          reviewedBy: reviewer,
          reviewedAt: reviewedAt,
          rejectionReason: rejectionReason,
          adminRemarks: adminRemarks
        }
      },
      { new: true }
    );

    if (!updatedRequest) {
      const existing = await ActivityRequest.findById(id);
      if (!existing) {
        return res.status(404).json({ message: 'Activity request not found.' });
      }
      return res.status(409).json({
        message: `Request has already been processed with status: ${existing.status}.`
      });
    }

    res.json({
      message: 'Activity request rejected.',
      request: updatedRequest
    });
  } catch (err) {
    console.error('Error rejecting activity request:', err);
    res.status(500).json({ message: err.message || 'Failed to reject activity request.' });
  }
};
