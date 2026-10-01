const { v4: uuidv4 } = require('uuid');
const EmployeeInvite = require('../models/EmployeeInvite');
const User = require('../models/User');
const { isEmailConfigured, sendInviteEmail } = require('../utils/emailService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// ─── POST /invite/upload ───────────────────────────────────────────────────────
// Validates a list of { name, email } rows and returns preview (valid/invalid)
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

      valid.push({ name, email, rowNum });
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

      // Check if already exists
      const existing = await EmployeeInvite.findOne({ email });
      if (existing) {
        skipped.push({ email, reason: 'Invite already exists — use Resend to refresh' });
        continue;
      }

      // Check if already a registered user
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        skipped.push({ email, reason: 'Email already registered as a user' });
        continue;
      }

      const token = uuidv4();
      const inviteLink = `${FRONTEND_URL}/register/invite/${token}`;

      const invite = await EmployeeInvite.create({
        name,
        email,
        inviteToken: token,
        inviteLink,
        status: 'pending',
        uploadedBy: req.user?.userId || null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      saved.push({ name, email, inviteLink, _id: invite._id });
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
    return res.json({ name: invite.name, email: invite.email, role });
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

    // Check if user already exists
    const existing = await User.findOne({ email: invite.email });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists. Please log in.' });
    }

    let employeeId = null;
    if (role === 'employee') {
      // Auto-generate employee ID
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
      formAccessGranted: false
    });

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
