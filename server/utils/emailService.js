/**
 * BPER Email Service — Gmail SMTP via Nodemailer
 *
 * How it works:
 *   Your server opens an encrypted connection to Gmail's mail server,
 *   authenticates with an App Password, and sends the email as HTML.
 *   Gmail then delivers it to the recipient's inbox from your Gmail address.
 *
 * One-time Gmail setup (3 min):
 *   1. Go to myaccount.google.com → Security → 2-Step Verification → turn ON
 *   2. Go to myaccount.google.com/apppasswords
 *   3. Create a new App Password → Name it "BPER Server" → copy the 16-char key
 *   4. In server/.env set:
 *        GMAIL_USER=your_gmail@gmail.com
 *        GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   (the 16-char key, spaces OK)
 */

const nodemailer = require('nodemailer');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── Transporter (created once, reused) ──────────────────────────────────────

let _transporter = null;

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ''); // remove spaces

  if (!user || !pass) {
    console.warn('[Email] GMAIL_USER or GMAIL_APP_PASSWORD not set — emails will be skipped.');
    return null;
  }

  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',          // nodemailer knows Gmail's SMTP settings automatically
      auth: { user, pass },      // user = your Gmail, pass = App Password (NOT your Gmail password)
    });
  }
  return _transporter;
}

// ─── Core send ────────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) return;

  try {
    const info = await transporter.sendMail({
      from: `"BPER Platform" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[Email] Sent: "${subject}" → ${to} (id: ${info.messageId})`);
  } catch (err) {
    // Log but don't crash the server — email is best-effort
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, err.message);
    throw err;
  }
}

// ─── Shared template helpers ──────────────────────────────────────────────────

function statusColors(status) {
  if (status === 'Approved')          return { text: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' };
  if (status === 'Changes Requested') return { text: '#d97706', bg: '#fffbeb', border: '#fde68a' };
  return                                     { text: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };
}

function baseTemplate(content) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:36px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">
  <tr><td style="background:linear-gradient(135deg,#0d2445 0%,#1a56a4 100%);padding:28px 36px;">
    <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Business Process Excellence Review</p>
    <p style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:800;">BPER Platform</p>
  </td></tr>
  <tr><td style="padding:36px;">${content}</td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 36px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">Automated notification — please do not reply &middot; &copy; ${new Date().getFullYear()} Quintes Global</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function refBox(id, bg = '#eff6ff', color = '#1e3a8a') {
  return `<div style="background:${bg};border-radius:8px;padding:14px 18px;margin:20px 0;">
    <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.12em;">Reference ID</p>
    <p style="margin:0;font-size:19px;font-weight:800;color:${color};font-family:monospace;">${id}</p>
  </div>`;
}

function cta(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#1a56a4;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 30px;border-radius:9px;margin-top:8px;">${label} →</a>`;
}

// ─── Email templates ──────────────────────────────────────────────────────────

/**
 * Sent to employee right after they submit a WDT form.
 */
async function sendSubmissionConfirmationEmail(employee, referenceId) {
  if (!employee?.email) return;
  await sendEmail({
    to: employee.email,
    subject: `[BPER] Submission Confirmed — ${referenceId}`,
    html: baseTemplate(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.12em;">Form Submitted</p>
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#0d2445;">Submission Confirmed ✓</h2>
      <p style="font-size:15px;color:#374151;line-height:1.65;">Hi <strong>${employee.name || 'there'}</strong>,<br><br>
        Your BPER Work Detail Template has been submitted successfully and is now <strong>pending manager review</strong>.</p>
      ${refBox(referenceId)}
      <p style="font-size:14px;color:#4b5563;line-height:1.65;margin-bottom:24px;">You will receive another email once your manager reviews your submission.</p>
      ${cta(`${FRONTEND_URL}/employee/status`, 'View Form Status')}
    `),
  });
}

/**
 * Sent to employee when manager approves or requests changes.
 */
async function sendReviewNotificationEmail(employee, referenceId, status, comment, managerName) {
  if (!employee?.email) return;
  const { text: col, bg, border } = statusColors(status);
  const isChanges = status === 'Changes Requested';
  const label = status === 'Approved' ? 'Approved ✓' : isChanges ? 'Changes Requested ✎' : status;

  await sendEmail({
    to: employee.email,
    subject: `[BPER] ${label} — ${referenceId}`,
    html: baseTemplate(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.12em;">Manager Review</p>
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#0d2445;">Your Form Has Been Reviewed</h2>
      <p style="font-size:15px;color:#374151;line-height:1.65;">Hi <strong>${employee.name || 'there'}</strong>,<br><br>
        ${isChanges
          ? `<strong>${managerName || 'Your manager'}</strong> has reviewed your form and requested some changes.`
          : `Your form has been <strong>approved</strong> by ${managerName || 'your manager'}.`
        }</p>
      <div style="background:${bg};border:1px solid ${border};border-radius:9px;padding:16px 20px;margin:18px 0;">
        <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:${col};text-transform:uppercase;letter-spacing:0.12em;">Status</p>
        <p style="margin:0;font-size:17px;font-weight:800;color:${col};">${label}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#64748b;font-family:monospace;">Ref: ${referenceId}</p>
      </div>
      ${comment ? `
      <div style="background:#f8fafc;border-left:3px solid ${col};border-radius:4px;padding:14px 18px;margin:0 0 18px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;">Comment — ${managerName || 'Manager'}</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${comment.replace(/\n/g, '<br>')}</p>
      </div>` : ''}
      <p style="font-size:14px;color:#4b5563;margin-bottom:24px;">
        ${isChanges ? 'Please log in, make the changes, and resubmit your form.' : 'Your submission is complete. No further action is needed.'}
      </p>
      ${cta(`${FRONTEND_URL}/employee/status`, isChanges ? 'Update My Submission' : 'View Submission')}
    `),
  });
}

/**
 * Sent when employee resubmits after changes were requested.
 */
async function sendResubmissionEmail(employee, referenceId) {
  if (!employee?.email) return;
  await sendEmail({
    to: employee.email,
    subject: `[BPER] Resubmission Received — ${referenceId}`,
    html: baseTemplate(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.12em;">Resubmission</p>
      <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#0d2445;">Form Resubmitted</h2>
      <p style="font-size:15px;color:#374151;line-height:1.65;">Hi <strong>${employee.name || 'there'}</strong>,<br><br>
        Your updated BPER submission has been sent back for manager review.</p>
      ${refBox(referenceId, '#f0fdf4', '#166534')}
      <p style="font-size:14px;color:#4b5563;margin-bottom:24px;">You will be notified once your manager completes the review.</p>
      ${cta(`${FRONTEND_URL}/employee/status`, 'View Form Status')}
    `),
  });
}

module.exports = { sendSubmissionConfirmationEmail, sendReviewNotificationEmail, sendResubmissionEmail };
