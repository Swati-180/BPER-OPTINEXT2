const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const requireRoles = require('../middleware/roleAccess');
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
router.post('/upload', verifyToken, requireRoles(['manager','admin']), uploadInviteList);
router.post('/confirm', verifyToken, requireRoles(['manager','admin']), confirmInvites);
router.post('/send', verifyToken, requireRoles(['manager','admin']), sendInvites);
router.post('/resend/:id', verifyToken, requireRoles(['manager','admin']), resendInvite);
router.get('/status', verifyToken, requireRoles(['manager','admin']), getInviteStatus);

// Admin-only invite management removed (obsolete)

module.exports = router;
