const express = require('express');
const router = express.Router();
const { getSixBySixData, createProcessRecord, bulkUpdateProcessRecords } = require('../controllers/analysisController');
const verifyToken = require('../middleware/verifyToken');
const { resolveTenantScope } = require('../middleware/tenantContext');
const requireRoles = require('../middleware/roleAccess');

router.get('/six-by-six', verifyToken, requireRoles(['manager', 'admin', 'company_admin', 'super_admin']), resolveTenantScope({ required: true }), getSixBySixData);
router.post('/six-by-six', verifyToken, requireRoles(['manager', 'admin', 'company_admin', 'super_admin']), resolveTenantScope({ required: true }), createProcessRecord);
router.put('/six-by-six', verifyToken, requireRoles(['manager', 'admin', 'company_admin', 'super_admin']), resolveTenantScope({ required: true }), bulkUpdateProcessRecords);

module.exports = router;
