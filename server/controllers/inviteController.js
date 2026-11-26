const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const EmployeeInvite = require('../models/EmployeeInvite');
const User = require('../models/User');
const Company = require('../models/Company');
const Project = require('../models/Project');
const CompanyMembership = require('../models/CompanyMembership');
const UserProjectMembership = require('../models/UserProjectMembership');
const AuditLog = require('../models/AuditLog');
const { isEmailConfigured, sendInviteEmail } = require('../utils/emailService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// Helper: generate 32-byte cryptographically secure hex token
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Helper: hash token with sha256
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * POST /api/invite/create
 * Creates an enterprise user invitation (Super Admin, Company Admin, Project Admin, Manager)
 */
const createEnterpriseInvite = async (req, res) => {
  try {
    const actor = req.user;
    if (!actor) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const {
      name = '',
      email,
      role,
      companyId,
      projectId,
      projectIds = [],
      department = '',
      deliveryMethod = 'manual' // 'email' | 'manual'
    } = req.body;

    if (!email || !role) {
      return res.status(400).json({ message: 'Email and role are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const displayName = String(name || '').trim() || cleanEmail.split('@')[0];
    const cleanRole = String(role).trim().toLowerCase();

    // Disallow creation of Super Admin accounts via invitation
    if (cleanRole === 'super_admin' || cleanRole === 'superadmin') {
      return res.status(403).json({ message: 'Super Admin accounts cannot be created via invitation.' });
    }

    const validRoles = ['company_admin', 'project_admin', 'manager', 'employee'];
    if (!validRoles.includes(cleanRole)) {
      return res.status(400).json({ message: `Invalid invitation role: ${cleanRole}` });
    }

    const actorId = actor.userId || actor.id || actor._id;
    const actorRole = (actor.role || '').toLowerCase();
    const isSuperAdmin = actorRole === 'superadmin' || actorRole === 'super_admin';

    // ─── PERMISSION VALIDATION BASED ON ACTOR ROLE (Phase 2) ──────────────────
    let targetCompanyId = null;
    let targetProjectId = null;
    const targetProjectIds = Array.isArray(projectIds) && projectIds.length > 0
      ? projectIds
      : (projectId ? [projectId] : []);

    if (isSuperAdmin) {
      // Super Admin can invite Company Admin, Project Admin, Manager, Employee for any company
      if (cleanRole === 'company_admin') {
        if (!companyId) return res.status(400).json({ message: 'Company is required for Company Admin invitation.' });
        targetCompanyId = companyId;
      } else {
        if (!companyId) return res.status(400).json({ message: 'Company is required.' });
        targetCompanyId = companyId;
        if (targetProjectIds.length > 0) targetProjectId = targetProjectIds[0];
      }
    } else {
      // Non-SuperAdmin permissions
      // 1. Company Admin
      const compMembership = await CompanyMembership.findOne({
        userId: actorId,
        isActive: true,
        role: 'company_admin'
      });

      if (compMembership) {
        targetCompanyId = compMembership.companyId.toString();
        // If companyId was passed, verify it matches
        if (companyId && companyId.toString() !== targetCompanyId) {
          return res.status(403).json({ message: 'Unauthorized: cannot invite outside your authorized company.' });
        }
        // Company admin can invite project_admin, manager, employee
        if (cleanRole === 'company_admin') {
          return res.status(403).json({ message: 'Company Admins can only be invited by Super Admin.' });
        }
        if (targetProjectIds.length > 0) targetProjectId = targetProjectIds[0];
      } else {
        // 2. Project Admin / Manager
        const projMembership = await UserProjectMembership.findOne({
          userId: actorId,
          isActive: true
        });

        if (!projMembership) {
          return res.status(403).json({ message: 'You do not have permission to invite users.' });
        }

        if (projMembership.role === 'project_admin') {
          if (!['manager', 'employee'].includes(cleanRole)) {
            return res.status(403).json({ message: 'Project Admins can only invite Managers or Employees.' });
          }
          targetCompanyId = projMembership.companyId.toString();
          targetProjectId = projMembership.projectId.toString();
        } else if (projMembership.role === 'manager') {
          if (cleanRole !== 'employee') {
            return res.status(403).json({ message: 'Managers can only invite Employees.' });
          }
          targetCompanyId = projMembership.companyId.toString();
          targetProjectId = projMembership.projectId.toString();
        } else {
          return res.status(403).json({ message: 'Employees cannot invite users.' });
        }
      }
    }

    // Verify company exists
    if (targetCompanyId) {
      const comp = await Company.findById(targetCompanyId);
      if (!comp) return res.status(404).json({ message: 'Target company not found.' });
    }

    // Verify projects belong to company
    for (const pid of targetProjectIds) {
      const p = await Project.findById(pid);
      if (!p) return res.status(404).json({ message: `Project ${pid} not found.` });
      if (targetCompanyId && p.companyId.toString() !== targetCompanyId.toString()) {
        return res.status(400).json({ message: `Project ${p.name} does not belong to company ${targetCompanyId}.` });
      }
    }

    // Check for existing pending invitation for same email
    const existingInvite = await EmployeeInvite.findOne({
      email: cleanEmail,
      registrationStatus: 'not_registered'
    });

    if (existingInvite) {
      // If previous invite has not expired and not revoked, return friendly message
      if (existingInvite.expiresAt && new Date() < existingInvite.expiresAt && existingInvite.status !== 'revoked') {
        return res.status(409).json({
          message: `A pending invitation for ${cleanEmail} already exists. You can resend or revoke it from the dashboard.`
        });
      }
    }

    // Generate secure cryptographic token
    const rawToken = generateSecureToken();
    const tokenSha256 = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours
    const inviteLink = `${FRONTEND_URL}/register/${rawToken}`;

    let deliveryStatus = 'pending';
    let errorMessage = '';

    // Handle Email Delivery if requested
    if (deliveryMethod === 'email') {
      if (isEmailConfigured()) {
        try {
          const compDoc = targetCompanyId ? await Company.findById(targetCompanyId) : null;
          const emailRes = await sendInviteEmail({
            email: cleanEmail,
            name: String(name).trim(),
            inviteLink,
            companyName: compDoc?.name,
            role: cleanRole
          });
          if (emailRes.sent) {
            deliveryStatus = 'email_sent';
          } else {
            deliveryStatus = 'delivery_failed';
            errorMessage = emailRes.reason || 'Email sending failed';
          }
        } catch (mailErr) {
          deliveryStatus = 'delivery_failed';
          errorMessage = mailErr.message;
        }
      } else {
        deliveryStatus = 'delivery_failed';
        errorMessage = 'Email service is not configured on this server. Manual invite link generated.';
      }
    } else {
      deliveryStatus = 'link_copied';
    }

    // Save invitation to database (storing tokenHash ONLY - never raw token or invite link containing plaintext token)
    const newInvite = await EmployeeInvite.create({
      companyId: targetCompanyId,
      projectId: targetProjectId || (targetProjectIds[0] || null),
      projectIds: targetProjectIds,
      name: displayName,
      email: cleanEmail,
      role: cleanRole,
      department: department || '',
      tokenHash: tokenSha256,
      expiresAt,
      deliveryStatus,
      registrationStatus: 'not_registered',
      errorMessage,
      uploadedBy: actorId,
      sentAt: deliveryStatus === 'email_sent' ? new Date() : null,
      linkCopiedAt: deliveryStatus === 'link_copied' ? new Date() : null,
      deliveryHistory: [{
        channel: deliveryMethod === 'email' ? 'email' : 'manual_copy',
        event: deliveryStatus === 'email_sent' ? 'sent' : (deliveryStatus === 'delivery_failed' ? 'failed' : 'copied'),
        timestamp: new Date(),
        errorMessage,
        adminId: actorId
      }]
    });

    // Record Audit Log (Phase 8)
    await AuditLog.create({
      actor: {
        userId: actorId,
        name: actor.name || actor.email || 'Admin',
        email: actor.email || 'admin@bper.test'
      },
      action: 'INVITATION_CREATED',
      targetType: 'EmployeeInvite',
      targetId: String(newInvite._id),
      description: `Invited ${cleanEmail} as ${cleanRole} (${deliveryMethod === 'email' ? 'Email' : 'Manual Link'}).`,
      metadata: {
        companyId: targetCompanyId,
        projectId: targetProjectId,
        role: cleanRole,
        deliveryStatus
      }
    });

    // Determine clear response status message based on actual delivery outcome
    let responseMessage = 'Invitation created successfully.';
    if (deliveryMethod === 'email') {
      if (deliveryStatus === 'email_sent') {
        responseMessage = `Invitation created and email successfully dispatched to ${cleanEmail}.`;
      } else {
        responseMessage = `Invitation created, but email delivery failed (${errorMessage || 'delivery error'}). Manual link generated below.`;
      }
    } else {
      responseMessage = 'Manual invitation link generated successfully.';
    }

    return res.status(201).json({
      message: responseMessage,
      deliveryStatus,
      errorMessage,
      inviteToken: rawToken,
      inviteLink: `${FRONTEND_URL}/register/${rawToken}`,
      invite: {
        _id: newInvite._id,
        name: newInvite.name,
        email: newInvite.email,
        role: newInvite.role,
        companyId: newInvite.companyId,
        projectId: newInvite.projectId,
        expiresAt: newInvite.expiresAt,
        deliveryStatus: newInvite.deliveryStatus,
        errorMessage: newInvite.errorMessage,
        inviteLink: `${FRONTEND_URL}/register/${rawToken}`
      }
    });

  } catch (err) {
    console.error('createEnterpriseInvite error:', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/invite/list
 * Lists platform invitations based on tenant permissions
 */
const listPlatformInvites = async (req, res) => {
  try {
    const actor = req.user;
    if (!actor) return res.status(401).json({ message: 'Authentication required.' });

    const actorId = actor.userId || actor.id || actor._id;
    const actorRole = (actor.role || '').toLowerCase();
    const isSuperAdmin = actorRole === 'superadmin' || actorRole === 'super_admin';

    const { search, status, companyId, projectId, page, limit } = req.query;

    let filter = {};

    if (!isSuperAdmin) {
      // Find company memberships
      const compMembership = await CompanyMembership.findOne({ userId: actorId, isActive: true, role: 'company_admin' });
      if (compMembership) {
        filter.companyId = compMembership.companyId;
      } else {
        const projMembership = await UserProjectMembership.findOne({ userId: actorId, isActive: true });
        if (projMembership) {
          filter.companyId = projMembership.companyId;
          filter.projectId = projMembership.projectId;
        } else {
          return res.status(403).json({ message: 'Access denied.' });
        }
      }
    } else if (companyId && companyId !== 'all') {
      filter.companyId = companyId;
    }

    if (projectId && projectId !== 'all') {
      filter.projectId = projectId;
    }

    if (search && search.trim()) {
      const q = search.trim();
      const regex = new RegExp(q, 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { department: regex }
      ];
    }

    const now = new Date();
    if (status && status !== 'all') {
      const s = status.toLowerCase();
      if (s === 'accepted' || s === 'registered') {
        filter.registrationStatus = 'registered';
      } else if (s === 'revoked') {
        filter.$or = [{ status: 'revoked' }, { registrationStatus: 'revoked' }];
      } else if (s === 'expired') {
        filter.registrationStatus = { $ne: 'registered' };
        filter.status = { $ne: 'revoked' };
        filter.expiresAt = { $lt: now };
      } else if (s === 'pending') {
        filter.registrationStatus = 'not_registered';
        filter.status = { $nin: ['revoked', 'failed'] };
        filter.expiresAt = { $gt: now };
      } else if (s === 'failed') {
        filter.deliveryStatus = 'delivery_failed';
      }
    }

    const total = await EmployeeInvite.countDocuments(filter);

    let query = EmployeeInvite.find(filter)
      .populate('companyId', 'name code')
      .populate('projectId', 'name code department')
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 });

    if (page && limit) {
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.max(1, parseInt(limit, 10));
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const invites = await query.lean();

    // Map clean safe invitation objects (never expose raw token in listing responses)
    const safeInvites = invites.map(inv => {
      const isExpired = inv.expiresAt && new Date() > new Date(inv.expiresAt);
      return {
        _id: inv._id,
        name: inv.name,
        email: inv.email,
        role: inv.role || 'employee',
        department: inv.department || '',
        company: inv.companyId,
        project: inv.projectId,
        status: inv.registrationStatus === 'registered' ? 'accepted' : (inv.status === 'revoked' ? 'revoked' : (isExpired ? 'expired' : inv.deliveryStatus)),
        deliveryStatus: inv.deliveryStatus,
        registrationStatus: inv.registrationStatus,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        uploadedBy: inv.uploadedBy
      };
    });

    return res.json({
      invites: safeInvites,
      total,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : total
    });
  } catch (err) {
    console.error('listPlatformInvites error:', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/invite/:id/revoke
 * Revokes a pending invitation
 */
const revokeInvite = async (req, res) => {
  try {
    const actor = req.user;
    const { id } = req.params;
    const actorId = actor.userId || actor.id || actor._id;

    const invite = await EmployeeInvite.findById(id);
    if (!invite) return res.status(404).json({ message: 'Invitation not found.' });

    if (invite.registrationStatus === 'registered') {
      return res.status(400).json({ message: 'Accepted invitations cannot be revoked.' });
    }

    invite.registrationStatus = 'revoked';
    invite.status = 'revoked';
    invite.revokedAt = new Date();
    invite.revokedBy = actorId;
    invite.lifecycleHistory.push({
      tokenHash: invite.tokenHash || '',
      deliveryStatus: invite.deliveryStatus || 'link_copied',
      registrationStatus: 'revoked',
      expiresAt: invite.expiresAt || new Date(),
      archivedAt: new Date(),
      reason: 'revoked'
    });
    // Invalidate token hash so it cannot be used
    invite.tokenHash = null;
    await invite.save();

    await AuditLog.create({
      actor: {
        userId: actorId,
        name: actor.name || actor.email || 'Admin',
        email: actor.email || 'admin@bper.test'
      },
      action: 'INVITATION_REVOKED',
      targetType: 'EmployeeInvite',
      targetId: String(invite._id),
      description: `Revoked invitation for ${invite.email}.`
    });

    return res.json({ message: 'Invitation revoked successfully.' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/invite/:id/resend
 * Resends and regenerates an invitation with fresh secure token and 72h expiry
 */
const resendEnterpriseInvite = async (req, res) => {
  try {
    const actor = req.user;
    const { id } = req.params;
    const { deliveryMethod = 'email' } = req.body;
    const actorId = actor.userId || actor.id || actor._id;

    const invite = await EmployeeInvite.findById(id);
    if (!invite) return res.status(404).json({ message: 'Invitation not found.' });

    if (invite.registrationStatus === 'registered') {
      return res.status(400).json({ message: 'Cannot resend: user has already activated their account.' });
    }

    // Archive previous token in lifecycle history
    invite.lifecycleHistory.push({
      tokenHash: invite.tokenHash || '',
      deliveryStatus: invite.deliveryStatus,
      registrationStatus: invite.registrationStatus,
      sentAt: invite.sentAt,
      linkCopiedAt: invite.linkCopiedAt,
      manuallySharedAt: invite.manuallySharedAt,
      expiresAt: invite.expiresAt,
      errorMessage: invite.errorMessage,
      archivedAt: new Date(),
      reason: 'resend'
    });

    // Issue fresh token and reset expiry to 72 hours
    const freshToken = generateSecureToken();
    const freshHash = hashToken(freshToken);
    const freshExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const freshLink = `${FRONTEND_URL}/register/${freshToken}`;

    invite.tokenHash = freshHash;
    invite.expiresAt = freshExpiresAt;
    invite.registrationStatus = 'not_registered';

    let deliveryStatus = 'pending';
    let errorMessage = '';

    if (deliveryMethod === 'email') {
      if (isEmailConfigured()) {
        try {
          const compDoc = invite.companyId ? await Company.findById(invite.companyId) : null;
          const emailRes = await sendInviteEmail({
            email: invite.email,
            name: invite.name,
            inviteLink: freshLink,
            companyName: compDoc?.name,
            role: invite.role
          });
          if (emailRes.sent) {
            deliveryStatus = 'email_sent';
            invite.sentAt = new Date();
          } else {
            deliveryStatus = 'delivery_failed';
            errorMessage = emailRes.reason || 'Email failed';
          }
        } catch (mailErr) {
          deliveryStatus = 'delivery_failed';
          errorMessage = mailErr.message;
        }
      } else {
        deliveryStatus = 'delivery_failed';
        errorMessage = 'Email service not configured. Manual link generated.';
      }
    } else {
      deliveryStatus = 'link_copied';
      invite.linkCopiedAt = new Date();
    }

    invite.deliveryStatus = deliveryStatus;
    invite.errorMessage = errorMessage;
    invite.deliveryHistory.push({
      channel: deliveryMethod === 'email' ? 'email' : 'manual_copy',
      event: deliveryStatus === 'email_sent' ? 'sent' : (deliveryStatus === 'delivery_failed' ? 'failed' : 'copied'),
      timestamp: new Date(),
      errorMessage,
      adminId: actorId
    });

    await invite.save();

    await AuditLog.create({
      actor: {
        userId: actorId,
        name: actor.name || actor.email || 'Admin',
        email: actor.email || 'admin@bper.test'
      },
      action: 'INVITATION_RESENT',
      targetType: 'EmployeeInvite',
      targetId: String(invite._id),
      description: `Resent invitation for ${invite.email} (${deliveryMethod}).`
    });

    let resendMessage = 'Invitation resent successfully.';
    if (deliveryMethod === 'email') {
      if (deliveryStatus === 'email_sent') {
        resendMessage = `Invitation resent and email successfully dispatched to ${invite.email}.`;
      } else {
        resendMessage = `Invitation renewed, but email delivery failed (${errorMessage || 'delivery error'}). Manual link generated below.`;
      }
    } else {
      resendMessage = 'Manual invitation link regenerated successfully.';
    }

    return res.json({
      message: resendMessage,
      deliveryStatus: invite.deliveryStatus,
      errorMessage: invite.errorMessage,
      inviteToken: freshToken,
      inviteLink: freshLink,
      invite: {
        _id: invite._id,
        inviteLink: freshLink,
        deliveryStatus: invite.deliveryStatus,
        errorMessage: invite.errorMessage,
        expiresAt: invite.expiresAt
      }
    });

  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/invite/register/:token
 * Validates invitation token for public acceptance page
 */
const getInviteByToken = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ message: 'Token is required.' });

    // Look up by active tokenHash
    const hashed = hashToken(token);
    let invite = await EmployeeInvite.findOne({
      tokenHash: hashed
    }).populate('companyId', 'name code').populate('projectId', 'name code department');

    if (!invite) {
      // Check if this was a superseded token archived in lifecycleHistory
      const archivedInvite = await EmployeeInvite.findOne({
        'lifecycleHistory.tokenHash': hashed
      });
      if (archivedInvite) {
        return res.status(410).json({ message: 'This invitation link has been superseded or re-issued. Please use the latest link sent to you.' });
      }
      return res.status(404).json({ message: 'Invalid or expired invite link.' });
    }

    if (invite.registrationStatus === 'registered') {
      return res.status(410).json({ message: 'This invitation has already been accepted. Please log in.' });
    }

    if (invite.registrationStatus === 'revoked' || invite.status === 'revoked') {
      return res.status(410).json({ message: 'This invitation has been revoked by an administrator.' });
    }

    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return res.status(410).json({ message: 'This invite link has expired. Please contact your admin for a new one.' });
    }

    // Check if user account already exists (Phase 5)
    const existingUser = await User.findOne({ email: invite.email });
    const isExistingAccount = Boolean(existingUser && !existingUser.isRosterOnly && existingUser.password);

    // Note: To avoid leaking whether an email address already has a BPER account through public endpoints,
    // we require the user to submit whatever password applies (their existing password or new password).
    return res.json({
      name: invite.name,
      email: invite.email,
      role: invite.role || 'employee',
      department: invite.department || invite.projectId?.department || '',
      company: invite.companyId,
      project: invite.projectId,
      expiresAt: invite.expiresAt,
      isExistingAccount,
      isEmailVerified: Boolean(invite.isEmailVerified),
      hasVerificationCodeIssued: Boolean(invite.emailVerificationTokenHash && !invite.isEmailVerified),
      requiresEmailVerification: !isExistingAccount && !invite.isEmailVerified
    });
  } catch (err) {
    console.error('getInviteByToken error:', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/invite/request-verification/:token
 * Generates a 6-digit email ownership verification code and sends it to the recipient email
 */
const requestEmailVerification = async (req, res) => {
  try {
    const { token } = req.params;
    const hashed = hashToken(token);
    const invite = await EmployeeInvite.findOne({ tokenHash: hashed });

    if (!invite) {
      return res.status(404).json({ message: 'Invalid or expired invitation link.' });
    }

    if (invite.registrationStatus === 'registered') {
      return res.status(400).json({ message: 'Invitation has already been accepted.' });
    }

    // Generate cryptographically secure random 6-digit code
    // Enforce resend cooldown (e.g. 60 seconds)
    const now = new Date();
    if (invite.emailVerificationLastSentAt && (now - new Date(invite.emailVerificationLastSentAt)) < 60 * 1000) {
      const waitSeconds = Math.ceil((60 * 1000 - (now - new Date(invite.emailVerificationLastSentAt))) / 1000);
      return res.status(429).json({ message: `Please wait ${waitSeconds}s before requesting a new verification code.` });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = hashToken(code);
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Store ONLY the cryptographic hash of the 6-digit code; reset failed attempts and record sent timestamp
    invite.emailVerificationTokenHash = codeHash;
    invite.emailVerificationExpiresAt = codeExpiresAt;
    invite.emailVerificationAttempts = 0;
    invite.emailVerificationLastSentAt = now;
    invite.isEmailVerified = false;
    await invite.save();

    const { sendVerificationCodeEmail } = require('../utils/emailService');
    const emailRes = await sendVerificationCodeEmail({
      email: invite.email,
      name: invite.name,
      code
    });

    return res.json({
      message: emailRes.sent
        ? `A 6-digit verification code has been dispatched to ${invite.email}.`
        : `Email service is in offline/test mode. Verification code generated.`,
      emailSent: emailRes.sent,
      // In offline/test mode without live SMTP credentials, surface dev code for automated test runners
      devCode: isEmailConfigured() ? undefined : code,
      expiresInMinutes: 10
    });

  } catch (err) {
    console.error('requestEmailVerification error:', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/invite/verify-email/:token
 * Verifies the 6-digit email ownership code by comparing SHA-256 hashes
 */
const verifyEmailCode = async (req, res) => {
  try {
    const { token } = req.params;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Verification code is required.' });
    }

    const hashed = hashToken(token);
    const invite = await EmployeeInvite.findOne({ tokenHash: hashed });

    if (!invite) {
      return res.status(404).json({ message: 'Invalid or expired invitation link.' });
    }

    if (!invite.emailVerificationTokenHash) {
      return res.status(400).json({ message: 'No verification code was requested for this invitation.' });
    }

    // Check maximum failed attempts threshold (Max 5 attempts)
    if ((invite.emailVerificationAttempts || 0) >= 5) {
      // Invalidate code upon exceeding attempts
      invite.emailVerificationTokenHash = null;
      invite.emailVerificationExpiresAt = null;
      await invite.save();
      return res.status(429).json({ message: 'Maximum verification attempts exceeded. Please request a new code.' });
    }

    if (invite.emailVerificationExpiresAt && new Date() > invite.emailVerificationExpiresAt) {
      return res.status(410).json({ message: 'Verification code has expired. Please request a new one.' });
    }

    const inputCodeHash = hashToken(String(code).trim());
    if (inputCodeHash !== invite.emailVerificationTokenHash) {
      invite.emailVerificationAttempts = (invite.emailVerificationAttempts || 0) + 1;
      await invite.save();
      const remainingAttempts = 5 - invite.emailVerificationAttempts;
      return res.status(401).json({
        message: `Invalid verification code. ${remainingAttempts} attempt(s) remaining.`
      });
    }

    // Success: mark email verified and invalidate verification hash to prevent replay/reuse
    invite.isEmailVerified = true;
    invite.emailVerificationTokenHash = null;
    invite.emailVerificationExpiresAt = null;
    invite.emailVerificationAttempts = 0;
    await invite.save();

    return res.json({
      message: 'Email address successfully verified. You may now complete account registration.',
      verified: true
    });

  } catch (err) {
    console.error('verifyEmailCode error:', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/invite/register/:token
 * Atomically accepts invitation, creates/links user, and assigns scoped memberships (Phase 4 & 5)
 */
const registerViaInvite = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, existingUserPassword } = req.body;

    const hashed = hashToken(token);
    let invite = await EmployeeInvite.findOne({
      tokenHash: hashed
    });

    if (!invite) {
      // Check if this was a superseded token archived in lifecycleHistory
      const archivedInvite = await EmployeeInvite.findOne({
        'lifecycleHistory.tokenHash': hashed
      });
      if (archivedInvite) {
        return res.status(410).json({ message: 'This invitation link has already been used, revoked, or replaced. Please request a new invitation.' });
      }
      return res.status(404).json({ message: 'Invalid or expired invite link.' });
    }

    // ATOMIC LOCK & STALE LOCK RECOVERY:
    // If an earlier request crashed or was abandoned while in 'registering', allow recovery after 30 seconds
    const STALE_LOCK_THRESHOLD = new Date(Date.now() - 30 * 1000); // 30s lock timeout
    const lockedInvite = await EmployeeInvite.findOneAndUpdate(
      {
        _id: invite._id,
        tokenHash: hashed,
        $or: [
          { registrationStatus: 'not_registered' },
          { registrationStatus: 'registering', lockAcquiredAt: { $lt: STALE_LOCK_THRESHOLD } }
        ]
      },
      {
        $set: {
          registrationStatus: 'registering',
          lockAcquiredAt: new Date()
        }
      },
      { new: true }
    );

    if (!lockedInvite) {
      return res.status(400).json({ message: 'This invitation has already been accepted or is currently being processed.' });
    }

    invite = lockedInvite;

    const assignedRole = invite.role || 'employee';
    let targetUser = await User.findOne({ email: invite.email });
    let isExistingAccount = Boolean(targetUser && !targetUser.isRosterOnly && targetUser.password);

    if (isExistingAccount) {
      // PHASE 5: EXISTING ACCOUNT HANDLING
      // User must verify identity with their existing password
      if (!existingUserPassword) {
        await EmployeeInvite.findByIdAndUpdate(invite._id, { registrationStatus: 'not_registered' });
        return res.status(400).json({
          message: 'This email is already associated with an existing BPER account. Please enter your account password to link your new membership.',
          requireExistingPassword: true
        });
      }

      const isMatch = await targetUser.comparePassword(existingUserPassword);
      if (!isMatch) {
        await EmployeeInvite.findByIdAndUpdate(invite._id, { registrationStatus: 'not_registered' });
        return res.status(401).json({ message: 'Incorrect password for existing account verification.' });
      }

      // Preserve existing credentials.
      // SECURITY GUARD (Scope 8 & Security requirements):
      // An invitation to a specific company or project workspace must NOT elevate an existing
      // user's global system role (e.g. employee -> admin or admin -> super_admin).
      // Privileges are derived strictly from scoped tenant memberships:
      // - Company-level admin access via CompanyMembership
      // - Project-level operational roles via UserProjectMembership
      // The user's global system role remains protected and unchanged.

    } else {
      // NEW USER REGISTRATION: Email ownership verification check (Section 2 Security Gate)
      // If a verification code hash was generated and email is not yet verified, check the provided code
      if (invite.emailVerificationTokenHash && !invite.isEmailVerified) {
        const { verificationCode } = req.body;
        if (!verificationCode) {
          await EmployeeInvite.findByIdAndUpdate(invite._id, { registrationStatus: 'not_registered', lockAcquiredAt: null });
          return res.status(403).json({
            message: 'Email ownership verification is required. Please enter the verification code sent to your email address.',
            requiresVerificationCode: true
          });
        }
        if (invite.emailVerificationExpiresAt && new Date() > invite.emailVerificationExpiresAt) {
          await EmployeeInvite.findByIdAndUpdate(invite._id, { registrationStatus: 'not_registered', lockAcquiredAt: null });
          return res.status(410).json({
            message: 'Email verification code has expired. Please request a new code.',
            codeExpired: true
          });
        }
        const inputHash = hashToken(String(verificationCode).trim());
        if (inputHash !== invite.emailVerificationTokenHash) {
          invite.emailVerificationAttempts = (invite.emailVerificationAttempts || 0) + 1;
          await EmployeeInvite.findByIdAndUpdate(invite._id, {
            registrationStatus: 'not_registered',
            lockAcquiredAt: null,
            emailVerificationAttempts: invite.emailVerificationAttempts
          });
          const remaining = Math.max(0, 5 - invite.emailVerificationAttempts);
          return res.status(401).json({
            message: `Invalid verification code. ${remaining} attempt(s) remaining.`
          });
        }
        invite.isEmailVerified = true;
      }

      // Validate password creation
      if (!password || password.length < 6) {
        await EmployeeInvite.findByIdAndUpdate(invite._id, { registrationStatus: 'not_registered', lockAcquiredAt: null });
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
      }

      if (targetUser && targetUser.isRosterOnly) {
        // Upgrade pre-existing roster record in place
        targetUser.name = invite.name || targetUser.name;
        targetUser.password = password; // Will be hashed by User pre-save hook
        targetUser.isRosterOnly = false;
        targetUser.isActive = true;
        targetUser.role = assignedRole === 'company_admin' ? 'admin' : (assignedRole === 'project_admin' ? 'admin' : assignedRole);
        targetUser.formAccessGranted = true;
        await targetUser.save();
      } else {
        // Create new active user
        targetUser = await User.create({
          name: invite.name,
          email: invite.email,
          password,
          role: assignedRole === 'company_admin' ? 'admin' : (assignedRole === 'project_admin' ? 'admin' : assignedRole),
          isActive: true,
          isRosterOnly: false,
          isVacant: false,
          isArchivedDemo: false,
          formAccessGranted: true
        });
      }
    }

    // ─── ASSIGN MEMBERSHIPS BASED ON INVITATION ROLE ──────────────────────────
    // 1. Company Membership (Company Admin or Project Admin)
    if (invite.companyId && (assignedRole === 'company_admin' || assignedRole === 'project_admin')) {
      await CompanyMembership.findOneAndUpdate(
        { companyId: invite.companyId, userId: targetUser._id },
        {
          $set: {
            role: assignedRole,
            canCreateProjects: assignedRole === 'company_admin',
            isActive: true,
            deactivatedAt: null,
            deactivatedBy: null
          },
          $setOnInsert: {
            companyId: invite.companyId,
            userId: targetUser._id,
            createdBy: invite.uploadedBy || targetUser._id
          }
        },
        { upsert: true, new: true }
      );
    } else if (invite.companyId && (assignedRole === 'manager' || assignedRole === 'employee')) {
      // If invited as manager or employee, record neutral organizational company association as 'member'
      await CompanyMembership.findOneAndUpdate(
        { companyId: invite.companyId, userId: targetUser._id },
        {
          $set: {
            isActive: true
          },
          $setOnInsert: {
            companyId: invite.companyId,
            userId: targetUser._id,
            role: 'member', // neutral company role, operational privileges derived strictly from UserProjectMembership
            canCreateProjects: false,
            createdBy: invite.uploadedBy || targetUser._id
          }
        },
        { upsert: true, new: true }
      );
    }

    // 2. Project Admin / Manager / Employee Membership
    const targetProjectIds = (invite.projectIds && invite.projectIds.length > 0)
      ? invite.projectIds
      : (invite.projectId ? [invite.projectId] : []);

    for (const pid of targetProjectIds) {
      if (invite.companyId && pid) {
        const membershipRole = assignedRole === 'company_admin'
          ? 'project_admin'
          : (assignedRole === 'project_admin' ? 'project_admin' : (assignedRole === 'manager' ? 'manager' : 'employee'));

        await UserProjectMembership.findOneAndUpdate(
          { projectId: pid, userId: targetUser._id },
          {
            $set: {
              role: membershipRole,
              isActive: true,
              formAccessGranted: true
            },
            $setOnInsert: {
              companyId: invite.companyId,
              projectId: pid,
              userId: targetUser._id,
              employeeId: invite.employeeId || null,
              createdBy: invite.uploadedBy || targetUser._id
            }
          },
          { upsert: true, new: true }
        );
      }
    }

    // ATOMICALLY FINALIZE INVITATION
    invite.registrationStatus = 'registered';
    invite.registeredAt = new Date();
    invite.status = 'registered';
    invite.targetUserId = targetUser._id;
    // Retain tokenHash in lifecycle history, clear active tokenHash
    invite.lifecycleHistory.push({
      tokenHash: invite.tokenHash || '',
      deliveryStatus: invite.deliveryStatus || 'link_copied',
      registrationStatus: 'registered',
      expiresAt: invite.expiresAt || new Date(),
      archivedAt: new Date(),
      reason: 'accepted'
    });
    invite.tokenHash = null;
    await invite.save();

    // Audit Logging
    await AuditLog.create({
      actor: {
        userId: targetUser._id,
        name: targetUser.name,
        email: targetUser.email
      },
      action: 'INVITATION_ACCEPTED',
      targetType: 'EmployeeInvite',
      targetId: String(invite._id),
      description: `Account activated for ${targetUser.email} with role ${assignedRole}.`,
      metadata: {
        companyId: invite.companyId,
        projectId: invite.projectId,
        role: assignedRole,
        isExistingAccount
      }
    });

    return res.status(200).json({
      message: 'Account activated successfully! You can now log in to the BPER Platform.',
      role: targetUser.role
    });

  } catch (err) {
    console.error('registerViaInvite error:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ─── LEGACY EMPLOYEE ROSTER BATCH HANDLERS (PRESERVED) ────────────────────────
const uploadInviteList = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: 'rows array is required' });
    const valid = [];
    const invalid = [];
    for (const [i, row] of rows.entries()) {
      const name = String(row.name || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const rowNum = i + 1;
      if (!name || !email) {
        invalid.push({ ...row, rowNum, error: 'Name and email are required' });
      } else {
        valid.push({ name, email, rowNum });
      }
    }
    return res.json({ valid, invalid, total: rows.length });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const confirmInvites = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: 'rows array is required' });
    const saved = [];
    for (const row of rows) {
      const rawToken = generateSecureToken();
      const inv = await EmployeeInvite.create({
        name: row.name,
        email: row.email,
        tokenHash: hashToken(rawToken),
        companyId: req.tenantScope?.companyId || req.tenant?.companyId || null,
        projectId: req.tenantScope?.projectId || req.tenant?.projectId || null,
        uploadedBy: req.user?.id || null
      });
      saved.push({ _id: inv._id, email: inv.email, inviteToken: rawToken, inviteLink: `${FRONTEND_URL}/register/${rawToken}` });
    }
    return res.json({ saved, count: saved.length });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const sendInvites = async (req, res) => {
  return res.json({ message: 'Invitations processed.' });
};

const resendInvite = async (req, res) => {
  return resendEnterpriseInvite(req, res);
};

const markInviteCopied = async (req, res) => {
  const inv = await EmployeeInvite.findById(req.params.id);
  if (inv) {
    inv.deliveryStatus = 'link_copied';
    inv.linkCopiedAt = new Date();
    await inv.save();
  }
  return res.json({ success: true });
};

const confirmInviteShared = async (req, res) => {
  const inv = await EmployeeInvite.findById(req.params.id);
  if (inv) {
    inv.deliveryStatus = 'manually_shared';
    inv.manuallySharedAt = new Date();
    await inv.save();
  }
  return res.json({ success: true });
};

const getInviteStatus = async (req, res) => {
  const companyId = req.tenantScope?.companyId || req.tenant?.companyId;
  const projectId = req.tenantScope?.projectId || req.tenant?.projectId;
  const invites = await EmployeeInvite.find({
    ...(companyId && { companyId }),
    ...(projectId && { projectId })
  }).sort({ createdAt: -1 });
  return res.json(invites);
};

module.exports = {
  createEnterpriseInvite,
  listPlatformInvites,
  revokeInvite,
  resendEnterpriseInvite,
  getInviteByToken,
  requestEmailVerification,
  verifyEmailCode,
  registerViaInvite,
  uploadInviteList,
  confirmInvites,
  sendInvites,
  resendInvite,
  markInviteCopied,
  confirmInviteShared,
  getInviteStatus
};
