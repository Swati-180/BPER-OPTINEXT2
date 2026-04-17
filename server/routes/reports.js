const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const {
  getDashboardReport,
  getUtilizationReport,
  getFteSummaryReport,
  getFteConsolidationSummaryReport,
  getFitmentSummaryReport,
} = require('../controllers/reportsController');

const router = express.Router();

router.get('/dashboard', verifyToken, getDashboardReport);
router.get('/utilization', verifyToken, getUtilizationReport);
router.get('/fte-summary', verifyToken, getFteSummaryReport);
router.get('/fte-consolidation-summary', verifyToken, getFteConsolidationSummaryReport);
router.get('/fitment-summary', verifyToken, getFitmentSummaryReport);

module.exports = router;
