/**
 * Grade Band Standardization Utility
 * Approved by Leadership for OptiNXT implementation.
 *
 * Six Standardized Grade Bands:
 * 1. VP & AVP (SP, AP)
 * 2. GM (GM)
 * 3. E1–E4 (E1, E2, E3, E4)
 * 4. O3–O5 (O3, O4, O5)
 * 5. O2 and Below + Intern (O1, O2, plus explicit Interns)
 * 6. Outsourced / Contractual (NA / Contract workers)
 *
 * Business Rules:
 * - Retain the original grade in the database. Standardization should happen at the reporting layer.
 * - Keep all six standardized grade bands consistent across reports and dashboards.
 * - Interns should be classified based on their actual employment type, not assumed from O1/O2.
 * - If a grade is missing or does not match the mapping, mark it as "Unmapped" rather than automatically assigning a category.
 */

const STANDARDIZED_GRADE_BANDS = {
  VP_AVP: 'VP & AVP',
  GM: 'GM',
  E1_E4: 'E1–E4',
  O3_O5: 'O3–O5',
  O2_BELOW_INTERN: 'O2 and Below + Intern',
  OUTSOURCED_CONTRACTUAL: 'Outsourced / Contractual',
  UNMAPPED: 'Unmapped',
};

const ORDERED_GRADE_BANDS = [
  STANDARDIZED_GRADE_BANDS.VP_AVP,
  STANDARDIZED_GRADE_BANDS.GM,
  STANDARDIZED_GRADE_BANDS.E1_E4,
  STANDARDIZED_GRADE_BANDS.O3_O5,
  STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN,
  STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL,
  STANDARDIZED_GRADE_BANDS.UNMAPPED,
];

/**
 * Standardize an original grade string and optional employee type.
 *
 * @param {string|null|undefined} originalGrade - The raw grade from dataset/DB (e.g., 'SP', 'E2', 'NA')
 * @param {string|null|undefined} employeeType - Optional employment type (e.g., 'Permanent', 'Contract', 'Intern')
 * @returns {string} One of the 6 standardized grade bands, or 'Unmapped'
 */
function standardizeGrade(originalGrade, employeeType = '') {
  const normType = String(employeeType || '').trim().toLowerCase();
  const rawGrade = String(originalGrade || '').trim().toUpperCase();

  // Rule: Interns must be classified based on actual employment type, not assumed from O1/O2
  if (normType === 'intern' || normType.includes('intern')) {
    return STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN;
  }

  // Rule: NA with Contract, or explicit Outsourced/Contractual employment type
  if (
    (rawGrade === 'NA' || rawGrade === 'N/A' || rawGrade === '') &&
    (normType === 'contract' || normType.includes('contract') || normType.includes('outsourced'))
  ) {
    return STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL;
  }

  // Also check if employeeType is Contract/Outsourced when grade is explicitly NA
  if (rawGrade === 'NA' || rawGrade === 'N/A') {
    if (normType === 'contract' || normType.includes('contract') || normType.includes('outsourced')) {
      return STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL;
    }
    // If grade is NA without contract type, it cannot be safely mapped
    return STANDARDIZED_GRADE_BANDS.UNMAPPED;
  }

  switch (rawGrade) {
    case 'SP':
    case 'AP':
      return STANDARDIZED_GRADE_BANDS.VP_AVP;

    case 'GM':
      return STANDARDIZED_GRADE_BANDS.GM;

    case 'E1':
    case 'E2':
    case 'E3':
    case 'E4':
      return STANDARDIZED_GRADE_BANDS.E1_E4;

    case 'O3':
    case 'O4':
    case 'O5':
      return STANDARDIZED_GRADE_BANDS.O3_O5;

    case 'O1':
    case 'O2':
      return STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN;

    default:
      // If employeeType is Contract or Outsourced even if grade was not NA (or missing)
      if (normType === 'contract' || normType.includes('contract') || normType.includes('outsourced')) {
        return STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL;
      }
      return STANDARDIZED_GRADE_BANDS.UNMAPPED;
  }
}

/**
 * Check whether a band is one of the 6 canonical approved bands
 */
function isApprovedGradeBand(band) {
  return [
    STANDARDIZED_GRADE_BANDS.VP_AVP,
    STANDARDIZED_GRADE_BANDS.GM,
    STANDARDIZED_GRADE_BANDS.E1_E4,
    STANDARDIZED_GRADE_BANDS.O3_O5,
    STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN,
    STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL,
  ].includes(band);
}

// System / administrative test accounts that must be excluded from operational workforce analytics
const SYSTEM_TEST_ACCOUNT_IDS = Object.freeze(['BPER-000', 'BPER-999']);

module.exports = {
  STANDARDIZED_GRADE_BANDS,
  ORDERED_GRADE_BANDS,
  SYSTEM_TEST_ACCOUNT_IDS,
  standardizeGrade,
  isApprovedGradeBand,
};
