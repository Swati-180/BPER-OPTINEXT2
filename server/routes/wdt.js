const express = require('express');
const router = express.Router();
const { submitWDT, getSubmissions, updateSubmissionStatus, getSubmissionByRefId, getSubmissionWindowStatus } = require('../controllers/wdtController');
const verifyToken = require('../middleware/verifyToken');
const { resolveTenantScope } = require('../middleware/tenantContext');
const requireRoles = require('../middleware/roleAccess');

router.post('/submit', verifyToken, resolveTenantScope({ required: false }), submitWDT);
router.get('/submissions', verifyToken, resolveTenantScope({ required: true }), getSubmissions);
router.get('/window-status', getSubmissionWindowStatus);
router.get('/submissions/:referenceId', verifyToken, getSubmissionByRefId);
router.patch('/submissions/:referenceId', verifyToken, requireRoles(['manager', 'admin', 'company_admin', 'super_admin']), updateSubmissionStatus);

module.exports = router;
