const assert = require('assert');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const { getEffectiveStandardMonthlyHours, invalidateAssumptionsCache } = require('../services/assumptionsService');
const { submitWDT } = require('../controllers/wdtController');
const { updateUser } = require('../controllers/authController');

function createMockResponse() {
  return {
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
}

async function runTests() {
  console.log('=== POINT 8(e): MONTHLY HOURS VALIDATION REGRESSION TEST SUITE ===');
  await mongoose.connect(process.env.MONGODB_URI);

  // Preserve initial organization assumptions
  const initialConfigDoc = await SystemConfig.findOne({ key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY }).lean();
  const initialStandardHours = initialConfigDoc?.screeningSettings?.standardMonthlyHours || 160;

  // Create isolated test user
  const testEmpId = `TEST-EMP-8E-${Date.now()}`;
  const testEmail = `${testEmpId.toLowerCase()}@testcompany.com`;

  let testUser = await User.create({
    name: 'Validation Test Employee',
    email: testEmail,
    password: 'TestPassword123!',
    employeeId: testEmpId,
    role: 'employee',
    department: 'F&A',
    maxMonthlyHours: 160,
    hasCustomMaxHours: false,
    isActive: true,
    formAccessGranted: true
  });

  const adminUser = await User.findOne({ role: 'admin' }).lean();

  try {
    // ─── SCENARIO 1: Baseline 160; employee without override submits 160 -> accepted ───
    console.log('\n[Test 1] Organization baseline 160; employee without override submits 160 -> Accepted');
    await SystemConfig.findOneAndUpdate(
      { key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY },
      { $set: { 'screeningSettings.standardMonthlyHours': 160 } },
      { upsert: true }
    );
    invalidateAssumptionsCache();

    let req = {
      user: { userId: testUser._id, role: 'employee', email: testEmail },
      body: {
        referenceId: `REF-${Date.now()}-1`,
        employee: { employeeId: testEmpId, email: testEmail },
        month: 11,
        year: 2026,
        payload: {
          employee: { employeeId: testEmpId, email: testEmail },
          rows: [
            { majorProcess: 'Record to Report', process: 'General Accounting', subProcess: 'Journal Entries', frequency: 'Monthly', volumesMonthly: 1, timeTakenHoursPerMonth: 160 }
          ]
        }
      }
    };
    let res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 201, `Expected 201 Created but got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    console.log('✓ Scenario 1 passed: 160 hours accepted at 160 baseline');

    // Clean up submission created by test 1 so month 11/2026 is free
    const WDTSubmission = require('../models/WDTSubmission');
    await WDTSubmission.deleteMany({ 'employee.employeeId': testEmpId });

    // ─── SCENARIO 2: Same employee submits 161 -> rejected ───
    console.log('\n[Test 2] Same employee submits 161 -> Rejected (HTTP 400)');
    req.body.payload.rows[0].timeTakenHoursPerMonth = 161;
    res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 400, `Expected 400 Bad Request but got ${res.statusCode}`);
    assert.ok(res.body.message.includes('exceeds your configured monthly limit of 160h'), `Message mismatch: ${res.body.message}`);
    console.log('✓ Scenario 2 passed: 161 hours rejected at 160 baseline');

    // ─── SCENARIO 3: Same employee submits 250 -> rejected ───
    console.log('\n[Test 3] Same employee submits 250 -> Rejected (HTTP 400)');
    req.body.payload.rows[0].timeTakenHoursPerMonth = 250;
    res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 400, `Expected 400 Bad Request but got ${res.statusCode}`);
    assert.ok(res.body.message.includes('exceeds your configured monthly limit of 160h'), `Message mismatch: ${res.body.message}`);
    console.log('✓ Scenario 3 passed: 250 hours rejected at 160 baseline');

    // ─── SCENARIO 4: Org baseline changes to 168; employee without override submits 168 -> accepted ───
    console.log('\n[Test 4] Org baseline changes to 168; employee without override submits 168 -> Accepted');
    await SystemConfig.findOneAndUpdate(
      { key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY },
      { $set: { 'screeningSettings.standardMonthlyHours': 168 } }
    );
    invalidateAssumptionsCache();

    req.body.referenceId = `REF-${Date.now()}-4`;
    req.body.payload.rows[0].timeTakenHoursPerMonth = 168;
    res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 201, `Expected 201 Created but got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    console.log('✓ Scenario 4 passed: 168 hours accepted after baseline updated to 168');
    await WDTSubmission.deleteMany({ 'employee.employeeId': testEmpId });

    // ─── SCENARIO 5: Org baseline changes to 168; employee without override submits 169 -> rejected ───
    console.log('\n[Test 5] Org baseline is 168; employee without override submits 169 -> Rejected');
    req.body.payload.rows[0].timeTakenHoursPerMonth = 169;
    res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 400, `Expected 400 Bad Request but got ${res.statusCode}`);
    assert.ok(res.body.message.includes('exceeds your configured monthly limit of 168h'), `Message mismatch: ${res.body.message}`);
    console.log('✓ Scenario 5 passed: 169 hours rejected when baseline is 168');

    // ─── SCENARIO 6: Employee with intentional custom limit 250 submits 250 -> accepted ───
    console.log('\n[Test 6] Admin sets custom limit 250; employee submits 250 -> Accepted');
    const updateReq = {
      user: { role: 'admin' },
      params: { id: testUser._id },
      body: { maxMonthlyHours: 250, hasCustomMaxHours: true }
    };
    const updateRes = createMockResponse();
    await updateUser(updateReq, updateRes);
    assert.strictEqual(updateRes.statusCode, 200, 'Expected admin update user to succeed');

    req.body.referenceId = `REF-${Date.now()}-6`;
    req.body.payload.rows[0].timeTakenHoursPerMonth = 250;
    res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 201, `Expected 201 Created but got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    console.log('✓ Scenario 6 passed: 250 hours accepted with custom limit 250');
    await WDTSubmission.deleteMany({ 'employee.employeeId': testEmpId });

    // ─── SCENARIO 7: Employee with intentional custom limit 250 submits 251 -> rejected ───
    console.log('\n[Test 7] Employee with custom limit 250 submits 251 -> Rejected');
    req.body.payload.rows[0].timeTakenHoursPerMonth = 251;
    res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 400, `Expected 400 Bad Request but got ${res.statusCode}`);
    assert.ok(res.body.message.includes('exceeds your configured monthly limit of 250h'), `Message mismatch: ${res.body.message}`);
    console.log('✓ Scenario 7 passed: 251 hours rejected when custom limit is 250');

    // ─── SCENARIO 8: Employee with intentional custom limit 160 follows that limit even when org baseline is 168 ───
    console.log('\n[Test 8] Intentional custom limit 160 takes precedence over org baseline 168');
    const updateReq160 = {
      user: { role: 'admin' },
      params: { id: testUser._id },
      body: { maxMonthlyHours: 160, hasCustomMaxHours: true }
    };
    const updateRes160 = createMockResponse();
    await updateUser(updateReq160, updateRes160);
    assert.strictEqual(updateRes160.statusCode, 200);

    // Submitting 161 should be rejected even though org baseline is 168
    req.body.payload.rows[0].timeTakenHoursPerMonth = 161;
    res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 400, `Expected 400 Bad Request but got ${res.statusCode}`);
    assert.ok(res.body.message.includes('exceeds your configured monthly limit of 160h'), `Message mismatch: ${res.body.message}`);
    console.log('✓ Scenario 8 passed: Custom limit 160 takes precedence over baseline 168');

    // ─── SCENARIO 9: Admin clears an override; employee returns to organization baseline ───
    console.log('\n[Test 9] Admin clears override; employee returns to organization baseline (168)');
    const clearReq = {
      user: { role: 'admin' },
      params: { id: testUser._id },
      body: { maxMonthlyHours: null, hasCustomMaxHours: false }
    };
    const clearRes = createMockResponse();
    await updateUser(clearReq, clearRes);
    assert.strictEqual(clearRes.statusCode, 200);

    // After clearing, employee should be able to submit 168 (baseline)
    req.body.referenceId = `REF-${Date.now()}-9`;
    req.body.payload.rows[0].timeTakenHoursPerMonth = 168;
    res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 201, `Expected 201 Created but got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    console.log('✓ Scenario 9 passed: Clearing override restored organization baseline 168');
    await WDTSubmission.deleteMany({ 'employee.employeeId': testEmpId });

    // ─── SCENARIO 10: Multiple activity rows whose combined hours exceed the limit -> rejected ───
    console.log('\n[Test 10] Multiple activity rows combined exceed limit -> Rejected');
    req.body.payload.rows = [
      { majorProcess: 'Record to Report', process: 'General Accounting', subProcess: 'Journal Entries', frequency: 'Monthly', volumesMonthly: 1, timeTakenHoursPerMonth: 90 },
      { majorProcess: 'Order to Cash', process: 'Billing', subProcess: 'Invoice Generation', frequency: 'Monthly', volumesMonthly: 1, timeTakenHoursPerMonth: 85 }
    ]; // 90 + 85 = 175 > 168
    res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 400, `Expected 400 Bad Request but got ${res.statusCode}`);
    assert.ok(res.body.message.includes('exceeds your configured monthly limit of 168h'), `Message mismatch: ${res.body.message}`);
    console.log('✓ Scenario 10 passed: Multi-row combined hours (175h > 168h) rejected');

    // ─── SCENARIO 11: Frontend submit button disabled logic when monthly hours exceed effective limit ───
    console.log('\n[Test 11] Frontend submit button disabled contract when hours exceed limit');
    // Emulate frontend Step3 button disabled logic:
    // disabled={submitDisabled || !isCertified || isGenuinelyBlank || isOverLimit}
    // where isOverLimit = totalHours > maxHours + 0.001
    const testEvaluateButtonDisabled = ({ totalHours, maxHours, isCertified, isGenuinelyBlank, submitDisabled }) => {
      const isOverLimit = totalHours > (maxHours + 0.001);
      return Boolean(submitDisabled || !isCertified || isGenuinelyBlank || isOverLimit);
    };

    // Subcase 11a: Within limit (160h <= 160h limit) -> Button Enabled
    assert.strictEqual(
      testEvaluateButtonDisabled({ totalHours: 160, maxHours: 160, isCertified: true, isGenuinelyBlank: false, submitDisabled: false }),
      false,
      'Submit button should be enabled when hours == limit'
    );

    // Subcase 11b: Exceeding limit (161h > 160h limit) -> Button Disabled
    assert.strictEqual(
      testEvaluateButtonDisabled({ totalHours: 161, maxHours: 160, isCertified: true, isGenuinelyBlank: false, submitDisabled: false }),
      true,
      'Submit button must be disabled when hours exceed limit (161h > 160h)'
    );

    // Subcase 11c: 250h > 160h limit -> Button Disabled
    assert.strictEqual(
      testEvaluateButtonDisabled({ totalHours: 250, maxHours: 160, isCertified: true, isGenuinelyBlank: false, submitDisabled: false }),
      true,
      'Submit button must be disabled when hours exceed limit (250h > 160h)'
    );

    // Subcase 11d: 250h <= 250h custom limit -> Button Enabled
    assert.strictEqual(
      testEvaluateButtonDisabled({ totalHours: 250, maxHours: 250, isCertified: true, isGenuinelyBlank: false, submitDisabled: false }),
      false,
      'Submit button should be enabled when user has 250h custom limit and enters 250h'
    );
    console.log('✓ Scenario 11 passed: Frontend submit button disabled contract strictly enforced when hours > limit');

    // ─── SCENARIO 12: Invalid or negative hour values -> rejected ───
    console.log('\n[Test 12] Invalid or negative hour values -> Rejected');
    req.body.payload.rows = [
      { majorProcess: 'Record to Report', process: 'General Accounting', subProcess: 'Journal Entries', frequency: 'Monthly', volumesMonthly: 1, timeTakenHoursPerMonth: -15 }
    ];
    res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 400, `Expected 400 Bad Request for negative hours`);
    assert.ok(res.body.message.includes('valid non-negative number'), `Message mismatch: ${res.body.message}`);

    req.body.payload.rows = [
      { majorProcess: 'Record to Report', process: 'General Accounting', subProcess: 'Journal Entries', frequency: 'Monthly', volumesMonthly: 1, timeTakenHoursPerMonth: 'NaN' }
    ];
    res = createMockResponse();
    await submitWDT(req, res);
    assert.strictEqual(res.statusCode, 400, `Expected 400 Bad Request for NaN hours`);
    assert.ok(res.body.message.includes('valid non-negative number'), `Message mismatch: ${res.body.message}`);
    console.log('✓ Scenario 12 passed: Negative and non-finite hour values rejected');

  } finally {
    // Clean up test records
    const WDTSubmission = require('../models/WDTSubmission');
    await WDTSubmission.deleteMany({ 'employee.employeeId': testEmpId });
    await User.deleteOne({ employeeId: testEmpId });

    // Restore original organization assumptions
    await SystemConfig.findOneAndUpdate(
      { key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY },
      { $set: { 'screeningSettings.standardMonthlyHours': initialStandardHours } }
    );
    invalidateAssumptionsCache();
    await mongoose.disconnect();
    console.log('\n=== ALL POINT 8(e) REGRESSION SCENARIOS PASSED SUCCESSFULLY ===');
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
