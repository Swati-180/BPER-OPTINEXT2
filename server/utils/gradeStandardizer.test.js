const { standardizeGrade, STANDARDIZED_GRADE_BANDS, isApprovedGradeBand } = require('./gradeStandardizer');

function assertEqual(actual, expected, testName) {
  if (actual !== expected) {
    console.error(`❌ FAIL: ${testName} -> Expected: "${expected}", Actual: "${actual}"`);
    process.exitCode = 1;
  } else {
    console.log(`✅ PASS: ${testName} -> "${actual}"`);
  }
}

console.log('=== RUNNING GRADE STANDARDIZATION UNIT TESTS (POINT 12.a) ===\n');

// 1. SP / VP -> VP
assertEqual(standardizeGrade('SP'), STANDARDIZED_GRADE_BANDS.VP, 'SP maps to VP');
assertEqual(standardizeGrade('sp'), STANDARDIZED_GRADE_BANDS.VP, 'sp lowercase maps to VP');
assertEqual(standardizeGrade('VP'), STANDARDIZED_GRADE_BANDS.VP, 'VP maps to VP');
assertEqual(standardizeGrade('SVP'), STANDARDIZED_GRADE_BANDS.VP, 'SVP maps to VP');

// 2. AP & GM -> AVP & GM
assertEqual(standardizeGrade('AP'), STANDARDIZED_GRADE_BANDS.AVP_GM, 'AP maps to AVP & GM');
assertEqual(standardizeGrade('ap'), STANDARDIZED_GRADE_BANDS.AVP_GM, 'ap lowercase maps to AVP & GM');
assertEqual(standardizeGrade('AVP'), STANDARDIZED_GRADE_BANDS.AVP_GM, 'AVP maps to AVP & GM');
assertEqual(standardizeGrade('GM'), STANDARDIZED_GRADE_BANDS.AVP_GM, 'GM maps to AVP & GM');
assertEqual(standardizeGrade('gm'), STANDARDIZED_GRADE_BANDS.AVP_GM, 'gm lowercase maps to AVP & GM');

// 3. E1, E2 -> E1–E2
assertEqual(standardizeGrade('E1'), STANDARDIZED_GRADE_BANDS.E1_E2, 'E1 maps to E1–E2');
assertEqual(standardizeGrade('E2'), STANDARDIZED_GRADE_BANDS.E1_E2, 'E2 maps to E1–E2');

// 4. E3, E4 -> E3–E4
assertEqual(standardizeGrade('E3'), STANDARDIZED_GRADE_BANDS.E3_E4, 'E3 maps to E3–E4');
assertEqual(standardizeGrade('E4'), STANDARDIZED_GRADE_BANDS.E3_E4, 'E4 maps to E3–E4');

// 5. O3, O4, O5 -> O3–O5
assertEqual(standardizeGrade('O3'), STANDARDIZED_GRADE_BANDS.O3_O5, 'O3 maps to O3–O5');
assertEqual(standardizeGrade('O4'), STANDARDIZED_GRADE_BANDS.O3_O5, 'O4 maps to O3–O5');
assertEqual(standardizeGrade('O5'), STANDARDIZED_GRADE_BANDS.O3_O5, 'O5 maps to O3–O5');

// 6. O1, O2 -> O2 and Below + Intern
assertEqual(standardizeGrade('O1'), STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN, 'O1 maps to O2 and Below + Intern');
assertEqual(standardizeGrade('O2'), STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN, 'O2 maps to O2 and Below + Intern');

// Rule: Interns classified based on actual employment type, not assumed from O1/O2
assertEqual(standardizeGrade('', 'Intern'), STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN, 'Intern employeeType maps to O2 and Below + Intern');
assertEqual(standardizeGrade('E2', 'Intern'), STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN, 'Intern employeeType overrides raw grade');

// 7. NA (Employee Type = Contract) -> Outsourced / Contractual
assertEqual(standardizeGrade('NA', 'Contract'), STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL, 'NA with Contract maps to Outsourced / Contractual');
assertEqual(standardizeGrade('N/A', 'contract'), STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL, 'N/A with lowercase contract maps to Outsourced / Contractual');
assertEqual(standardizeGrade('', 'Contract'), STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL, 'Blank grade with Contract maps to Outsourced / Contractual');

// 8. Unmapped handling (Must mark as Unmapped rather than auto-assigning)
assertEqual(standardizeGrade('NA', 'Permanent'), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'NA without contract maps to Unmapped');
assertEqual(standardizeGrade('UNKNOWN'), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'Unknown string maps to Unmapped');
assertEqual(standardizeGrade(''), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'Empty grade maps to Unmapped');
assertEqual(standardizeGrade(null), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'null grade maps to Unmapped');
assertEqual(standardizeGrade(undefined), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'undefined grade maps to Unmapped');
assertEqual(standardizeGrade('XYZ-99'), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'Arbitrary invalid grade maps to Unmapped');

// Helper check
assertEqual(isApprovedGradeBand(STANDARDIZED_GRADE_BANDS.VP), true, 'VP is approved band');
assertEqual(isApprovedGradeBand(STANDARDIZED_GRADE_BANDS.AVP_GM), true, 'AVP & GM is approved band');
assertEqual(isApprovedGradeBand(STANDARDIZED_GRADE_BANDS.E1_E2), true, 'E1–E2 is approved band');
assertEqual(isApprovedGradeBand(STANDARDIZED_GRADE_BANDS.E3_E4), true, 'E3–E4 is approved band');
assertEqual(isApprovedGradeBand('Unmapped'), false, 'Unmapped is not in the approved bands');

if (process.exitCode === 1) {
  console.log('\n❌ SOME UNIT TESTS FAILED!');
} else {
  console.log('\n🎉 ALL GRADE STANDARDIZATION TESTS PASSED 100%!');
}
