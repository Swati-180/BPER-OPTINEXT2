const { v4: uuidv4 } = require('uuid');
const EmployeeInvite = require('../models/EmployeeInvite');
const AdminInvite = require('../models/AdminInvite');
const User = require('../models/User');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── Email helper (gracefully disabled if SMTP not configured) ─────────────────
async function sendInviteEmail(invite) {
  const emailHost = process.env.EMAIL_HOST || process.env.SMTP_HOST;
  const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
  const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  const emailPort = process.env.EMAIL_PORT || process.env.SMTP_PORT || 587;

  if (!emailHost || !emailUser || !emailPass) {
    return { sent: false, reason: 'Email service not configured' };
  }

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: Number(emailPort),
      secure: false,
      auth: { user: emailUser, pass: emailPass }
    });

    const emailFrom = process.env.EMAIL_FROM || `BPER Platform <${emailUser}>`;

    await transporter.sendMail({
      from: emailFrom,
      to: invite.email,
      subject: 'You are invited to join BPER Platform',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px 24px;background:#f8fbff;border-radius:12px;border:1px solid #e2e8f0">
          <h2 style="color:#1A5BA7;margin-bottom:8px">Welcome to BPER Platform</h2>
          <p style="color:#334155;font-size:15px">Hi ${invite.name},</p>
          <p style="color:#334155;font-size:15px">You've been invited to register on the BPER Platform by your administrator.</p>
          <p style="color:#334155;font-size:15px">Click the button below to complete your registration. This link expires in <strong>7 days</strong>.</p>
          <div style="text-align:center;margin:28px 0">
            <a href="${invite.inviteLink}" style="background:#1A5BA7;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">
              Complete Registration
            </a>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px">Or copy this link: <a href="${invite.inviteLink}" style="color:#1A5BA7">${invite.inviteLink}</a></p>
          <p style="color:#94a3b8;font-size:12px">If you did not expect this email, you can safely ignore it.</p>
        </div>
      `
    });

    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

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
    const emailNotConfigured = !(process.env.EMAIL_HOST || process.env.SMTP_HOST) || !(process.env.EMAIL_USER || process.env.SMTP_USER);

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
    const invite = await EmployeeInvite.findOne({ inviteToken: req.params.token });
    if (!invite) return res.status(404).json({ message: 'Invalid or expired invite link.' });
    if (invite.status === 'registered') {
      return res.status(400).json({ message: 'This invite has already been used. Please log in.' });
    }
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return res.status(400).json({ message: 'This invite link has expired. Please contact your admin for a new one.' });
    }
    return res.json({ name: invite.name, email: invite.email });
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

    const invite = await EmployeeInvite.findOne({ inviteToken: req.params.token });
    if (!invite) return res.status(404).json({ message: 'Invalid or expired invite link.' });
    if (invite.status === 'registered') {
      return res.status(400).json({ message: 'This invite has already been used.' });
    }
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return res.status(400).json({ message: 'This invite link has expired. Please contact your admin.' });
    }

    // Check if user already exists
    const existing = await User.findOne({ email: invite.email });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists. Please log in.' });
    }

    // Auto-generate employee ID
    const allUsers = await User.find({ employeeId: { $regex: /^BPER-\d+$/ } }, 'employeeId').lean();
    let max = 100;
    allUsers.forEach(u => {
      const num = Number(String(u.employeeId).split('-')[1]);
      if (Number.isFinite(num) && num > max) max = num;
    });
    const employeeId = `BPER-${String(max + 1).padStart(3, '0')}`;

    await User.create({
      name: invite.name,
      email: invite.email,
      password,
      role: 'employee',
      employeeId,
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

const listAdminInvites = async (req, res) => {
  try {
    const invites = await AdminInvite.find({ status: { $ne: 'cancelled' } }).sort({ createdAt: -1 });
    return res.json(invites);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const createAdminInvite = async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    const existingInvite = await AdminInvite.findOne({ email: normalizedEmail });
    if (existingInvite && existingInvite.status !== 'cancelled') {
      return res.status(409).json({ message: 'An admin invite already exists for that email.' });
    }

    const token = uuidv4();
    const inviteLink = `${FRONTEND_URL}/auth/signup?role=admin&org=${encodeURIComponent('BPER')}`;

    const invite = await AdminInvite.create({
      name: String(name).trim(),
      email: normalizedEmail,
      role: 'admin',
      status: 'pending',
      inviteLink,
      inviteToken: token,
      uploadedBy: req.user?.userId || null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    const result = await sendInviteEmail(invite);
    if (result.sent) {
      invite.status = 'sent';
      invite.sentAt = new Date();
      invite.errorMessage = '';
    } else {
      invite.status = 'failed';
      invite.errorMessage = result.reason || 'Unknown error';
    }
    await invite.save();

    return res.json({ message: result.sent ? 'Admin invite created and email sent.' : 'Admin invite created but email failed to send.', invite });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const resendAdminInvite = async (req, res) => {
  try {
    const invite = await AdminInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (invite.status === 'registered' || invite.status === 'cancelled') {
      return res.status(400).json({ message: 'This invite cannot be resent.' });
    }

    const token = uuidv4();
    invite.inviteToken = token;
    invite.inviteLink = `${FRONTEND_URL}/auth/signup?role=admin&org=${encodeURIComponent('BPER')}`;
    invite.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    invite.status = 'pending';
    invite.errorMessage = '';
    
    const result = await sendInviteEmail(invite);
    if (result.sent) {
      invite.status = 'sent';
      invite.sentAt = new Date();
      invite.errorMessage = '';
    } else {
      invite.status = 'failed';
      invite.errorMessage = result.reason || 'Unknown error';
    }
    await invite.save();

    return res.json({ message: result.sent ? 'Admin invite resent successfully.' : 'Admin invite link refreshed but email failed to send.', invite });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const cancelAdminInvite = async (req, res) => {
  try {
    const invite = await AdminInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    invite.status = 'cancelled';
    await invite.save();
    return res.json({ message: 'Admin invite cancelled.' });
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
  registerViaInvite,
  listAdminInvites,
  createAdminInvite,
  resendAdminInvite,
  cancelAdminInvite
};
