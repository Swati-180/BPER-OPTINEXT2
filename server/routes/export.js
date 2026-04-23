const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const { exportWDTSubmissionsExcel, exportFTEReportExcel } = require('../controllers/exportController');

router.get('/wdt-submissions', verifyToken, exportWDTSubmissionsExcel);
router.get('/fte-report', verifyToken, exportFTEReportExcel);

module.exports = router;
