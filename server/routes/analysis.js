const express = require('express');
const router = express.Router();
const { getSixBySixData, createProcessRecord, bulkUpdateProcessRecords } = require('../controllers/analysisController');
const verifyToken = require('../middleware/verifyToken');
const requireRoles = require('../middleware/roleAccess');

router.get('/six-by-six', verifyToken, requireRoles(['manager', 'admin']), getSixBySixData);
router.post('/six-by-six', verifyToken, requireRoles(['manager', 'admin']), createProcessRecord);
router.put('/six-by-six', verifyToken, requireRoles(['manager', 'admin']), bulkUpdateProcessRecords);

module.exports = router;
