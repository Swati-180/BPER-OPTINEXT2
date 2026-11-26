const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const { resolveTenantScope } = require('../middleware/tenantContext');
const {
  getDashboardReport,
  getUtilizationReport,
  getFteSummaryReport,
  getFteConsolidationSummaryReport,
  getFitmentSummaryReport,
  getFteAnalysisReport,
  getConsolidationAnalysisReport,
  getFitmentAnalysisReport,
  getUtilizationAnalysisReport,
  getWorkforceCapacityReport,
  getAuditLogs,
} = require('../controllers/reportsController');

const router = express.Router();

// Summary/Dashboard Reports
router.get('/dashboard', verifyToken, resolveTenantScope({ required: true }), getDashboardReport);
router.get('/utilization', verifyToken, resolveTenantScope({ required: true }), getUtilizationReport);
router.get('/fte-summary', verifyToken, resolveTenantScope({ required: true }), getFteSummaryReport);
router.get('/fte-consolidation-summary', verifyToken, resolveTenantScope({ required: true }), getFteConsolidationSummaryReport);
router.get('/fitment-summary', verifyToken, resolveTenantScope({ required: true }), getFitmentSummaryReport);

// Deep Analysis Reports (Phase 9)
router.get('/fte-analysis', verifyToken, resolveTenantScope({ required: true }), getFteAnalysisReport);
router.get('/consolidation-analysis', verifyToken, resolveTenantScope({ required: true }), getConsolidationAnalysisReport);
router.get('/fitment-analysis', verifyToken, resolveTenantScope({ required: true }), getFitmentAnalysisReport);
router.get('/utilization-analysis', verifyToken, resolveTenantScope({ required: true }), getUtilizationAnalysisReport);

// Workforce & Capacity Planning (Views A, B, C)
router.get('/workforce-capacity', verifyToken, resolveTenantScope({ required: true }), getWorkforceCapacityReport);
router.get('/audit-logs', verifyToken, resolveTenantScope({ required: true }), getAuditLogs);

module.exports = router;
