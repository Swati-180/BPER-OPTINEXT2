const assert = require('assert');
const { SYSTEM_TEST_ACCOUNT_IDS } = require('../utils/gradeStandardizer');
const { buildScopeMatch } = require('../controllers/reportsController');

console.log('=== TEST SUITE: SYSTEM TEST ACCOUNT EXCLUSION & SCOPING INTEGRITY ===\n');

// 1. Verify SYSTEM_TEST_ACCOUNT_IDS constant
console.log('1. Verifying SYSTEM_TEST_ACCOUNT_IDS constant...');
assert(Array.isArray(SYSTEM_TEST_ACCOUNT_IDS), 'SYSTEM_TEST_ACCOUNT_IDS must be an array');
assert(SYSTEM_TEST_ACCOUNT_IDS.includes('BPER-000'), 'Must contain BPER-000 (QG Admin)');
assert(SYSTEM_TEST_ACCOUNT_IDS.includes('BPER-999'), 'Must contain BPER-999 (QG Manager)');
assert.strictEqual(SYSTEM_TEST_ACCOUNT_IDS.length, 2, 'Must contain exactly the two system test accounts');
console.log('✅ PASS: SYSTEM_TEST_ACCOUNT_IDS contains exactly [BPER-000, BPER-999]');

// 2. Verify buildScopeMatch default behavior (October 2026)
console.log('\n2. Testing buildScopeMatch with default parameters...');
const defaultMatch = buildScopeMatch('Finance & Accounting', 10, 2026);
assert.strictEqual(defaultMatch.month, 10, 'Month must be 10');
assert.strictEqual(defaultMatch.year, 2026, 'Year must be 2026');
assert.strictEqual(defaultMatch['employee.department'], 'Finance & Accounting', 'Department must be Finance & Accounting');
assert.deepStrictEqual(
  defaultMatch['employee.employeeId'],
  { $nin: SYSTEM_TEST_ACCOUNT_IDS },
  'Must exclude system test accounts via $nin'
);
console.log('✅ PASS: buildScopeMatch applies { $nin: SYSTEM_TEST_ACCOUNT_IDS } alongside department, month, and year');

// 3. Verify All Departments handling
console.log('\n3. Testing buildScopeMatch with All Departments...');
const allDeptsMatch = buildScopeMatch('All Departments', 10, 2026);
assert.strictEqual(allDeptsMatch['employee.department'], undefined, 'employee.department must not be restricted when All Departments is requested');
assert.deepStrictEqual(
  allDeptsMatch['employee.employeeId'],
  { $nin: SYSTEM_TEST_ACCOUNT_IDS },
  'Must still exclude system test accounts when All Departments is requested'
);
console.log('✅ PASS: All Departments preserves global scope while excluding system test accounts');

// 4. Verify Future Reporting Periods (e.g. November 2026, January 2027)
console.log('\n4. Testing buildScopeMatch with future reporting periods...');
const futureNovMatch = buildScopeMatch('Finance & Accounting', 11, 2026);
assert.strictEqual(futureNovMatch.month, 11, 'Future month 11 must be preserved');
assert.strictEqual(futureNovMatch.year, 2026, 'Future year 2026 must be preserved');
assert.deepStrictEqual(
  futureNovMatch['employee.employeeId'],
  { $nin: SYSTEM_TEST_ACCOUNT_IDS },
  'Must still exclude test accounts in future periods'
);

const future2027Match = buildScopeMatch('HR', 1, 2027);
assert.strictEqual(future2027Match.month, 1, 'Month 1 must be preserved');
assert.strictEqual(future2027Match.year, 2027, 'Year 2027 must be preserved');
assert.strictEqual(future2027Match['employee.department'], 'HR', 'Department HR must be preserved');
assert.deepStrictEqual(
  future2027Match['employee.employeeId'],
  { $nin: SYSTEM_TEST_ACCOUNT_IDS },
  'Must still exclude test accounts in 2027'
);
console.log('✅ PASS: Future periods (11/2026, 1/2027) and other departments (HR) are correctly scoped without hardcoded October prefixes');

// 5. Test Filtering Logic on In-Memory Mock Submissions
console.log('\n5. Testing in-memory filtering simulation with operational vs test submissions...');
const mockSubmissions = [
  // Legitimate operational submissions (October 2026)
  {
    referenceId: 'WDT-2026-10-EMP10028',
    month: 10,
    year: 2026,
    employee: { employeeId: '10028', name: 'Manoj Kumar', department: 'Finance & Accounting', grade: 'O4' },
    status: 'Approved',
    totalHours: 250
  },
  {
    referenceId: 'WDT-2026-10-EMPVACANT-01',
    month: 10,
    year: 2026,
    employee: { employeeId: '10001099', name: 'Vacant', department: 'Finance & Accounting', grade: 'O3', isVacant: true },
    status: 'Approved',
    totalHours: 160
  },
  // Legitimate employee using BPER- prefix (e.g. BPER-101 Michael Smith)
  {
    referenceId: 'BPER-BPER-101-99881',
    month: 10,
    year: 2026,
    employee: { employeeId: 'BPER-101', name: 'Michael Smith', department: 'Finance & Accounting', grade: 'E2' },
    status: 'Approved',
    totalHours: 160
  },
  // Future valid employee in November 2026
  {
    referenceId: 'BPER-BPER-101-99882',
    month: 11,
    year: 2026,
    employee: { employeeId: 'BPER-101', name: 'Michael Smith', department: 'Finance & Accounting', grade: 'E2' },
    status: 'Approved',
    totalHours: 160
  },
  // Administrative test record (QG Admin BPER-000)
  {
    referenceId: 'BPER-BPER-000-74844',
    month: 10,
    year: 2026,
    employee: { employeeId: 'BPER-000', name: 'QG Admin', department: 'Finance & Accounting', grade: 'NA' },
    status: 'Approved',
    totalHours: 74.08
  },
  // Administrative manager record (QG Manager BPER-999)
  {
    referenceId: 'BPER-BPER-999-12345',
    month: 10,
    year: 2026,
    employee: { employeeId: 'BPER-999', name: 'QG Manager', department: 'Corporate', grade: 'M1' },
    status: 'Approved',
    totalHours: 40
  }
];

function applyScopeFilter(subs, scopeMatch) {
  return subs.filter(sub => {
    if (scopeMatch.month != null && sub.month !== scopeMatch.month) return false;
    if (scopeMatch.year != null && sub.year !== scopeMatch.year) return false;
    if (scopeMatch['employee.department'] && sub.employee.department !== scopeMatch['employee.department']) return false;
    if (scopeMatch['employee.employeeId'] && scopeMatch['employee.employeeId'].$nin) {
      if (scopeMatch['employee.employeeId'].$nin.includes(sub.employee.employeeId)) return false;
    }
    return true;
  });
}

// Test October 2026 F&A
const filteredOct = applyScopeFilter(mockSubmissions, defaultMatch);
console.log(`October filtered count: ${filteredOct.length}`);
assert.strictEqual(filteredOct.length, 3, 'Must match exactly 3 submissions (10028, Vacant, and BPER-101)');
assert(filteredOct.some(s => s.employee.employeeId === '10028'), 'Must include 10028');
assert(filteredOct.some(s => s.employee.employeeId === '10001099'), 'Must include Vacant');
assert(filteredOct.some(s => s.employee.employeeId === 'BPER-101'), 'Must include legitimate employee BPER-101');
assert(!filteredOct.some(s => s.employee.employeeId === 'BPER-000'), 'Must EXCLUDE test account BPER-000');
assert(!filteredOct.some(s => s.employee.employeeId === 'BPER-999'), 'Must EXCLUDE test account BPER-999');
console.log('✅ PASS: In-memory simulation confirms BPER-000 is excluded while BPER-101 and operational IDs remain eligible');

// Test November 2026 F&A
const filteredNov = applyScopeFilter(mockSubmissions, futureNovMatch);
assert.strictEqual(filteredNov.length, 1, 'Must match exactly 1 submission in November 2026 (BPER-101)');
assert.strictEqual(filteredNov[0].employee.employeeId, 'BPER-101', 'November submission must be BPER-101');
console.log('✅ PASS: Future period correctly includes BPER-101');

console.log('\n🎉 ALL SCOPE EXCLUSION REGRESSION CHECKS PASSED PERFECTLY!\n');
