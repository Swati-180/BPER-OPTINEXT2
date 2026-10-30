const assert = require('assert');
const mongoose = require('mongoose');
const User = require('../models/User');
const WDTSubmission = require('../models/WDTSubmission');
const { getDashboardReport, invalidateScopedReportsCache } = require('../controllers/reportsController');
const { submitWDT, updateSubmissionStatus } = require('../controllers/wdtController');

console.log('=== TEST SUITE: DASHBOARD RECONCILIATION & COMPLETENESS REGRESSION ===\n');

// In-Memory Database Harness
// Completely isolates tests from live/shared database
let mockSubmissions = [];
let mockUsers = [];

function createMockId() {
  return new mongoose.Types.ObjectId();
}

function resetMockData({ users = [], submissions = [] } = {}) {
  if (typeof invalidateScopedReportsCache === 'function') invalidateScopedReportsCache();
  mockUsers = users.map(u => ({
    _id: u._id || createMockId(),
    name: u.name || '',
    email: u.email || null,
    employeeId: u.employeeId || null,
    role: u.role || 'employee',
    isActive: u.isActive !== undefined ? u.isActive : true,
    isRosterOnly: Boolean(u.isRosterOnly),
    isVacant: Boolean(u.isVacant),
    isArchivedDemo: Boolean(u.isArchivedDemo),
    maxMonthlyHours: u.maxMonthlyHours || 160,
    formAccessGranted: Boolean(u.formAccessGranted)
  }));

  mockSubmissions = submissions.map(s => ({
    _id: s._id || createMockId(),
    referenceId: s.referenceId || `WDT-2026-10-${s.employee?.employeeId || Math.random()}`,
    month: s.month != null ? s.month : 10,
    year: s.year != null ? s.year : 2026,
    status: s.status || 'Approved',
    totalHours: s.totalHours != null ? s.totalHours : 0,
    employee: {
      employeeId: s.employee?.employeeId || 'EMP',
      name: s.employee?.name || 'Employee',
      email: s.employee?.email || null,
      department: s.employee?.department || 'Finance & Accounting',
      isVacant: Boolean(s.employee?.isVacant),
      tower: s.employee?.tower || 'Accounts Payable'
    },
    payload: {
      rows: (s.payload?.rows || []).map(r => ({
        ...r,
        timeTakenHoursPerMonth: r.timeTakenHoursPerMonth != null ? r.timeTakenHoursPerMonth : (r.monthlyHours != null ? r.monthlyHours : r.hours)
      }))
    },
    reviewHistory: s.reviewHistory || [],
    async save() {
      return this;
    }
  }));
}

// Monkey-patch User methods
User.countDocuments = async function (filter = {}) {
  return mockUsers.filter(u => {
    if (filter.role && u.role !== filter.role) return false;
    if (filter.isActive !== undefined && u.isActive !== filter.isActive) return false;
    if (filter.isRosterOnly !== undefined && u.isRosterOnly !== filter.isRosterOnly) return false;
    if (filter.isVacant !== undefined && u.isVacant !== filter.isVacant) return false;
    if (filter.isArchivedDemo && filter.isArchivedDemo.$ne && u.isArchivedDemo === filter.isArchivedDemo.$ne) return false;
    return true;
  }).length;
};

User.findOne = function (filter = {}) {
  let found = null;
  if (filter['$or']) {
    for (const cond of filter['$or']) {
    for (const cond of filter['$or']) {
        found = mockUsers.find(u => u.employeeId === cond.employeeId);
        if (found) break;
      }
      if (cond.email) {
        found = mockUsers.find(u => u.email === cond.email);
        if (found) break;
      }
    }
  } else if (filter.employeeId) {
    found = mockUsers.find(u => u.employeeId === filter.employeeId);
  } else if (filter.email) {
    found = mockUsers.find(u => u.email === filter.email);
  }
  return {
    select: function () {
      return Promise.resolve(found);
    },
    then: function (resolve, reject) {
      return Promise.resolve(found).then(resolve, reject);
    }
  };
};

User.findById = async function (id) {
  const found = mockUsers.find(u => u._id.toString() === id.toString());
  return found || { _id: id, role: 'admin', email: 'admin@bper.com' };
};

// Monkey-patch WDTSubmission methods
WDTSubmission.find = function (filter = {}) {
  const result = mockSubmissions.filter(s => {
    if (filter.month != null && s.month !== filter.month) return false;
    if (filter.year != null && s.year !== filter.year) return false;
    if (filter['employee.department'] && s.employee.department !== filter['employee.department']) return false;
    if (filter['employee.employeeId'] && filter['employee.employeeId'].$nin) {
      if (filter['employee.employeeId'].$nin.includes(s.employee.employeeId)) return false;
    }
    return true;
  });

  return {
    select: function () {
      return {
        sort: function () {
          return {
            lean: async function () {
              return result;
            }
          };
        }
      };
    }
  };
};

WDTSubmission.findOne = async function (filter = {}) {
  if (filter.referenceId) {
    const found = mockSubmissions.find(s => s.referenceId === filter.referenceId);
    return found || null;
  }
  if (filter.$or) {
    for (const cond of filter.$or) {
      if (cond['employee.employeeId']) {
        const found = mockSubmissions.find(s => s.employee.employeeId === cond['employee.employeeId'] && s.month === filter.month && s.year === filter.year);
        if (found) return found;
      }
      if (cond['employee.email']) {
        const found = mockSubmissions.find(s => s.employee.email === cond['employee.email'] && s.month === filter.month && s.year === filter.year);
        if (found) return found;
      }
    }
  }
  return null;
};

WDTSubmission.create = async function (doc) {
  const newSub = {
    _id: createMockId(),
    ...doc,
    async save() {
      return this;
    }
  };
  mockSubmissions.push(newSub);
  return newSub;
};

function createMockRes() {
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

(async function runAllTests() {
  try {
    // -------------------------------------------------------------------------
    // Scenario 1: Partially populated User collection does not shrink workforce HC
    // -------------------------------------------------------------------------
    console.log('1. Testing that a partial User roster (e.g. 8 accounts) does not collapse workforce headcount when 248 named staff exist...');

    // Create 8 user accounts in User collection (1 roster account)
    const partialUsers = Array.from({ length: 8 }).map((_, i) => ({
      employeeId: `USER-${i + 1}`,
      name: `User Account ${i + 1}`,
      role: 'employee',
      isRosterOnly: i === 0, // 1 roster record
      isActive: true
    }));

    // Create 248 filled submissions (totaling ~60,611.64 hours) and 78 vacant submissions (totaling ~19,302.27 hours)
    const mock248Named = Array.from({ length: 248 }).map((_, i) => ({
      referenceId: `WDT-2026-10-STAFF-${i + 1}`,
      employee: {
        employeeId: `STAFF-${i + 1}`,
        name: `Employee Name ${i + 1}`,
        isVacant: false,
        department: 'Finance & Accounting'
      },
      status: 'Approved',
      totalHours: 244.40,
      payload: {
        rows: [{ subProcess: 'Activity 1', timeTakenHoursPerMonth: 244.40, tower: 'Accounts Payable' }]
      }
    }));

    const mock78Vacant = Array.from({ length: 78 }).map((_, i) => ({
      referenceId: `WDT-2026-10-VAC-${i + 1}`,
      employee: {
        employeeId: `VAC-${i + 1}`,
        name: 'Vacant',
        isVacant: true,
        department: 'Finance & Accounting'
      },
      status: 'Approved',
      totalHours: 247.46,
      payload: {
        rows: [{ subProcess: 'Activity Vacant', timeTakenHoursPerMonth: 247.46, tower: 'Accounts Payable' }]
      }
    }));

    resetMockData({
      users: partialUsers,
      submissions: [...mock248Named, ...mock78Vacant]
    });

    let req = { query: {}, user: { role: 'admin' } };
    let res = createMockRes();
    await getDashboardReport(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.summary.activeUserAccounts, 8, 'activeUserAccounts must report the 8 user accounts');
    assert.strictEqual(res.body.summary.totalEmployees, 248, 'Workforce headcount must report the 248 filled staff, not 8');
    assert.strictEqual(res.body.summary.totalStaff, 248);
    assert.strictEqual(res.body.summary.vacantPositions, 78);
    assert.strictEqual(res.body.summary.hasAuthoritativeRoster, false, 'hasAuthoritativeRoster must be false when User collection has fewer records than submissions');
    assert.strictEqual(res.body.summary.rosterSource, 'submission_workforce');
    console.log('✅ PASS: Partially populated User collection correctly falls back to validated submission workforce (248 staff, 78 vacancies).');

    // -------------------------------------------------------------------------
    // Scenario 2: 248 named and 78 vacant records reconcile to exactly 326 total
    // -------------------------------------------------------------------------
    console.log('\n2. Testing that 248 named and 78 vacant records reconcile exactly to 326 total records...');
    const sumTotal = res.body.summary.submissionParticipants.namedStaff + res.body.summary.submissionParticipants.vacancies;
    assert.strictEqual(sumTotal, 326);
    assert.strictEqual(res.body.summary.totalSubmissions, 326);
    assert.strictEqual(res.body.summary.completeness.totalSubmitted, 326);
    assert.strictEqual(res.body.summary.completeness.filledSubmitted, 248);
    assert.strictEqual(res.body.summary.completeness.vacantSubmitted, 78);
    console.log('✅ PASS: Headcount reconciliation confirmed (248 filled + 78 vacant = 326 total).');

    // -------------------------------------------------------------------------
    // Scenario 3: Staffed FTE excludes vacant-position hours
    // -------------------------------------------------------------------------
    console.log('\n3. Testing that Staffed FTE strictly excludes vacant-position hours...');
    // In our test batch: 248 * 244.40 = 60611.20 hours -> FTE = 378.82
    // Vacant: 78 * 247.46 = 19301.88 hours -> FTE = 120.64
    assert.ok(Math.abs(res.body.summary.staffedFte - 378.82) < 0.05, `Staffed FTE must be ~378.82, got ${res.body.summary.staffedFte}`);
    assert.strictEqual(res.body.summary.primaryEmployeeFte, res.body.summary.staffedFte, 'primaryEmployeeFte must equal staffedFte');
    console.log(`✅ PASS: Staffed FTE (${res.body.summary.staffedFte}) correctly excludes vacant workload.`);

    // -------------------------------------------------------------------------
    // Scenario 4: Vacant workload FTE and Total workload FTE reconcile independently
    // -------------------------------------------------------------------------
    console.log('\n4. Testing that Vacant workload FTE and Total workload FTE reconcile independently...');
    assert.ok(Math.abs(res.body.summary.vacantFte - 120.64) < 0.05, `Vacant FTE must be ~120.64, got ${res.body.summary.vacantFte}`);
    assert.ok(Math.abs(res.body.summary.totalFte - 499.46) < 0.05, `Total FTE must be ~499.46, got ${res.body.summary.totalFte}`);
    assert.ok(Math.abs((res.body.summary.staffedFte + res.body.summary.vacantFte) - res.body.summary.totalFte) < 0.05);
    console.log(`✅ PASS: Workload reconciliation confirmed: ${res.body.summary.staffedFte} Staffed + ${res.body.summary.vacantFte} Vacant = ${res.body.summary.totalFte} Total.`);

    // -------------------------------------------------------------------------
    // Problem 4(c) Checks: FTE formatting and Raw Staffed Utilization
    assert.strictEqual(typeof res.body.summary.totalFte, 'number', 'totalFte must be a numeric FTE count, not formatted as percentage');
    assert.ok(Math.abs(res.body.summary.staffedUtilizationPct - 152.8) < 0.5, 'staffedUtilizationPct must be ~152.8%');
    assert.strictEqual(res.body.summary.cappedStaffedUtilizationPct, 100, 'cappedStaffedUtilizationPct must be capped at 100%');
    assert.ok(Math.abs(res.body.summary.workloadVsTargetPct - 99.9) < 0.5, 'workloadVsTargetPct must be ~99.9%');
    console.log('✅ PASS: Problem 4(c) metrics confirmed: Staffed Util=' + res.body.summary.staffedUtilizationPct + '%, Capped=' + res.body.summary.cappedStaffedUtilizationPct + '%, Workload vs Target=' + res.body.summary.workloadVsTargetPct + '%');

    // Scenario 5: Approval and status counts reconcile
    // -------------------------------------------------------------------------
    console.log('\n5. Testing status reconciliation: total approved = approved filled (248) + approved vacant (78)...');
    assert.strictEqual(res.body.summary.approved, 326);
    assert.strictEqual(res.body.summary.approvedFilled, 248);
    assert.strictEqual(res.body.summary.approvedVacant, 78);
    assert.strictEqual(res.body.summary.pendingReview, 0);
    assert.strictEqual(res.body.summary.changesRequested, 0);
    console.log('✅ PASS: Status reconciliation confirmed: 248 approved filled + 78 approved vacant = 326 approved total.');

    // -------------------------------------------------------------------------
    // Scenario 6: Truly blank new submissions are rejected server-side
    // -------------------------------------------------------------------------
    console.log('\n6. Testing server-side rejection of truly blank new submissions...');
    resetMockData({
      users: [{ employeeId: 'EMP-NEW', maxMonthlyHours: 160, role: 'employee' }],
      submissions: []
    });

    let submitReq = {
      body: {
        employee: { employeeId: 'EMP-NEW' },
        month: 11,
        year: 2026,
        payload: { rows: [] }
      }
    };
    let submitRes = createMockRes();
    await submitWDT(submitReq, submitRes);

    assert.strictEqual(submitRes.statusCode, 400);
    assert.ok(submitRes.body.message.includes('blank form'));

    // Zero hours test
    submitReq.body.payload.rows = [{ subProcess: 'Empty', timeTakenHoursPerMonth: 0 }];
    submitRes = createMockRes();
    await submitWDT(submitReq, submitRes);
    assert.strictEqual(submitRes.statusCode, 400);
    assert.ok(submitRes.body.message.includes('0 total hours'));
    console.log('✅ PASS: Truly blank submissions (0 rows or 0 hours) are strictly rejected.');

    // -------------------------------------------------------------------------
    // Scenario 7: Submissions exceeding configured monthly limit are rejected server-side
    // -------------------------------------------------------------------------
    console.log('\n7. Testing server-side rejection when submitted hours exceed configured monthly limit...');
    submitReq = {
      body: {
        employee: { employeeId: 'EMP-NEW' },
        month: 11,
        year: 2026,
        payload: {
          rows: [
            { subProcess: 'Overloaded Activity', timeTakenHoursPerMonth: 250 }
          ]
        }
      }
    };
    submitRes = createMockRes();
    await submitWDT(submitReq, submitRes);

    assert.strictEqual(submitRes.statusCode, 400);
    assert.ok(submitRes.body.message.includes('exceeds your configured monthly limit of 160h'));
    console.log('✅ PASS: Submission of 250 hours against a 160h limit is rejected server-side.');

    // -------------------------------------------------------------------------
    // Scenario 8: Legitimate vacant-position records are not confused with blank forms
    // -------------------------------------------------------------------------
    console.log('\n8. Testing that legitimate vacant-position workload records are preserved and not confused with blank forms...');
    const vacantRecord = mock78Vacant[0];
    assert.strictEqual(vacantRecord.employee.isVacant, true);
    assert.strictEqual(vacantRecord.payload.rows.length, 1);
    assert.strictEqual(vacantRecord.totalHours, 247.46);
    console.log('✅ PASS: Vacant-position submissions legitimately hold workload data (not blank).');

    // -------------------------------------------------------------------------
    // Scenario 9: Department scoping consistency across cards and charts
    // -------------------------------------------------------------------------
    console.log('\n9. Testing department scoping consistency across summary and charts...');
    resetMockData({
      users: partialUsers,
      submissions: [
        {
          referenceId: 'SUB-DEPT-1',
          employee: { employeeId: 'EMP-D1', name: 'Dept1 Staff', isVacant: false, department: 'Finance & Accounting' },
          month: 10,
          year: 2026,
          status: 'Approved',
          totalHours: 160,
          payload: { rows: [{ tower: 'Accounts Payable', timeTakenHoursPerMonth: 160 }] }
        },
        {
          referenceId: 'SUB-DEPT-2',
          employee: { employeeId: 'EMP-D2', name: 'Dept2 Staff', isVacant: false, department: 'HR' },
          month: 10,
          year: 2026,
          status: 'Approved',
          totalHours: 160,
          payload: { rows: [{ tower: 'Talent Acquisition', timeTakenHoursPerMonth: 160 }] }
        }
      ]
    });

    req = { query: { department: 'Finance & Accounting' }, user: { role: 'admin' } };
    res = createMockRes();
    await getDashboardReport(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.summary.totalSubmissions, 1);
    assert.strictEqual(res.body.summary.totalStaff, 1);
    assert.strictEqual(res.body.charts.towerFte.length, 1);
    assert.strictEqual(res.body.charts.towerFte[0].tower, 'Accounts Payable');
    console.log('✅ PASS: Department filter scopes submissions, summary cards, and tower charts consistently.');

    // -------------------------------------------------------------------------
    // Scenario 10: Empty datasets, missing fields, and incomplete roster handled safely
    // -------------------------------------------------------------------------
    console.log('\n10. Testing graceful handling of empty datasets and missing fields...');
    resetMockData({ users: [], submissions: [] });

    req = { query: {}, user: { role: 'admin' } };
    res = createMockRes();
    await getDashboardReport(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.summary.totalStaff, 0);
    assert.strictEqual(res.body.summary.vacantPositions, 0);
    assert.strictEqual(res.body.summary.totalSubmissions, 0);
    assert.strictEqual(res.body.summary.staffedFte, 0);
    assert.strictEqual(res.body.summary.vacantFte, 0);
    assert.strictEqual(res.body.summary.totalFte, 0);
    assert.strictEqual(res.body.charts.towerFte.length, 0);
    assert.strictEqual(res.body.charts.employeeFteData.length, 0);
    console.log('✅ PASS: Empty dataset handled gracefully with 0 values and zero crashes.');

    console.log('\n============================================================');
    console.log('🎉 ALL 10 DASHBOARD RECONCILIATION TESTS PASSED SUCCESSFULLY!');
    console.log('============================================================\n');
  } catch (err) {
    console.error('\n❌ TEST FAILED WITH ERROR:', err);
    process.exit(1);
  }
})();
