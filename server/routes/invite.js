const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const { resolveTenantScope } = require('../middleware/tenantContext');
const requireRoles = require('../middleware/roleAccess');
const {
  createEnterpriseInvite,
  listPlatformInvites,
  revokeInvite,
  resendEnterpriseInvite,
  uploadInviteList,
  confirmInvites,
  sendInvites,
  resendInvite,
  markInviteCopied,
  confirmInviteShared,
  getInviteStatus,
  getInviteByToken,
  requestEmailVerification,
  verifyEmailCode,
  registerViaInvite
} = require('../controllers/inviteController');

const { createRateLimiter } = require('../middleware/rateLimiter');

// Rate Limiters for sensitive invitation operations
const validateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30, // 30 token validation lookups per minute per IP
  message: 'Too many invitation verification requests. Please try again shortly.'
});

const codeRequestLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5, // 5 code generation attempts per minute per IP
  message: 'Verification code request limit reached. Please wait before requesting another code.'
});

const codeVerifyLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10, // 10 verification code submissions per minute per IP
  message: 'Too many verification attempts. Please wait a minute and try again.'
});

const registrationLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10, // 10 account activation submissions per minute per IP
  message: 'Too many account registration attempts. Please try again in a few moments.'
});

const resendLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10, // 10 resend actions per minute
  message: 'Resend rate limit exceeded. Please wait a minute before re-issuing invitations.'
});

// ─── Public routes (no auth needed for invitation lookup & acceptance) ─────────
router.get('/register/:token', validateLimiter, getInviteByToken);
router.post('/register/:token', registrationLimiter, registerViaInvite);
router.post('/request-verification/:token', codeRequestLimiter, requestEmailVerification);
router.post('/verify-email/:token', codeVerifyLimiter, verifyEmailCode);

// ─── Enterprise Multi-Tenant Invitation Endpoints (Phase 2 & 3) ──────────────
// POST /api/invite/create - Super Admin, Company Admin, Project Admin, Manager
router.post('/create', verifyToken, createEnterpriseInvite);

// GET /api/invite/list - Super Admin (all), Company Admin (scoped to company), Project Admin (scoped to project)
router.get('/list', verifyToken, listPlatformInvites);

// POST /api/invite/:id/revoke - Revoke a pending invitation
router.post('/:id/revoke', verifyToken, revokeInvite);

// POST /api/invite/:id/resend - Resend/reissue an invitation
router.post('/:id/resend', verifyToken, resendLimiter, resendEnterpriseInvite);

// ─── Existing Employee Roster Batch Invite Routes (Preserved 100%) ───────────
router.post('/upload', verifyToken, requireRoles(['manager','admin','company_admin','super_admin']), resolveTenantScope({ required: true }), uploadInviteList);
router.post('/confirm', verifyToken, requireRoles(['manager','admin','company_admin','super_admin']), resolveTenantScope({ required: true }), confirmInvites);
router.post('/send', verifyToken, requireRoles(['manager','admin','company_admin','super_admin']), resolveTenantScope({ required: true }), sendInvites);
router.post('/resend/:id', verifyToken, requireRoles(['manager','admin','company_admin','super_admin']), resolveTenantScope({ required: true }), resendInvite);
router.post('/:id/mark-copied', verifyToken, requireRoles(['manager','admin','company_admin','super_admin']), resolveTenantScope({ required: true }), markInviteCopied);
router.post('/:id/confirm-shared', verifyToken, requireRoles(['manager','admin','company_admin','super_admin']), resolveTenantScope({ required: true }), confirmInviteShared);
router.get('/status', verifyToken, requireRoles(['manager','admin','company_admin','super_admin']), resolveTenantScope({ required: true }), getInviteStatus);

module.exports = router;
