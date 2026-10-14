const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const requireRoles = require('../middleware/roleAccess');
const {
  createRequest,
  getMyRequests,
  getAdminRequests,
  approveRequest,
  rejectRequest
} = require('../controllers/activityRequestController');

// Employee routes
router.post('/', verifyToken, createRequest);
router.get('/my', verifyToken, getMyRequests);

// Admin / Reviewer routes
router.get('/admin', verifyToken, requireRoles(['admin', 'manager']), getAdminRequests);
router.patch('/:id/approve', verifyToken, requireRoles(['admin', 'manager']), approveRequest);
router.patch('/:id/reject', verifyToken, requireRoles(['admin', 'manager']), rejectRequest);

module.exports = router;
