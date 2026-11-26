const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const { resolveTenantScope } = require('../middleware/tenantContext');
const requireRoles = require('../middleware/roleAccess');
const {
  createRequest,
  getMyRequests,
  getAdminRequests,
  approveRequest,
  rejectRequest
} = require('../controllers/activityRequestController');

// Employee routes
router.post('/', verifyToken, resolveTenantScope({ required: false }), createRequest);
router.get('/my', verifyToken, resolveTenantScope({ required: false }), getMyRequests);

// Admin / Reviewer routes
router.get('/admin', verifyToken, requireRoles(['admin', 'manager', 'company_admin', 'super_admin']), resolveTenantScope({ required: true }), getAdminRequests);
router.patch('/:id/approve', verifyToken, requireRoles(['admin', 'manager', 'company_admin', 'super_admin']), resolveTenantScope({ required: true }), approveRequest);
router.patch('/:id/reject', verifyToken, requireRoles(['admin', 'manager', 'company_admin', 'super_admin']), resolveTenantScope({ required: true }), rejectRequest);

module.exports = router;
