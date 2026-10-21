const { v4: uuidv4 } = require('uuid');
const EmployeeInvite = require('../models/EmployeeInvite');
const User = require('../models/User');
const { isEmailConfigured, sendInviteEmail } = require('../utils/emailService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// ─── POST /invite/upload ───────────────────────────────────────────────────────
// Validates a list of { name, email } rows and returns preview (valid/invalid)
// ─── POST /invite/upload ───────────────────────────────────────────────────────
// Validates a list of { name, email, employeeId? } rows and returns preview (valid/invalid)
const uploadInviteList = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'rows array is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = [];
    const invalid = [];

    for (const [i, row] of rows.entries()) {
      const name = String(row.name || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const employeeId = row.employeeId ? String(row.employeeId).trim() : null;
      const rowNum = i + 1;

      if (!name) {
        invalid.push({ ...row, rowNum, error: 'Name is required' });
        continue;
      }
      if (!email) {
        invalid.push({ ...row, rowNum, error: 'Email is required' });
        continue;
      }
      if (!emailRegex.test(email)) {
        invalid.push({ ...row, rowNum, error: `Invalid email format: ${email}` });
        continue;
      }

      // Check if employeeId points to a vacant position or archived demo
      if (employeeId) {
        const targetUser = await User.findOne({ employeeId });
        if (targetUser) {
          if (targetUser.isVacant || targetUser.role === 'position') {
            invalid.push({ ...row, rowNum, error: `Employee ID ${employeeId} is a vacant position and cannot be invited.` });
            continue;
          }
          if (targetUser.isArchivedDemo) {
            invalid.push({ ...row, rowNum, error: `Employee ID ${employeeId} is an archived demo account and cannot be invited.` });
            continue;
          }
          if (!targetUser.isRosterOnly && targetUser.password) {
            invalid.push({ ...row, rowNum, error: `Employee ID ${employeeId} already has an active login account.` });
            continue;
          }
        }
      }

      // Check if email already matches an active user
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        if (existingUser.isVacant || existingUser.role === 'position') {
          invalid.push({ ...row, rowNum, error: `Email matches a vacant position and cannot be invited.` });
          continue;
        }
        if (existingUser.isArchivedDemo) {
          invalid.push({ ...row, rowNum, error: `Email matches an archived demo account and cannot be invited.` });
          continue;
        }
        if (!existingUser.isRosterOnly && existingUser.password) {
          invalid.push({ ...row, rowNum, error: `Email is already registered as an active user.` });
          continue;
        }
      }

      valid.push({ name, email, employeeId, rowNum });
    }

    return res.json({ valid, invalid, total: rows.length });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── POST /invite/confirm ──────────────────────────────────────────────────────
// Saves valid invite rows to DB, generates unique invite links
const confirmInvites = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'rows array is required' });
    }

    const saved = [];
    const skipped = [];

    for (const row of rows) {
      const email = String(row.email || '').trim().toLowerCase();
      const name = String(row.name || '').trim();
      const employeeId = row.employeeId ? String(row.employeeId).trim() : null;

      // Check if invite already exists
      const existing = await EmployeeInvite.findOne({ email });
      if (existing) {
        skipped.push({ email, reason: 'Invite already exists — use Resend to refresh' });
        continue;
      }

      // Check if target user by employeeId or email is a vacancy or archived demo
      let targetUser = null;
      if (employeeId) {
        targetUser = await User.findOne({ employeeId });
      }
      if (!targetUser) {
        targetUser = await User.findOne({ email });
      }

      if (targetUser) {
        if (targetUser.isVacant || targetUser.role === 'position') {
          skipped.push({ email, reason: `Cannot invite vacant position (Employee ID: ${targetUser.employeeId || 'N/A'})` });
          continue;
        }
        if (targetUser.isArchivedDemo) {
          skipped.push({ email, reason: `Cannot invite archived demo account (Employee ID: ${targetUser.employeeId || 'N/A'})` });
          continue;
        }
        if (!targetUser.isRosterOnly && targetUser.password) {
          skipped.push({ email, reason: 'Already registered as an active user' });
          continue;
        }
      }

      const token = uuidv4();
      const inviteLink = `${FRONTEND_URL}/register/invite/${token}`;

      const invite = await EmployeeInvite.create({
        name,
        email,
        employeeId: employeeId || (targetUser?.employeeId) || null,
        targetUserId: targetUser?._id || null,
        inviteToken: token,
        inviteLink,
        status: 'pending',
        uploadedBy: req.user?.userId || null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      saved.push({ name, email, employeeId: invite.employeeId, inviteLink, _id: invite._id });
    }

    return res.json({
      message: `Saved ${saved.length} invites. Skipped ${skipped.length}.`,
      saved,
      skipped
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── POST /invite/send ─────────────────────────────────────────────────────────
// Attempts to send emails to all pending invites
const sendInvites = async (req, res) => {
  try {
    const pending = await EmployeeInvite.find({ status: 'pending' });

    if (pending.length === 0) {
      return res.json({ message: 'No pending invites to send.', sent: 0, failed: 0 });
    }

    let sent = 0;
    let failed = 0;
    const emailNotConfigured = !isEmailConfigured();

    for (const invite of pending) {
      const result = await sendInviteEmail(invite);
      if (result.sent) {
        invite.status = 'sent';
        invite.sentAt = new Date();
        invite.errorMessage = '';
        sent++;
      } else {
        invite.status = 'failed';
        invite.errorMessage = result.reason || 'Unknown error';
        failed++;
      }
      await invite.save();
    }

    return res.json({
      message: emailNotConfigured
        ? 'Email service is not configured. Invite links are generated and can be copied manually.'
        : `Sent ${sent} emails. ${failed} failed.`,
      sent,
      failed,
      emailNotConfigured
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── POST /invite/resend/:id ──────────────────────────────────────────────────
const resendInvite = async (req, res) => {
  try {
    const invite = await EmployeeInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (invite.status === 'registered') {
      return res.status(400).json({ message: 'Employee has already registered' });
    }

    // Re-generate token and link
    const token = uuidv4();
    invite.inviteToken = token;
    invite.inviteLink = `${FRONTEND_URL}/register/invite/${token}`;
    invite.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    invite.status = 'pending';

    // Attempt email
    const result = await sendInviteEmail(invite);
    if (result.sent) {
      invite.status = 'sent';
      invite.sentAt = new Date();
      invite.errorMessage = '';
    } else {
      invite.errorMessage = result.reason || '';
    }

    await invite.save();

    return res.json({
      message: result.sent ? 'Invite resent successfully.' : `Invite link refreshed. ${result.reason || 'Email not sent.'}`,
      invite: {
        _id: invite._id,
        name: invite.name,
        email: invite.email,
        inviteLink: invite.inviteLink,
        status: invite.status
      }
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── GET /invite/status ────────────────────────────────────────────────────────
const getInviteStatus = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status && status !== 'all' ? { status } : {};
    const invites = await EmployeeInvite.find(filter).sort({ createdAt: -1 });
    return res.json(invites);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── GET /invite/register/:token (pre-check) ──────────────────────────────────
const getInviteByToken = async (req, res) => {
  try {
    let invite = await EmployeeInvite.findOne({ inviteToken: req.params.token });
    let role = 'employee';

    if (!invite) return res.status(404).json({ message: 'Invalid or expired invite link.' });
    if (invite.status === 'registered') {
      return res.status(400).json({ message: 'This invite has already been used. Please log in.' });
    }
    if (invite.status === 'cancelled') {
      return res.status(400).json({ message: 'This invite has been cancelled.' });
    }
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return res.status(400).json({ message: 'This invite link has expired. Please contact your admin for a new one.' });
    }

    let existing = null;
    if (invite.targetUserId) {
      existing = await User.findById(invite.targetUserId);
    }
    if (!existing && invite.employeeId) {
      existing = await User.findOne({ employeeId: invite.employeeId });
    }
    if (!existing) {
      existing = await User.findOne({ email: invite.email });
    }

    if (existing) {
      if (existing.isVacant || existing.role === 'position') {
        return res.status(400).json({ message: 'Vacant positions cannot register or authenticate as active employees.' });
      }
      if (existing.isArchivedDemo) {
        return res.status(400).json({ message: 'Archived demo accounts cannot register or authenticate as active employees.' });
      }
    }

    return res.json({
      name: invite.name,
      email: invite.email,
      employeeId: invite.employeeId || existing?.employeeId || null,
      role
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── POST /invite/register/:token ─────────────────────────────────────────────
const registerViaInvite = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    let invite = await EmployeeInvite.findOne({ inviteToken: req.params.token });
    let role = 'employee';

    if (!invite) return res.status(404).json({ message: 'Invalid or expired invite link.' });
    if (invite.status === 'registered') {
      return res.status(400).json({ message: 'This invite has already been used.' });
    }
    if (invite.status === 'cancelled') {
      return res.status(400).json({ message: 'This invite has been cancelled.' });
    }
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return res.status(400).json({ message: 'This invite link has expired. Please contact your admin.' });
    }

    // Locate target user: by targetUserId, employeeId, or email
    let existing = null;
    if (invite.targetUserId) {
      existing = await User.findById(invite.targetUserId);
    }
    if (!existing && invite.employeeId) {
      existing = await User.findOne({ employeeId: invite.employeeId });
    }
    if (!existing) {
      existing = await User.findOne({ email: invite.email });
    }

    // Safety checks against vacancies and archived demo accounts
    if (existing) {
      if (existing.isVacant || existing.role === 'position') {
        return res.status(400).json({ message: 'Vacant positions cannot register or authenticate as active employees.' });
      }
      if (existing.isArchivedDemo) {
        return res.status(400).json({ message: 'Archived demo accounts cannot register or authenticate as active employees.' });
      }
      if (!existing.isRosterOnly && existing.password) {
        return res.status(409).json({ message: 'An active account with this email or employee ID already exists. Please log in.' });
      }

      // Existing roster-only employee record: LINK AND UPGRADE IN-PLACE
      existing.email = invite.email;
      existing.name = invite.name || existing.name;
      existing.password = password; // pre-save hook will hash password
      existing.isRosterOnly = false;
      existing.isActive = true;
      existing.role = role;
      // Preserve formAccessGranted if already set, or false by default until admin grants access
      if (existing.formAccessGranted === undefined) {
        existing.formAccessGranted = false;
      }

      await existing.save();
    } else {
      // New employee identity without pre-existing roster record
      let employeeId = invite.employeeId || null;
      if (!employeeId && role === 'employee') {
        const allUsers = await User.find({ employeeId: { $regex: /^BPER-\d+$/ } }, 'employeeId').lean();
        let max = 100;
        allUsers.forEach(u => {
          const num = Number(String(u.employeeId).split('-')[1]);
          if (Number.isFinite(num) && num > max) max = num;
        });
        employeeId = `BPER-${String(max + 1).padStart(3, '0')}`;
      }

      await User.create({
        name: invite.name,
        email: invite.email,
        password,
        role: role,
        organization: role === 'admin' ? 'BPER' : '',
        employeeId: employeeId || undefined,
        isActive: true,
        isRosterOnly: false,
        isVacant: false,
        isArchivedDemo: false,
        formAccessGranted: false
      });
    }

    invite.status = 'registered';
    invite.registeredAt = new Date();
    await invite.save();

    return res.json({ message: 'Registration successful! You can now log in.' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};


module.exports = {
  uploadInviteList,
  confirmInvites,
  sendInvites,
  resendInvite,
  getInviteStatus,
  getInviteByToken,
  registerViaInvite
};
