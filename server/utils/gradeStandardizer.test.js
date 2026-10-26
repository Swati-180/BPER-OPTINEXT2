const { standardizeGrade, STANDARDIZED_GRADE_BANDS, isApprovedGradeBand } = require('./gradeStandardizer');

function assertEqual(actual, expected, testName) {
  if (actual !== expected) {
    console.error(`❌ FAIL: ${testName} -> Expected: "${expected}", Actual: "${actual}"`);
    process.exitCode = 1;
  } else {
    console.log(`✅ PASS: ${testName} -> "${actual}"`);
  }
}

console.log('=== RUNNING GRADE STANDARDIZATION UNIT TESTS ===\n');

// 1. SP & AP -> VP & AVP
assertEqual(standardizeGrade('SP'), STANDARDIZED_GRADE_BANDS.VP_AVP, 'SP maps to VP & AVP');
assertEqual(standardizeGrade('sp'), STANDARDIZED_GRADE_BANDS.VP_AVP, 'sp lowercase maps to VP & AVP');
assertEqual(standardizeGrade('AP'), STANDARDIZED_GRADE_BANDS.VP_AVP, 'AP maps to VP & AVP');

// 2. GM -> GM
assertEqual(standardizeGrade('GM'), STANDARDIZED_GRADE_BANDS.GM, 'GM maps to GM');
assertEqual(standardizeGrade('gm'), STANDARDIZED_GRADE_BANDS.GM, 'gm lowercase maps to GM');

// 3. E1, E2, E3, E4 -> E1–E4
assertEqual(standardizeGrade('E1'), STANDARDIZED_GRADE_BANDS.E1_E4, 'E1 maps to E1–E4');
assertEqual(standardizeGrade('E2'), STANDARDIZED_GRADE_BANDS.E1_E4, 'E2 maps to E1–E4');
assertEqual(standardizeGrade('E3'), STANDARDIZED_GRADE_BANDS.E1_E4, 'E3 maps to E1–E4');
assertEqual(standardizeGrade('E4'), STANDARDIZED_GRADE_BANDS.E1_E4, 'E4 maps to E1–E4');

// 4. O3, O4, O5 -> O3–O5
assertEqual(standardizeGrade('O3'), STANDARDIZED_GRADE_BANDS.O3_O5, 'O3 maps to O3–O5');
assertEqual(standardizeGrade('O4'), STANDARDIZED_GRADE_BANDS.O3_O5, 'O4 maps to O3–O5');
assertEqual(standardizeGrade('O5'), STANDARDIZED_GRADE_BANDS.O3_O5, 'O5 maps to O3–O5');

// 5. O1, O2 -> O2 and Below + Intern
assertEqual(standardizeGrade('O1'), STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN, 'O1 maps to O2 and Below + Intern');
assertEqual(standardizeGrade('O2'), STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN, 'O2 maps to O2 and Below + Intern');

// Rule: Interns classified based on actual employment type, not assumed from O1/O2
assertEqual(standardizeGrade('', 'Intern'), STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN, 'Intern employeeType maps to O2 and Below + Intern');
assertEqual(standardizeGrade('E2', 'Intern'), STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN, 'Intern employeeType overrides raw grade');

// 6. NA (Employee Type = Contract) -> Outsourced / Contractual
assertEqual(standardizeGrade('NA', 'Contract'), STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL, 'NA with Contract maps to Outsourced / Contractual');
assertEqual(standardizeGrade('N/A', 'contract'), STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL, 'N/A with lowercase contract maps to Outsourced / Contractual');
assertEqual(standardizeGrade('', 'Contract'), STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL, 'Blank grade with Contract maps to Outsourced / Contractual');

// 7. Unmapped handling (Must mark as Unmapped rather than auto-assigning)
assertEqual(standardizeGrade('NA', 'Permanent'), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'NA without contract maps to Unmapped');
assertEqual(standardizeGrade('UNKNOWN'), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'Unknown string maps to Unmapped');
assertEqual(standardizeGrade(''), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'Empty grade maps to Unmapped');
assertEqual(standardizeGrade(null), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'null grade maps to Unmapped');
assertEqual(standardizeGrade(undefined), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'undefined grade maps to Unmapped');
assertEqual(standardizeGrade('XYZ-99'), STANDARDIZED_GRADE_BANDS.UNMAPPED, 'Arbitrary invalid grade maps to Unmapped');

// Helper check
assertEqual(isApprovedGradeBand(STANDARDIZED_GRADE_BANDS.VP_AVP), true, 'VP & AVP is approved band');
assertEqual(isApprovedGradeBand('Unmapped'), false, 'Unmapped is not in the 6 approved bands');

if (process.exitCode === 1) {
  console.log('\n❌ SOME UNIT TESTS FAILED!');
} else {
  console.log('\n🎉 ALL GRADE STANDARDIZATION TESTS PASSED 100%!');
}
