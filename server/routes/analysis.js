const express = require('express');
const router = express.Router();
const { getSixBySixData, createProcessRecord, bulkUpdateProcessRecords } = require('../controllers/analysisController');
const verifyToken = require('../middleware/verifyToken');

router.get('/six-by-six', verifyToken, getSixBySixData);
router.post('/six-by-six', verifyToken, createProcessRecord);
router.put('/six-by-six', verifyToken, bulkUpdateProcessRecords);

module.exports = router;
