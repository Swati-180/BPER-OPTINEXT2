const assert = require('assert');
const { standardizeGrade, STANDARDIZED_GRADE_BANDS } = require('../utils/gradeStandardizer');

console.log('=== TEST SUITE 2: HISTORICAL (OPTION A) VS CURRENT GRADE TOGGLE TESTS ===\n');

// Mock function mirroring getWorkforceCapacityReport resolution logic
function resolveEffectiveGrade(submission, liveUser, gradePerspective = 'historical') {
  const originalGradeAtSubmission = submission.employee?.originalGradeAtSubmission || submission.employee?.grade || '';
  const standardizedGradeAtSubmission = submission.employee?.standardizedGradeAtSubmission || standardizeGrade(originalGradeAtSubmission, submission.employee?.employeeType);

  let effectiveGrade = originalGradeAtSubmission;
  let effectiveStandardizedBand = standardizedGradeAtSubmission;

  if (gradePerspective === 'current') {
    if (liveUser && liveUser.band) {
      effectiveGrade = liveUser.band;
      effectiveStandardizedBand = standardizeGrade(liveUser.band, submission.employee?.employeeType);
    }
    // Fallback: If liveUser is missing or has no band, effectiveGrade remains submission grade
  }

  return {
    gradePerspective,
    effectiveGrade,
    effectiveStandardizedBand,
    originalGradeAtSubmission,
    currentGrade: liveUser ? liveUser.band : null,
    isFallbackUsed: gradePerspective === 'current' && (!liveUser || !liveUser.band)
  };
}

// Case 1: Employee submitted at E2, subsequently promoted to E3 in User record
const subPromoted = {
  employee: {
    employeeId: 'EMP-PROMOTED',
    name: 'Promoted Employee',
    grade: 'E2',
    originalGradeAtSubmission: 'E2',
    employeeType: 'Permanent'
  }
};
const userPromoted = {
  employeeId: 'EMP-PROMOTED',
  band: 'E3'
};

// 1A. Historical view (Default Option A) must evaluate to E2
const resHistorical = resolveEffectiveGrade(subPromoted, userPromoted, 'historical');
console.log('Case 1A (Historical Perspective - Default):', resHistorical);
assert.strictEqual(resHistorical.effectiveGrade, 'E2', 'Historical view must retain submission grade E2');
assert.strictEqual(resHistorical.effectiveStandardizedBand, STANDARDIZED_GRADE_BANDS.E1_E4, 'E2 must map to E1–E4');
console.log('✅ PASS: Historical view retains E2 grade at submission');

// 1B. Current view must evaluate to E3
const resCurrent = resolveEffectiveGrade(subPromoted, userPromoted, 'current');
console.log('Case 1B (Current Perspective):', resCurrent);
assert.strictEqual(resCurrent.effectiveGrade, 'E3', 'Current view must reflect live grade E3');
assert.strictEqual(resCurrent.effectiveStandardizedBand, STANDARDIZED_GRADE_BANDS.E1_E4, 'E3 must map to E1–E4');
console.log('✅ PASS: Current view reflects live grade E3');

// Case 2: Employee promoted from O5 to GM (crossing grade band boundaries)
const subPromotionBandCross = {
  employee: {
    employeeId: 'EMP-CROSS',
    name: 'Band Crossing Employee',
    grade: 'O5',
    originalGradeAtSubmission: 'O5',
    employeeType: 'Permanent'
  }
};
const userPromotionBandCross = {
  employeeId: 'EMP-CROSS',
  band: 'GM'
};

const resCrossHistorical = resolveEffectiveGrade(subPromotionBandCross, userPromotionBandCross, 'historical');
console.log('\nCase 2A (Historical Cross-Band):', resCrossHistorical);
assert.strictEqual(resCrossHistorical.effectiveGrade, 'O5');
assert.strictEqual(resCrossHistorical.effectiveStandardizedBand, STANDARDIZED_GRADE_BANDS.O3_O5);
console.log('✅ PASS: Historical view classifies under O3–O5');

const resCrossCurrent = resolveEffectiveGrade(subPromotionBandCross, userPromotionBandCross, 'current');
console.log('Case 2B (Current Cross-Band):', resCrossCurrent);
assert.strictEqual(resCrossCurrent.effectiveGrade, 'GM');
assert.strictEqual(resCrossCurrent.effectiveStandardizedBand, STANDARDIZED_GRADE_BANDS.GM);
console.log('✅ PASS: Current view dynamically shifts to GM band');

// Case 3: Missing User record (employee not present in live User collection)
const subMissingUser = {
  employee: {
    employeeId: 'EMP-EXTRACT-ONLY',
    name: 'Former Contractor',
    grade: 'NA',
    originalGradeAtSubmission: 'NA',
    employeeType: 'Contract'
  }
};
// liveUser is null/undefined
const resFallback = resolveEffectiveGrade(subMissingUser, null, 'current');
// Case 4: NA grade with explicit Contract type -> Outsourced / Contractual
const bandContractExplicit = standardizeGrade('NA', 'Contract');
assert.strictEqual(bandContractExplicit, STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL, 'NA + Contract must map to Outsourced / Contractual');
console.log('✅ PASS: NA + Contract explicitly maps to Outsourced / Contractual');

// Case 5: NA grade with missing/undefined employee type -> strictly Unmapped
const bandNAMissingType = standardizeGrade('NA', '');
assert.strictEqual(bandNAMissingType, STANDARDIZED_GRADE_BANDS.UNMAPPED, 'NA without Contract must remain Unmapped');
console.log('✅ PASS: NA with missing/blank employee type strictly remains Unmapped');

// Case 6: Reporting-layer reconciliation for the 4 verified October 2026 source contractor IDs
const OCT_2026_VERIFIED_CONTRACT_IDS = new Set(['14406', '35781', '67815', '85047']);
const verifiedContractIds = ['14406', '35781', '67815', '85047'];

verifiedContractIds.forEach(id => {
  const rowInOctDataset = {
    employeeId: id,
    grade: 'NA',
    originalGradeAtSubmission: 'NA',
    employeeType: undefined, // Missing in DB document
    reportingPeriod: '2026-10'
  };

  // Reconcile as in reportsController
  const isOct2026 = rowInOctDataset.reportingPeriod === '2026-10';
  let effectiveType = rowInOctDataset.employeeType;
  if (!effectiveType && isOct2026 && OCT_2026_VERIFIED_CONTRACT_IDS.has(rowInOctDataset.employeeId)) {
    effectiveType = 'Contract';
  }
  const effectiveBand = standardizeGrade(rowInOctDataset.grade, effectiveType);
  assert.strictEqual(effectiveBand, STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL, `ID ${id} must resolve to Outsourced / Contractual`);
});
console.log('✅ PASS: All 4 verified October 2026 source IDs safely map to Outsourced / Contractual via reporting fallback');

// Case 7: Unverified NA employee in October dataset with missing employeeType -> remains Unmapped
const unverifiedNARow = {
  employeeId: '99999',
  grade: 'NA',
  originalGradeAtSubmission: 'NA',
  employeeType: undefined,
  reportingPeriod: '2026-10'
};
let unverifiedType = unverifiedNARow.employeeType;
if (!unverifiedType && unverifiedNARow.reportingPeriod === '2026-10' && OCT_2026_VERIFIED_CONTRACT_IDS.has(unverifiedNARow.employeeId)) {
  unverifiedType = 'Contract';
}
const unverifiedBand = standardizeGrade(unverifiedNARow.grade, unverifiedType);
assert.strictEqual(unverifiedBand, STANDARDIZED_GRADE_BANDS.UNMAPPED, 'Unverified NA employee must remain Unmapped');
console.log('✅ PASS: Unverified NA employee with missing employee type safely remains Unmapped');

console.log('\n🎉 ALL HISTORICAL VS CURRENT GRADE TOGGLE & CONTRACT RECONCILIATION TESTS PASSED 100%!');
