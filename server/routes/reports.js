const express = require('express');
const verifyToken = require('../middleware/verifyToken');
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
} = require('../controllers/reportsController');

const router = express.Router();

// Summary/Dashboard Reports
router.get('/dashboard', verifyToken, getDashboardReport);
router.get('/utilization', verifyToken, getUtilizationReport);
router.get('/fte-summary', verifyToken, getFteSummaryReport);
router.get('/fte-consolidation-summary', verifyToken, getFteConsolidationSummaryReport);
router.get('/fitment-summary', verifyToken, getFitmentSummaryReport);

// Deep Analysis Reports (Phase 9)
router.get('/fte-analysis', verifyToken, getFteAnalysisReport);
router.get('/consolidation-analysis', verifyToken, getConsolidationAnalysisReport);
router.get('/fitment-analysis', verifyToken, getFitmentAnalysisReport);
router.get('/utilization-analysis', verifyToken, getUtilizationAnalysisReport);

module.exports = router;
