const express = require('express');
const router = express.Router();
const { getSixBySixData, createProcessRecord } = require('../controllers/analysisController');
const verifyToken = require('../middleware/verifyToken');

router.get('/six-by-six', verifyToken, getSixBySixData);
router.post('/six-by-six', verifyToken, createProcessRecord);

module.exports = router;
