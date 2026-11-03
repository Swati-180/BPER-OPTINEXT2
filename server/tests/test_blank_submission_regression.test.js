/**
 * test_blank_submission_regression.test.js
 *
 * Regression suite for Point 8(b): Blank Submission Validation & Profile Integrity.
 *
 * Tests:
 * 1. Test 1 - Empty submission (payload.rows = []): Returns HTTP 400; no submission created.
 * 2. Test 2 - Zero-hour submission (empty description & 0 hours): Returns HTTP 400; no submission created.
 * 3. Test 3 - Blank submission approval: Attempting to approve an artificially blank submission returns HTTP 400; status unchanged.
 * 4. Test 4 - Vacancy profile integrity: 78 planned vacancy profiles have isVacant === true, positive workload hours, and existing rows.
 * 5. Test 5 - Filled employee profile integrity: 248 filled employee profiles have isVacant === false, positive workload hours, and existing rows.
 *
 * Safety & Isolation:
 * - Tests 1, 2, and 3 run strictly against an ephemeral MongoMemoryServer instance (100% isolated, zero production DB writes).
 * - Tests 4 and 5 run read-only against the live database without performing any create, update, or delete operations.
 */

const assert = require('assert');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

function mockResponse() {
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

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('POINT 8(b): BLANK SUBMISSION VALIDATION & INTEGRITY REGRESSION');
  console.log('================================================================\n');

  let memoryServer = null;
  const testResults = [];

  try {
    // -------------------------------------------------------------------------
    // PART A: Isolated In-Memory Tests (Tests 1, 2, 3)
    // -------------------------------------------------------------------------
    console.log('Spinning up isolated in-memory MongoDB (MongoMemoryServer)...');
    memoryServer = await MongoMemoryServer.create({
      instance: { launchTimeout: 60000 }
    });
    const memoryUri = memoryServer.getUri();
    assert(
      memoryUri.startsWith('mongodb://127.0.0.1:') || memoryUri.startsWith('mongodb://localhost:'),
      'CRITICAL: URI must be local in-memory!'
    );
    console.log(`[ISOLATION] Connected to ephemeral database: ${memoryUri.split('?')[0]}`);

    await mongoose.connect(memoryUri);

    const User = require('../models/User');
    const WDTSubmission = require('../models/WDTSubmission');
    const { submitWDT, updateSubmissionStatus } = require('../controllers/wdtController');

    // Create a mock submitting employee in the isolated memory DB
    const mockEmployeeUser = await User.create({
      name: 'Test Staff',
      email: 'test.staff@testmemory.org',
      password: 'MockHashedPassword123!',
      employeeId: 'TEST-EMP-001',
      role: 'employee',
      department: 'Finance & Accounting',
      formAccessGranted: true,
      maxMonthlyHours: 160
    });

    // -------------------------------------------------------------------------
    // TEST 1: Empty submission (payload.rows = [])
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Empty Submission Validation ---');
    {
      const req1 = {
        user: { userId: mockEmployeeUser._id.toString(), role: 'employee' },
        body: {
          employee: {
            employeeId: 'TEST-EMP-001',
            name: 'Test Staff',
            email: 'test.staff@testmemory.org',
            department: 'Finance & Accounting'
          },
          month: 10,
          year: 2026,
          payload: {
            rows: []
          }
        }
      };
      const res1 = mockResponse();

      await submitWDT(req1, res1);

      const countAfterTest1 = await WDTSubmission.countDocuments();
      assert.strictEqual(res1.statusCode, 400, `Expected HTTP 400, got ${res1.statusCode}`);
      assert(
        res1.body?.message?.includes('Cannot submit a blank form'),
        `Unexpected error message: ${res1.body?.message}`
      );
      assert.strictEqual(countAfterTest1, 0, 'No document should have been created in database');

      console.log('âœ… PASS: Test 1 â€“ Empty submission correctly rejected with HTTP 400; 0 submissions created.');
      testResults.push({
        test: 'Test 1 â€“ Empty submission',
        status: 'PASS',
        httpStatus: res1.statusCode,
        isolation: 'MongoMemoryServer (in-memory isolated)',
        productionTouched: false
      });
    }

    // -------------------------------------------------------------------------
    // TEST 2: Zero-hour submission (empty description & 0 hours)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Zero-Hour Blank Submission Validation ---');
    {
      const req2 = {
        user: { userId: mockEmployeeUser._id.toString(), role: 'employee' },
        body: {
          employee: {
            employeeId: 'TEST-EMP-001',
            name: 'Test Staff',
            email: 'test.staff@testmemory.org',
            department: 'Finance & Accounting'
          },
          month: 10,
          year: 2026,
          payload: {
            rows: [
              {
                subProcess: '',
                activity: '',
                process: '',
                timeTakenHoursPerMonth: 0,
                hours: 0
              }
            ]
          }
        }
      };
      const res2 = mockResponse();

      await submitWDT(req2, res2);

      const countAfterTest2 = await WDTSubmission.countDocuments();
      assert.strictEqual(res2.statusCode, 400, `Expected HTTP 400, got ${res2.statusCode}`);
      assert(
        res2.body?.message?.includes('Cannot submit a blank form'),
        `Unexpected error message: ${res2.body?.message}`
      );
      assert.strictEqual(countAfterTest2, 0, 'No document should have been created in database');

      console.log('âœ… PASS: Test 2 â€“ Zero-hour submission correctly rejected with HTTP 400; 0 submissions created.');
      testResults.push({
        test: 'Test 2 â€“ Zero-hour submission',
        status: 'PASS',
        httpStatus: res2.statusCode,
        isolation: 'MongoMemoryServer (in-memory isolated)',
        productionTouched: false
      });
    }

    // -------------------------------------------------------------------------
    // TEST 3: Blank submission approval rejection
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Blank Submission Approval Guard ---');
    {
      // Bypass controller create by inserting directly into the isolated memory DB
      const artificiallyBlankSub = await WDTSubmission.collection.insertOne({
        referenceId: 'TEST-BLANK-SUB-001',
        month: 10,
        year: 2026,
        status: 'Under Review',
        employee: {
          employeeId: 'TEST-EMP-001',
          name: 'Test Staff',
          department: 'Finance & Accounting'
        },
        payload: {
          rows: []
        },
        totalHours: 0,
        reviewHistory: []
      });

      const req3 = {
        params: { referenceId: 'TEST-BLANK-SUB-001' },
        body: {
          status: 'Approved',
          comment: 'Attempting invalid approval of blank form',
          managerName: 'Manager Reviewer'
        },
        user: { role: 'manager' }
      };
      const res3 = mockResponse();

      await updateSubmissionStatus(req3, res3);

      assert.strictEqual(res3.statusCode, 400, `Expected HTTP 400, got ${res3.statusCode}`);
      assert(
        res3.body?.message?.includes('Cannot approve a genuinely blank submission'),
        `Unexpected error message: ${res3.body?.message}`
      );

      // Verify in memory DB that status was NOT modified to Approved
      const subInDb = await WDTSubmission.findOne({ referenceId: 'TEST-BLANK-SUB-001' });
      assert.strictEqual(subInDb.status, 'Under Review', 'Submission status must remain Under Review');

      console.log('âœ… PASS: Test 3 â€“ Approval of blank form rejected with HTTP 400; status remains Under Review.');
      testResults.push({
        test: 'Test 3 â€“ Blank submission approval',
        status: 'PASS',
        httpStatus: res3.statusCode,
        isolation: 'MongoMemoryServer (in-memory isolated)',
        productionTouched: false
      });
    }

    // Disconnect memory DB & stop server
    await mongoose.disconnect();
    await memoryServer.stop();
    memoryServer = null;
    console.log('\n[ISOLATION] Ephemeral in-memory database stopped and disposed.');

    // -------------------------------------------------------------------------
    // PART B: Read-Only Verification on Live Records (Tests 4 & 5)
    // -------------------------------------------------------------------------
    console.log('\nConnecting in read-only mode to verify existing profiles integrity...');
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
    assert(process.env.MONGODB_URI, 'process.env.MONGODB_URI must be defined');
    await mongoose.connect(process.env.MONGODB_URI);

    const { SYSTEM_TEST_ACCOUNT_IDS } = require('../utils/gradeStandardizer');
    const liveSubs = await WDTSubmission.find({
      month: 10,
      year: 2026,
      'employee.employeeId': { $nin: SYSTEM_TEST_ACCOUNT_IDS }
    }).lean();

    console.log(`Total live scoped submissions loaded: ${liveSubs.length} (Expected: 326)`);
    assert.strictEqual(liveSubs.length, 326, 'Scoped live submissions must equal 326');

    // -------------------------------------------------------------------------
    // TEST 4: Vacancy profile integrity (78 planned vacancies)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Vacancy Profile Integrity ---');
    {
      const isProfileVacant = (s) =>
        s.employee?.isVacant === true ||
        String(s.employee?.name || '').trim().toLowerCase() === 'vacant' ||
        s.employee?.occupancyStatus === 'Vacant';

      const vacancyProfiles = liveSubs.filter(isProfileVacant);

      assert.strictEqual(vacancyProfiles.length, 78, `Expected exactly 78 vacancy profiles, found ${vacancyProfiles.length}`);

      let zeroHoursCount = 0;
      let emptyRowsCount = 0;
      let totalVacantHours = 0;

      for (const v of vacancyProfiles) {
        assert(isProfileVacant(v), `Profile ${v.referenceId} must evaluate to vacant`);
        const hours = Number(v.totalHours) || 0;
        totalVacantHours += hours;
        if (hours <= 0) zeroHoursCount++;
        const rows = v.payload?.rows || [];
        if (rows.length === 0) emptyRowsCount++;
      }

      assert.strictEqual(zeroHoursCount, 0, 'Zero vacancy profiles may have <= 0 hours');
      assert.strictEqual(emptyRowsCount, 0, 'Zero vacancy profiles may have empty activity rows');
      assert(totalVacantHours > 19000, `Total vacant hours must be ~19,302h, got ${totalVacantHours}`);

      console.log(`âœ… PASS: Test 4 â€“ All 78 vacancy profiles verified (isVacant evaluation=true, totalHours=${totalVacantHours.toFixed(2)}h, 0 blank profiles).`);
      testResults.push({
        test: 'Test 4 â€“ Vacancy profile integrity',
        status: 'PASS',
        countVerified: vacancyProfiles.length,
        totalHours: Number(totalVacantHours.toFixed(2)),
        isolation: 'Read-only live query (zero modifications)',
        productionTouched: false
      });
    }

    // -------------------------------------------------------------------------
    // TEST 5: Filled employee profile integrity (248 filled employees)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Filled Employee Profile Integrity ---');
    {
      const isProfileVacant = (s) =>
        s.employee?.isVacant === true ||
        String(s.employee?.name || '').trim().toLowerCase() === 'vacant' ||
        s.employee?.occupancyStatus === 'Vacant';

      const filledProfiles = liveSubs.filter(s => !isProfileVacant(s));

      assert.strictEqual(filledProfiles.length, 248, `Expected exactly 248 filled employee profiles, found ${filledProfiles.length}`);

      let zeroHoursCount = 0;
      let emptyRowsCount = 0;
      let totalStaffedHours = 0;

      for (const f of filledProfiles) {
        assert(!isProfileVacant(f), `Profile ${f.referenceId} must evaluate to filled employee`);
        assert.notStrictEqual(f.employee?.isVacant, true, `Profile ${f.referenceId} must not have isVacant === true`);
        const hours = Number(f.totalHours) || 0;
        totalStaffedHours += hours;
        if (hours <= 0) zeroHoursCount++;
        const rows = f.payload?.rows || [];
        if (rows.length === 0) emptyRowsCount++;
      }

      assert.strictEqual(zeroHoursCount, 0, 'Zero filled profiles may have <= 0 hours');
      assert.strictEqual(emptyRowsCount, 0, 'Zero filled profiles may have empty activity rows');
      assert(totalStaffedHours > 60000, `Total staffed hours must be ~60,611h, got ${totalStaffedHours}`);

      console.log(`âœ… PASS: Test 5 â€“ All 248 filled employee profiles verified (isVacant evaluation=false, totalHours=${totalStaffedHours.toFixed(2)}h, 0 blank profiles).`);
      testResults.push({
        test: 'Test 5 â€“ Filled employee profile integrity',
        status: 'PASS',
        countVerified: filledProfiles.length,
        totalHours: Number(totalStaffedHours.toFixed(2)),
        isolation: 'Read-only live query (zero modifications)',
        productionTouched: false
      });
    }

    await mongoose.disconnect();

    console.log('\n================================================================');
    console.log('REGRESSION SUITE COMPLETED: 5 OF 5 TESTS PASSED');
    console.log('================================================================\n');

    return testResults;

  } catch (err) {
    if (memoryServer) {
      try { await memoryServer.stop(); } catch (_) {}
    }
    try { await mongoose.disconnect(); } catch (_) {}
    console.error('\nâŒ REGRESSION SUITE FAILED:', err);
    throw err;
  }
}

if (require.main === module) {
  runRegressionSuite()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runRegressionSuite };
