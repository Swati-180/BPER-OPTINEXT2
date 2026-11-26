const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const { resolveTenantScope } = require('../middleware/tenantContext');
const { exportWDTSubmissionsExcel, exportFTEReportExcel } = require('../controllers/exportController');

router.get('/wdt-submissions', verifyToken, resolveTenantScope({ required: true }), exportWDTSubmissionsExcel);
router.get('/fte-report', verifyToken, resolveTenantScope({ required: true }), exportFTEReportExcel);

module.exports = router;
