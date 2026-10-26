const assert = require('assert');
const { standardizeGrade, STANDARDIZED_GRADE_BANDS, ORDERED_GRADE_BANDS } = require('../utils/gradeStandardizer');
const { flattenRows } = require('../controllers/reportsController');

console.log('=== RUNNING BACKEND INTEGRATION TEST FOR APPROVED RULES ===\n');

// 1. Test FlattenRows with Grade History and Occupancy
const mockSubmissions = [
  {
    referenceId: 'TEST-WDT-001',
    batchId: 'BATCH-2026-10',
    reportingPeriod: '2026-10',
    month: 10,
    year: 2026,
    status: 'Approved',
    employee: {
      employeeId: 'EMP-101',
      name: 'John Doe',
      department: 'Finance & Accounting',
      designation: 'Senior Accountant',
      grade: 'E2',
      originalGradeAtSubmission: 'E2',
      employeeType: 'Permanent',
      isVacant: false
    },
    payload: {
      rows: [
        {
          activityCategory: 'core',
          majorProcess: 'General Ledger',
          process: 'Journal Entries',
          subProcess: 'Post Month End Accruals',
          timeTakenHoursPerMonth: 160,
          approvalStatus: 'Approved'
        }
      ]
    }
  },
  {
    referenceId: 'TEST-WDT-VAC-001',
    batchId: 'BATCH-2026-10',
    reportingPeriod: '2026-10',
    month: 10,
    year: 2026,
    status: 'Approved',
    employee: {
      employeeId: '10001099',
      name: 'Vacant', // Name is Vacant, but has Employee ID and Status is Approved
      department: 'Finance & Accounting',
      designation: 'Staff Accountant',
      grade: 'O3',
      originalGradeAtSubmission: 'O3',
      employeeType: 'Permanent',
      isVacant: true
    },
    payload: {
      rows: [
        {
          activityCategory: 'core',
          majorProcess: 'Accounts Payable',
          process: 'Invoice Processing',
          subProcess: 'Review Vendor Invoices',
          timeTakenHoursPerMonth: 120,
          approvalStatus: 'Approved'
        }
      ]
    }
  },
  {
    referenceId: 'TEST-WDT-CONTRACT-001',
    batchId: 'BATCH-2026-10',
    reportingPeriod: '2026-10',
    month: 10,
    year: 2026,
    status: 'Approved',
    employee: {
      employeeId: 'EMP-999',
      name: 'Jane Smith',
      department: 'Finance & Accounting',
      designation: 'Consultant',
      grade: 'NA',
      originalGradeAtSubmission: 'NA',
      employeeType: 'Contract',
      isVacant: false
    },
    payload: {
      rows: [
        {
          activityCategory: 'support',
          majorProcess: 'Compliance',
          process: 'Internal Audit Support',
          subProcess: 'Documentation Sampling',
          timeTakenHoursPerMonth: 80,
          approvalStatus: 'Approved'
        }
      ]
    }
  }
];

const flattened = flattenRows(mockSubmissions);
console.log(`Flattened rows count: ${flattened.length}`);
assert.strictEqual(flattened.length, 3, 'Should produce 3 flattened rows');

// Check Row 1: Occupied E2
const r1 = flattened[0];
console.log('Row 1 (Staffed E2):', {
  emp: r1.employeeName,
  originalGrade: r1.originalGradeAtSubmission,
  standardizedGrade: r1.standardizedGrade,
  isVacant: r1.isVacant,
  occupancyStatus: r1.occupancyStatus,
  reportingPeriod: r1.reportingPeriod
});
assert.strictEqual(r1.isVacant, false, 'Row 1 must NOT be vacant');
assert.strictEqual(r1.occupancyStatus, 'Occupied', 'Row 1 occupancyStatus must be Occupied');
assert.strictEqual(r1.standardizedGrade, STANDARDIZED_GRADE_BANDS.E1_E4, 'E2 must map to E1–E4');
assert.strictEqual(r1.reportingPeriod, '2026-10', 'Reporting period must be 2026-10');

// Check Row 2: Vacant Position (Approved status, has employee ID, but name == 'Vacant')
const r2 = flattened[1];
console.log('Row 2 (Vacant Position):', {
  emp: r2.employeeName,
  empId: r2.employeeId,
  originalGrade: r2.originalGradeAtSubmission,
  standardizedGrade: r2.standardizedGrade,
  isVacant: r2.isVacant,
  occupancyStatus: r2.occupancyStatus
});
assert.strictEqual(r2.isVacant, true, 'Row 2 must be detected as vacant despite having employee ID and Approved status');
assert.strictEqual(r2.occupancyStatus, 'Vacant', 'Row 2 occupancyStatus must be Vacant');
assert.strictEqual(r2.standardizedGrade, STANDARDIZED_GRADE_BANDS.O3_O5, 'O3 must map to O3–O5');

// Check Row 3: Contract worker with grade NA
const r3 = flattened[2];
console.log('Row 3 (Contract NA):', {
  emp: r3.employeeName,
  originalGrade: r3.originalGradeAtSubmission,
  standardizedGrade: r3.standardizedGrade,
  employeeType: r3.employeeType
});
assert.strictEqual(r3.standardizedGrade, STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL, 'NA with Contract must map to Outsourced / Contractual');

// Verify Workload Separation
const staffedHours = flattened.filter(r => !r.isVacant).reduce((sum, r) => sum + r.monthlyHours, 0);
const vacantHours = flattened.filter(r => r.isVacant).reduce((sum, r) => sum + r.monthlyHours, 0);

console.log('\nWorkload Separation Verification:');
console.log(`Staffed Hours: ${staffedHours} hrs (${(staffedHours/160).toFixed(2)} FTE)`);
console.log(`Vacant Hours:  ${vacantHours} hrs (${(vacantHours/160).toFixed(2)} FTE)`);

assert.strictEqual(staffedHours, 240, 'Staffed hours must be 160 + 80 = 240 hrs');
assert.strictEqual(vacantHours, 120, 'Vacant hours must be 120 hrs');

console.log('\n✅ ALL INTEGRATION CHECKS PASSED PERFECTLY!');
