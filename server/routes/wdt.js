const express = require('express');
const router = express.Router();
const { submitWDT, getSubmissions, updateSubmissionStatus, getSubmissionByRefId, getSubmissionWindowStatus } = require('../controllers/wdtController');
const verifyToken = require('../middleware/verifyToken');

const requireRoles = require('../middleware/roleAccess');

router.post('/submit', verifyToken, submitWDT);
router.get('/submissions', verifyToken, getSubmissions);
router.get('/window-status', getSubmissionWindowStatus);
router.get('/submissions/:referenceId', verifyToken, getSubmissionByRefId);
router.patch('/submissions/:referenceId', verifyToken, requireRoles(['manager', 'admin']), updateSubmissionStatus);

module.exports = router;
