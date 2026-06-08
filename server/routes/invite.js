const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const {
  uploadInviteList,
  confirmInvites,
  sendInvites,
  resendInvite,
  getInviteStatus,
  getInviteByToken,
  registerViaInvite
} = require('../controllers/inviteController');

// Public routes (no auth needed)
router.get('/register/:token', getInviteByToken);
router.post('/register/:token', registerViaInvite);

// Admin/manager only routes
router.post('/upload', verifyToken, uploadInviteList);
router.post('/confirm', verifyToken, confirmInvites);
router.post('/send', verifyToken, sendInvites);
router.post('/resend/:id', verifyToken, resendInvite);
router.get('/status', verifyToken, getInviteStatus);

module.exports = router;
