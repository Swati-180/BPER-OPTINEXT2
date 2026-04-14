const express = require('express');
const router = express.Router();
const { submitWDT, getSubmissions, updateSubmissionStatus, getSubmissionByRefId } = require('../controllers/wdtController');
const verifyToken = require('../middleware/verifyToken');

router.post('/submit', verifyToken, submitWDT);
router.get('/submissions', verifyToken, getSubmissions);
router.get('/submissions/:referenceId', verifyToken, getSubmissionByRefId);
router.patch('/submissions/:referenceId', verifyToken, updateSubmissionStatus);

module.exports = router;
