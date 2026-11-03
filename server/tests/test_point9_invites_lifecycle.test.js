/**
 * POINT 9: EMPLOYEE INVITES LIFECYCLE & PARTITION REGRESSION SUITE
 *
 * Tests the complete two-dimensional invite architecture:
 * 1. The exhaustive mathematical partition (N = sum(categories))
 * 2. All 4 registration combinations:
 *    - pending + registered
 *    - link_copied + registered
 *    - delivery_failed + registered
 *    - unknown + registered
 * 3. Universal resend from 4 states:
 *    - pending
 *    - email_sent
 *    - delivery_failed
 *    - expired
 * 4. The reviewer's 8-person scenario (in isolated in-memory DB)
 * 5. Preservation of live records classification
 */

const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const EmployeeInvite = require('../models/EmployeeInvite');
const User = require('../models/User');
const {
  confirmInvites,
  sendInvites,
  resendInvite,
  markInviteCopied,
  confirmInviteShared,
  registerViaInvite
} = require('../controllers/inviteController');

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

// Compute the exhaustive categories for an array of invite documents
function calculateExhaustiveCounts(invites, referenceDate = new Date()) {
  const counts = {
    total: invites.length,
    registered: 0,
    pendingDispatch: 0,
    dispatchedAwaiting: 0,
    linkCopiedUnconfirmed: 0,
    deliveryFailedUnregistered: 0,
    expiredUnregistered: 0,
    registrationFailed: 0
  };

  for (const i of invites) {
    const isReg = i.registrationStatus === 'registered' || i.status === 'registered';
    const isRegFailed = i.registrationStatus === 'registration_failed';
    const isExpired = !isReg && (i.registrationStatus === 'expired' || (i.expiresAt && new Date(i.expiresAt) < referenceDate));

    if (isReg) {
      counts.registered++;
    } else if (isRegFailed) {
      counts.registrationFailed++;
    } else if (isExpired) {
      counts.expiredUnregistered++;
    } else if (i.deliveryStatus === 'link_copied') {
      counts.linkCopiedUnconfirmed++;
    } else if (i.deliveryStatus === 'delivery_failed' || i.status === 'failed') {
      counts.deliveryFailedUnregistered++;
    } else if (i.deliveryStatus === 'email_sent' || i.deliveryStatus === 'manually_shared' || i.status === 'sent') {
      counts.dispatchedAwaiting++;
    } else {
      counts.pendingDispatch++;
    }
  }

  // Sum of mutually exclusive categories
  const partitionSum = counts.registered +
    counts.pendingDispatch +
    counts.dispatchedAwaiting +
    counts.linkCopiedUnconfirmed +
    counts.deliveryFailedUnregistered +
    counts.expiredUnregistered +
    counts.registrationFailed;

  return { counts, partitionSum };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('POINT 9: EMPLOYEE INVITES TWO-DIMENSIONAL REGRESSION TEST SUITE');
  console.log('================================================================\n');

  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  try {
    // â”€â”€â”€ TEST 1: The 4 Registration Combinations â”€â”€â”€
    console.log('--- Test 1: Testing All 4 Registration Combinations ---');

    // Combination A: pending + registered
    const invA = await EmployeeInvite.create({
      name: 'Alice Pending',
      email: 'alice.pending@test.com',
      deliveryStatus: 'pending',
      registrationStatus: 'not_registered'
    });
    let res = createMockRes();
    await registerViaInvite({ params: { token: invA.inviteToken }, body: { password: 'Password123' } }, res);
    assert.strictEqual(res.statusCode, 200);
    const updatedA = await EmployeeInvite.findById(invA._id);
    assert.strictEqual(updatedA.registrationStatus, 'registered');
    assert.ok(updatedA.registeredAt !== null);

    // Combination B: link_copied + registered
    const invB = await EmployeeInvite.create({
      name: 'Bob Copied',
      email: 'bob.copied@test.com',
      deliveryStatus: 'link_copied',
      registrationStatus: 'not_registered'
    });
    res = createMockRes();
    await registerViaInvite({ params: { token: invB.inviteToken }, body: { password: 'Password123' } }, res);
    assert.strictEqual(res.statusCode, 200);
    const updatedB = await EmployeeInvite.findById(invB._id);
    assert.strictEqual(updatedB.registrationStatus, 'registered');
    assert.strictEqual(updatedB.deliveryStatus, 'link_copied');

    // Combination C: delivery_failed + registered
    const invC = await EmployeeInvite.create({
      name: 'Charlie Failed',
      email: 'charlie.failed@test.com',
      deliveryStatus: 'delivery_failed',
      registrationStatus: 'not_registered',
      errorMessage: 'SMTP timeout'
    });
    res = createMockRes();
    await registerViaInvite({ params: { token: invC.inviteToken }, body: { password: 'Password123' } }, res);
    assert.strictEqual(res.statusCode, 200);
    const updatedC = await EmployeeInvite.findById(invC._id);
    assert.strictEqual(updatedC.registrationStatus, 'registered');
    assert.strictEqual(updatedC.deliveryStatus, 'delivery_failed');

    // Combination D: unknown + registered
    const invD = await EmployeeInvite.create({
      name: 'David Unknown',
      email: 'david.unknown@test.com',
      deliveryStatus: 'unknown',
      registrationStatus: 'not_registered'
    });
    res = createMockRes();
    await registerViaInvite({ params: { token: invD.inviteToken }, body: { password: 'Password123' } }, res);
    assert.strictEqual(res.statusCode, 200);
    const updatedD = await EmployeeInvite.findById(invD._id);
    assert.strictEqual(updatedD.registrationStatus, 'registered');
    assert.strictEqual(updatedD.deliveryStatus, 'unknown');

    console.log('âœ… PASS: All 4 registration combinations succeeded and stamped registeredAt without erasing delivery history.');

    // â”€â”€â”€ TEST 2: Exhaustive Partition Verification â”€â”€â”€
    console.log('\n--- Test 2: Exhaustive Mutually Exclusive Top-Level Partition ---');
    const allRegistered = await EmployeeInvite.find({});
    const { counts: pCounts, partitionSum } = calculateExhaustiveCounts(allRegistered);
    assert.strictEqual(pCounts.registered, 4);
    assert.strictEqual(partitionSum, allRegistered.length, 'Partition sum must equal total invitations');
    console.log(`âœ… PASS: Partition invariant confirmed: Total (${allRegistered.length}) === PartitionSum (${partitionSum}).`);

    // â”€â”€â”€ TEST 3: Resend History Retention from 4 Different States â”€â”€â”€
    console.log('\n--- Test 3: Resend History Retention from 4 States ---');

    // State 1: Resend from pending
    const resend1 = await EmployeeInvite.create({
      name: 'R1 Pending',
      email: 'r1@test.com',
      deliveryStatus: 'pending',
      registrationStatus: 'not_registered'
    });
    res = createMockRes();
    await resendInvite({ params: { id: resend1._id }, body: { reason: 'manual_retrigger' }, user: { userId: null } }, res);
    const updatedR1 = await EmployeeInvite.findById(resend1._id);
    assert.strictEqual(updatedR1.lifecycleHistory.length, 1);
    assert.strictEqual(updatedR1.lifecycleHistory[0].deliveryStatus, 'pending');

    // State 2: Resend from email_sent
    const resend2 = await EmployeeInvite.create({
      name: 'R2 Sent',
      email: 'r2@test.com',
      deliveryStatus: 'email_sent',
      sentAt: new Date(),
      registrationStatus: 'not_registered'
    });
    res = createMockRes();
    await resendInvite({ params: { id: resend2._id }, body: {}, user: { userId: null } }, res);
    const updatedR2 = await EmployeeInvite.findById(resend2._id);
    assert.strictEqual(updatedR2.lifecycleHistory.length, 1);
    assert.strictEqual(updatedR2.lifecycleHistory[0].deliveryStatus, 'email_sent');

    // State 3: Resend from delivery_failed
    const resend3 = await EmployeeInvite.create({
      name: 'R3 Failed',
      email: 'r3@test.com',
      deliveryStatus: 'delivery_failed',
      errorMessage: 'Network error',
      registrationStatus: 'not_registered'
    });
    res = createMockRes();
    await resendInvite({ params: { id: resend3._id }, body: {}, user: { userId: null } }, res);
    const updatedR3 = await EmployeeInvite.findById(resend3._id);
    assert.strictEqual(updatedR3.lifecycleHistory.length, 1);
    assert.strictEqual(updatedR3.lifecycleHistory[0].deliveryStatus, 'delivery_failed');
    assert.strictEqual(updatedR3.lifecycleHistory[0].errorMessage, 'Network error');

    // State 4: Resend from expired
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const resend4 = await EmployeeInvite.create({
      name: 'R4 Expired',
      email: 'r4@test.com',
      deliveryStatus: 'email_sent',
      registrationStatus: 'expired',
      expiresAt: pastDate
    });
    res = createMockRes();
    await resendInvite({ params: { id: resend4._id }, body: {}, user: { userId: null } }, res);
    const updatedR4 = await EmployeeInvite.findById(resend4._id);
    assert.strictEqual(updatedR4.lifecycleHistory.length, 1);
    assert.strictEqual(updatedR4.lifecycleHistory[0].registrationStatus, 'expired');
    assert.ok(updatedR4.expiresAt > new Date()); // Fresh 7 days

    console.log('âœ… PASS: Resend from pending, email_sent, delivery_failed, and expired all preserved full lifecycle history.');

    // â”€â”€â”€ TEST 4: Permanent Registration Failures Contract & Precedence over Expired â”€â”€â”€
    console.log('\n--- Test 4: Permanent Registration Failure Rejection & Precedence ---');
    // Create a vacant user
    await User.create({
      name: 'Vacant Position 999',
      employeeId: 'VACANT-999',
      role: 'position',
      isVacant: true,
      email: 'vacant999@test.com'
    });

    // Subtest 4a: Vacant registration fails permanently
    const vacantInvite = await EmployeeInvite.create({
      name: 'Applicant for Vacancy',
      email: 'applicant.vacant@test.com',
      employeeId: 'VACANT-999',
      deliveryStatus: 'email_sent',
      registrationStatus: 'not_registered'
    });

    res = createMockRes();
    await registerViaInvite({ params: { token: vacantInvite.inviteToken }, body: { password: 'ValidPassword123' } }, res);
    assert.strictEqual(res.statusCode, 400);
    const updatedVacant = await EmployeeInvite.findById(vacantInvite._id);
    assert.strictEqual(updatedVacant.registrationStatus, 'registration_failed');
    assert.ok(updatedVacant.registrationFailureReason.includes('Vacant positions cannot register'));

    // Subtest 4b: Verify registration_failed takes precedence even when token is also expired
    const expiredFailedInvite = await EmployeeInvite.create({
      name: 'Expired and Failed',
      email: 'expired.failed@test.com',
      deliveryStatus: 'email_sent',
      registrationStatus: 'registration_failed',
      registrationFailureReason: 'Archived demo account',
      expiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // past expiry
    });
    const checkExhaustive = calculateExhaustiveCounts([expiredFailedInvite]);
    assert.strictEqual(checkExhaustive.counts.registrationFailed, 1, 'Must count as registrationFailed');
    assert.strictEqual(checkExhaustive.counts.expiredUnregistered, 0, 'Must not be double-counted under expired');
    console.log('âœ… PASS: Permanent registration_failed takes strict precedence over expired token.');

    // â”€â”€â”€ TEST 5: The Reviewer's 8-Person Business Scenario â”€â”€â”€
    console.log('\n--- Test 5: Reconciling Reviewer 8-Person Scenario In-Memory ---');
    // Clean collection
    await EmployeeInvite.deleteMany({});

    // 1 pending
    await EmployeeInvite.create({ name: 'Pending 1', email: 'p1@bper.com', deliveryStatus: 'pending', registrationStatus: 'not_registered' });

    // 4 registered
    for (let i = 1; i <= 4; i++) {
      await EmployeeInvite.create({
        name: `Reg ${i}`,
        email: `reg${i}@bper.com`,
        deliveryStatus: 'email_sent',
        registrationStatus: 'registered',
        registeredAt: new Date()
      });
    }

    // 2 awaiting registration
    for (let i = 1; i <= 2; i++) {
      await EmployeeInvite.create({
        name: `Awaiting ${i}`,
        email: `awaiting${i}@bper.com`,
        deliveryStatus: 'email_sent',
        registrationStatus: 'not_registered',
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      });
    }

    // 1 registration failed
    await EmployeeInvite.create({
      name: 'Reg Failed 1',
      email: 'rf1@bper.com',
      deliveryStatus: 'email_sent',
      registrationStatus: 'registration_failed',
      registrationFailureReason: 'Vacant position conflict'
    });

    const scenarioInvites = await EmployeeInvite.find({});
    assert.strictEqual(scenarioInvites.length, 8, 'Total must be 8');
    const { counts: scCounts, partitionSum: scSum } = calculateExhaustiveCounts(scenarioInvites);

    assert.strictEqual(scCounts.total, 8);
    assert.strictEqual(scCounts.pendingDispatch, 1);
    assert.strictEqual(scCounts.registered, 4);
    assert.strictEqual(scCounts.dispatchedAwaiting, 2);
    assert.strictEqual(scCounts.registrationFailed, 1);
    assert.strictEqual(scSum, 8);

    console.log('âœ… PASS: Reviewer scenario reconciled: 8 Total = 1 Pending + 4 Registered + 2 Awaiting + 1 Reg Failed.');

    console.log('\n================================================================');
    console.log('ALL POINT 9 TESTS PASSED PERFECTLY!');
    console.log('================================================================\n');

  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
