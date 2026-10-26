const assert = require('assert');
const WDTSubmission = require('../models/WDTSubmission');
const { STANDARDIZED_GRADE_BANDS } = require('../utils/gradeStandardizer');

console.log('=== TEST SUITE 3: WDT SUBMISSION REPORTING PERIOD & GRADE HOOK TESTS ===\n');

function triggerPreSave(doc) {
  const pres = WDTSubmission.schema.s.hooks._pres.get('save') || [];
  for (const p of pres) {
    if (typeof p.fn === 'function' && p.fn.name === '') {
      p.fn.call(doc, () => {});
    }
  }
}

// Test 1: Month 10 and Year 2026 produce reportingPeriod '2026-10'
const doc1 = new WDTSubmission({
  referenceId: 'TEST-HOOK-001',
  month: 10,
  year: 2026,
  employee: {
    employeeId: 'EMP-HOOK-1',
    name: 'Alice Staff',
    grade: 'E2',
    employeeType: 'Permanent'
  },
  payload: { rows: [{ activityCategory: 'core', timeTakenHoursPerMonth: 160 }] }
});

triggerPreSave(doc1);

console.log('Test 1 (Reporting Period & Historical Grade Capture):', {
  reportingPeriod: doc1.reportingPeriod,
  originalGradeAtSubmission: doc1.employee.originalGradeAtSubmission,
  standardizedGradeAtSubmission: doc1.employee.standardizedGradeAtSubmission,
  occupancyStatus: doc1.employee.occupancyStatus,
  isVacant: doc1.employee.isVacant
});

assert.strictEqual(doc1.reportingPeriod, '2026-10', 'Month 10 Year 2026 must generate reportingPeriod "2026-10"');
assert.strictEqual(doc1.employee.originalGradeAtSubmission, 'E2', 'originalGradeAtSubmission must be preserved as E2');
assert.strictEqual(doc1.employee.standardizedGradeAtSubmission, STANDARDIZED_GRADE_BANDS.E1_E4, 'E2 must standardize to E1–E4');
assert.strictEqual(doc1.employee.occupancyStatus, 'Occupied', 'Occupancy status must be Occupied');
assert.strictEqual(doc1.employee.isVacant, false, 'isVacant must be false');
console.log('✅ PASS: Test 1 passed successfully');

// Test 2: Vacant position detection in pre-save hook
const docVac = new WDTSubmission({
  referenceId: 'TEST-HOOK-VAC',
  month: 10,
  year: 2026,
  employee: {
    employeeId: '10001099',
    name: 'Vacant',
    grade: 'O3',
    employeeType: 'Permanent'
  },
  payload: { rows: [{ activityCategory: 'core', timeTakenHoursPerMonth: 120 }] }
});

triggerPreSave(docVac);

console.log('\nTest 2 (Vacant Position Detection):', {
  name: docVac.employee.name,
  isVacant: docVac.employee.isVacant,
  occupancyStatus: docVac.employee.occupancyStatus,
  standardizedGrade: docVac.employee.standardizedGradeAtSubmission
});

assert.strictEqual(docVac.employee.isVacant, true, 'isVacant must be true for Vacant position');
assert.strictEqual(docVac.employee.occupancyStatus, 'Vacant', 'occupancyStatus must be Vacant');
assert.strictEqual(docVac.employee.standardizedGradeAtSubmission, STANDARDIZED_GRADE_BANDS.O3_O5, 'O3 must standardize to O3–O5');
console.log('✅ PASS: Test 2 passed successfully');

// Test 3: Month padding (e.g. Month 4 Year 2026 -> 2026-04)
const docPad = new WDTSubmission({
  referenceId: 'TEST-HOOK-PAD',
  month: 4,
  year: 2026,
  employee: { name: 'Staff Member', grade: 'GM' },
  payload: { rows: [] }
});

triggerPreSave(docPad);
console.log('\nTest 3 (Single-Digit Month Padding):', docPad.reportingPeriod);
assert.strictEqual(docPad.reportingPeriod, '2026-04', 'Month 4 must pad to "2026-04"');
console.log('✅ PASS: Test 3 passed successfully');

console.log('\n🎉 ALL WDT SUBMISSION SCHEMA HOOK TESTS PASSED 100%!');
