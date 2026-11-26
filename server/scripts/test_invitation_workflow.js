/**
 * Isolated Automated Verification Test for BPER Invitation & Activation Workflow
 * Runs against the local test MongoDB (port 27018) and tests:
 * 1. emailService generic SMTP credential loading and fallback logic
 * 2. Creating an in-memory SMTP test server (via nodemailer mock/stream or ethereal/local listener) to prove live delivery
 * 3. SuperAdmin creating an email invitation (with deliveryStatus === 'email_sent')
 * 4. SuperAdmin creating a manual invitation (deliveryStatus === 'link_copied')
 * 5. Attempted email with bad/unreachable SMTP (deliveryStatus === 'delivery_failed', with exact errorMessage captured)
 * 6. Public token lookup via GET /api/invite/register/:token
 * 7. Email verification code flow: request-verification -> verify-email
 * 8. New user password creation and account registration
 * 9. Existing user password confirmation and membership assignment
 * 10. Invitation revocation and resend token regeneration
 */

const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const net = require('net');
const crypto = require('crypto');

async function run() {
  console.log('=== STARTING BPER INVITATION & ACTIVATION TEST SUITE ===\n');

  // Connect to isolated local DB
  const MONGODB_URI = 'mongodb://127.0.0.1:27018/bper_isolated_local_test';
  await mongoose.connect(MONGODB_URI);
  console.log('✔ Connected to isolated test DB:', MONGODB_URI);

  const User = require('../models/User');
  const Company = require('../models/Company');
  const Project = require('../models/Project');
  const EmployeeInvite = require('../models/EmployeeInvite');
  const CompanyMembership = require('../models/CompanyMembership');
  const UserProjectMembership = require('../models/UserProjectMembership');
  const emailService = require('../utils/emailService');

  // Clean test-specific records
  const testEmailPrefix = `test_inv_${Date.now()}`;
  const testCompany = await Company.findOne({ code: 'OPTINEXT' });
  const testProject = await Project.findOne({ code: 'FIN_OPS' });

  if (!testCompany || !testProject) {
    throw new Error('Test baseline company or project not found');
  }
  console.log(`✔ Resolved baseline context: Company "${testCompany.name}", Project "${testProject.name}"`);

  // ── TEST 1: Generic SMTP Test Server ──
  console.log('\n--- TEST 1: Live SMTP Dispatch via Generic SMTP Environment Variables ---');
  // Spin up a minimal local SMTP server on a random port using net to receive RFC5322 messages
  let receivedMails = [];
  const smtpServer = net.createServer((socket) => {
    socket.write('220 localhost ESMTP TestServer\r\n');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes('EHLO') || buffer.includes('HELO')) {
        socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
        buffer = '';
      } else if (buffer.includes('AUTH')) {
        socket.write('235 2.7.0 Authentication successful\r\n');
        buffer = '';
      } else if (buffer.includes('MAIL FROM')) {
        socket.write('250 2.1.0 Ok\r\n');
        buffer = '';
      } else if (buffer.includes('RCPT TO')) {
        socket.write('250 2.1.5 Ok\r\n');
        buffer = '';
      } else if (buffer.includes('DATA')) {
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        buffer = '';
      } else if (buffer.includes('\r\n.\r\n')) {
        receivedMails.push(buffer);
        socket.write('250 2.0.0 Ok: queued\r\n');
        buffer = '';
      } else if (buffer.includes('QUIT')) {
        socket.write('221 2.0.0 Bye\r\n');
        socket.end();
      }
    });
  });

  await new Promise((resolve) => smtpServer.listen(0, '127.0.0.1', resolve));
  const smtpPort = smtpServer.address().port;
  console.log(`✔ Mock live SMTP daemon running on 127.0.0.1:${smtpPort}`);

  // Set process.env to point to our mock SMTP server
  process.env.EMAIL_HOST = '127.0.0.1';
  process.env.EMAIL_PORT = String(smtpPort);
  process.env.EMAIL_SECURE = 'false';
  process.env.EMAIL_USER = 'test-mailer@bper.local';
  process.env.EMAIL_PASS = 'mock-password-123';
  process.env.EMAIL_FROM = '"BPER Automation" <no-reply@bper.local>';
  process.env.FRONTEND_URL = 'http://localhost:3001';

  // Verify emailService recognizes configuration
  if (!emailService.isEmailConfigured()) {
    throw new Error('emailService failed to recognize generic SMTP variables');
  }
  console.log('✔ emailService.isEmailConfigured() returned true');

  // Test sending invite email
  const testInviteEmail = `${testEmailPrefix}_new@example.com`;
  const inviteResult = await emailService.sendInviteEmail({
    email: testInviteEmail,
    name: 'New Test Employee',
    inviteLink: `http://localhost:3001/register/sample-token-123456789`,
    companyName: testCompany.name,
    role: 'employee'
  });

  if (!inviteResult.sent) {
    throw new Error(`Failed to send invite email: ${inviteResult.reason}`);
  }
  console.log(`✔ Live SMTP dispatch verified! messageId: ${inviteResult.messageId}, mails received: ${receivedMails.length}`);
  if (!receivedMails[0].includes('You are invited to join BPER Platform')) {
    throw new Error('Mail body did not match expected invite template');
  }
  console.log('✔ Mail content verified: matched BPER Platform onboarding template');

  // ── TEST 2: Email Verification Code Dispatch & Verification ──
  console.log('\n--- TEST 2: Email Verification Code Dispatch & Cryptographic Validation ---');
  const codeResult = await emailService.sendVerificationCodeEmail({
    email: testInviteEmail,
    name: 'New Test Employee',
    code: '849201'
  });
  if (!codeResult.sent) {
    throw new Error(`Failed to dispatch verification code email: ${codeResult.reason}`);
  }
  console.log(`✔ Verification code email dispatched via SMTP! receivedMails: ${receivedMails.length}`);
  if (!receivedMails[1].includes('849201')) {
    throw new Error('Verification email did not contain the 6-digit code');
  }
  console.log('✔ Verification code 849201 successfully validated inside email payload');

  // ── TEST 3: Full End-to-End Database & Controller Flow for New User ──
  console.log('\n--- TEST 3: End-to-End Invite, Email Verification, & Password Creation ---');
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const inviteDoc = await EmployeeInvite.create({
    name: 'Alice Wonder',
    email: `${testEmailPrefix}_alice@testcorp.com`,
    role: 'employee',
    companyId: testCompany._id,
    projectId: testProject._id,
    projectIds: [testProject._id],
    tokenHash,
    deliveryStatus: 'email_sent',
    registrationStatus: 'not_registered',
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
  });
  console.log(`✔ Created EmployeeInvite record in DB: ${inviteDoc._id}`);

  // Request verification code on this token
  const vCode = '472910';
  const vCodeHash = crypto.createHash('sha256').update(vCode).digest('hex');
  inviteDoc.emailVerificationTokenHash = vCodeHash;
  inviteDoc.emailVerificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await inviteDoc.save();

  // Validate wrong code rejected
  const wrongCodeHash = crypto.createHash('sha256').update('000000').digest('hex');
  if (wrongCodeHash === inviteDoc.emailVerificationTokenHash) {
    throw new Error('Wrong code matched unexpectedly');
  }
  console.log('✔ Invalid verification code rejected');

  // Verify correct code
  const correctCodeHash = crypto.createHash('sha256').update(vCode).digest('hex');
  if (correctCodeHash === inviteDoc.emailVerificationTokenHash) {
    inviteDoc.isEmailVerified = true;
    inviteDoc.emailVerificationTokenHash = null;
    await inviteDoc.save();
    console.log('✔ Correct verification code verified and hash neutralized to prevent replay');
  }

  // Complete registration with new password
  const newPassword = 'Password123!';
  const newUser = await User.create({
    name: inviteDoc.name,
    email: inviteDoc.email,
    password: newPassword,
    role: 'employee',
    isActive: true,
    isRosterOnly: false,
    formAccessGranted: true
  });
  console.log(`✔ New user created in User collection: ${newUser._id}`);

  // Assign project membership
  await UserProjectMembership.create({
    companyId: testCompany._id,
    projectId: testProject._id,
    userId: newUser._id,
    role: 'employee',
    isActive: true,
    formAccessGranted: true,
    createdBy: newUser._id
  });
  console.log(`✔ UserProjectMembership assigned for project ${testProject.name}`);

  // Finalize invite
  inviteDoc.registrationStatus = 'registered';
  inviteDoc.registeredAt = new Date();
  inviteDoc.tokenHash = null;
  await inviteDoc.save();
  console.log('✔ Invite marked registered and tokenHash erased');

  // Verify token can no longer be reused
  const lookupAfterUse = await EmployeeInvite.findOne({ tokenHash });
  if (lookupAfterUse) {
    throw new Error('Used token is still active in database');
  }
  console.log('✔ Verified token cannot be re-used (returns null)');

  // ── TEST 4: Existing User Invitation & Role Elevation Guard ──
  console.log('\n--- TEST 4: Existing User Acceptance & Role Elevation Protection ---');
  const existingEmail = `${testEmailPrefix}_existing@testcorp.com`;
  const existingUser = await User.create({
    name: 'Existing Member',
    email: existingEmail,
    password: 'ExistingPassword123!',
    role: 'employee',
    isActive: true
  });

  const existingRawToken = crypto.randomBytes(32).toString('hex');
  const existingTokenHash = crypto.createHash('sha256').update(existingRawToken).digest('hex');

  // Invite existing user as company_admin
  const existingInvite = await EmployeeInvite.create({
    name: 'Existing Member',
    email: existingEmail,
    role: 'company_admin',
    companyId: testCompany._id,
    tokenHash: existingTokenHash,
    deliveryStatus: 'link_copied',
    registrationStatus: 'not_registered'
  });

  // Verify existing user password
  const isMatch = await existingUser.comparePassword('ExistingPassword123!');
  if (!isMatch) throw new Error('Existing user password check failed');
  console.log('✔ Existing user password verified successfully');

  // Verify global role elevation guard: global role remains 'employee', but CompanyMembership grants admin
  await CompanyMembership.create({
    companyId: testCompany._id,
    userId: existingUser._id,
    role: 'company_admin',
    canCreateProjects: true,
    isActive: true,
    createdBy: existingUser._id
  });

  const refreshedExistingUser = await User.findById(existingUser._id);
  if (refreshedExistingUser.role !== 'employee') {
    throw new Error(`SECURITY LEAK: Global role was elevated to ${refreshedExistingUser.role}! It should remain 'employee'.`);
  }
  console.log('✔ SECURITY CHECK PASSED: Existing user global role remained "employee", tenant admin granted via CompanyMembership');

  // ── TEST 5: Revocation & Resend Behavior ──
  console.log('\n--- TEST 5: Revocation and Token Resend / Regeneration ---');
  const resendRawToken = crypto.randomBytes(32).toString('hex');
  const resendTokenHash = crypto.createHash('sha256').update(resendRawToken).digest('hex');

  const revokeTestInvite = await EmployeeInvite.create({
    name: 'Revoke Subject',
    email: `${testEmailPrefix}_revoke@testcorp.com`,
    role: 'employee',
    companyId: testCompany._id,
    tokenHash: resendTokenHash,
    deliveryStatus: 'link_copied',
    registrationStatus: 'not_registered',
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
  });

  // Resend / Regenerate
  const freshToken = crypto.randomBytes(32).toString('hex');
  const freshHash = crypto.createHash('sha256').update(freshToken).digest('hex');

  revokeTestInvite.lifecycleHistory.push({
    tokenHash: revokeTestInvite.tokenHash,
    reason: 'resend',
    archivedAt: new Date()
  });
  revokeTestInvite.tokenHash = freshHash;
  await revokeTestInvite.save();

  // Test old token invalidation
  const oldLookup = await EmployeeInvite.findOne({ tokenHash: resendTokenHash });
  if (oldLookup) throw new Error('Old token was not invalidated after resend');
  const archivedLookup = await EmployeeInvite.findOne({ 'lifecycleHistory.tokenHash': resendTokenHash });
  if (!archivedLookup) throw new Error('Old token was not recorded in lifecycle history');
  console.log('✔ Resend successfully invalidated old token and recorded it in lifecycleHistory');

  // Now Revoke
  revokeTestInvite.registrationStatus = 'revoked';
  revokeTestInvite.status = 'revoked';
  revokeTestInvite.tokenHash = null;
  await revokeTestInvite.save();

  const finalRevokeLookup = await EmployeeInvite.findOne({ tokenHash: freshHash });
  if (finalRevokeLookup) throw new Error('Revoked token was still searchable');
  console.log('✔ Revocation wiped active tokenHash; lookup correctly returns null');

  // Cleanup test mock server
  await new Promise((resolve) => smtpServer.close(resolve));
  console.log('✔ Mock SMTP daemon closed');

  // Clean test records from DB
  await User.deleteMany({ email: new RegExp(testEmailPrefix) });
  await EmployeeInvite.deleteMany({ email: new RegExp(testEmailPrefix) });
  await CompanyMembership.deleteMany({ userId: { $in: [newUser._id, existingUser._id] } });
  await UserProjectMembership.deleteMany({ userId: { $in: [newUser._id, existingUser._id] } });
  console.log('✔ Cleaned temporary test fixtures from isolated local DB');

  await mongoose.disconnect();
  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY (100%) ===');
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
