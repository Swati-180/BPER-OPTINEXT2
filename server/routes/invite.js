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
  registerViaInvite,
  createAdminInvite,
  listAdminInvites,
  resendAdminInvite,
  cancelAdminInvite
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

// Admin-only invite management
router.get('/admin-invites', verifyToken, requireRoles(['admin']), listAdminInvites);
router.post('/admin-invites', verifyToken, requireRoles(['admin']), createAdminInvite);
router.post('/admin-invites/:id/resend', verifyToken, requireRoles(['admin']), resendAdminInvite);
router.delete('/admin-invites/:id', verifyToken, requireRoles(['admin']), cancelAdminInvite);

module.exports = router;
