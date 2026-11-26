/**
 * Grade Band Standardization Utility
 * Approved by Leadership for OptiNXT implementation.
 *
 * Exactly Six Approved Grade Bands:
 * 1. VP & AVP (SP, SVP, VP, AP, AVP)
 * 2. GM (GM)
 * 3. E1–E4 (E1, E2, E3, E4)
 * 4. O3–O5 (O3, O4, O5)
 * 5. O2 and Below + Intern (O1, O2, plus explicit Interns)
 * 6. Outsourced / Contractual (Contract / Outsourced workers)
 *
 * Data Quality Status (NOT an approved grade band):
 * - Unmapped (Missing, invalid, or unverified grades)
 *
 * Business Rules:
 * - Retain the original raw grade in the database. Standardization happens at the reporting layer.
 * - Interns should be classified based on actual employment type, not assumed from O1/O2.
 * - If a grade is missing or does not match an approved rule, mark it as "Unmapped".
 * - "Unmapped" must remain a separate data-quality status, NOT an approved grade band.
 */

const STANDARDIZED_GRADE_BANDS = {
  VP_AVP: 'VP & AVP',
  GM: 'GM',
  E1_E4: 'E1–E4',
  O3_O5: 'O3–O5',
  O2_BELOW_INTERN: 'O2 and Below + Intern',
  OUTSOURCED_CONTRACTUAL: 'Outsourced / Contractual',

  // Data Quality Status (NOT an approved grade band)
  UNMAPPED: 'Unmapped',

  // Backward compatibility / convenience aliases
  get VP() { return this.VP_AVP; },
  get AVP_GM() { return this.GM; },
  get E1_E2() { return this.E1_E4; },
  get E3_E4() { return this.E1_E4; },
};

// Exactly the six approved grade bands in hierarchical order
const APPROVED_GRADE_BANDS = Object.freeze([
  STANDARDIZED_GRADE_BANDS.VP_AVP,
  STANDARDIZED_GRADE_BANDS.GM,
  STANDARDIZED_GRADE_BANDS.E1_E4,
  STANDARDIZED_GRADE_BANDS.O3_O5,
  STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN,
  STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL,
]);

// Ordered grade bands for reports (6 approved bands + optional data quality status if present)
const ORDERED_GRADE_BANDS = Object.freeze([
  ...APPROVED_GRADE_BANDS,
  'Unmapped'
]);

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

  // Rule 1: Interns must be classified based on actual employment type
  if (normType === 'intern' || normType.includes('intern')) {
    return STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN;
  }

  // Rule 2: Contract or explicit Outsourced employment type
  if (
    (rawGrade === 'NA' || rawGrade === 'N/A' || rawGrade === '') &&
    (normType === 'contract' || normType.includes('contract') || normType.includes('outsourced'))
  ) {
    return STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL;
  }

  if (rawGrade === 'NA' || rawGrade === 'N/A') {
    if (normType === 'contract' || normType.includes('contract') || normType.includes('outsourced')) {
      return STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL;
    }
    // If grade is NA without contract type, it cannot be safely mapped -> Data quality status: Unmapped
    return 'Unmapped';
  }

  switch (rawGrade) {
    // Band 1: VP & AVP
    case 'SP':
    case 'SVP':
    case 'VP':
    case 'AP':
    case 'AVP':
    case 'VP & AVP':
    case 'VP&AVP':
      return STANDARDIZED_GRADE_BANDS.VP_AVP;

    // Band 2: GM
    case 'GM':
      return STANDARDIZED_GRADE_BANDS.GM;

    // Band 3: E1–E4
    case 'E1':
    case 'E2':
    case 'E3':
    case 'E4':
    case 'E1–E2':
    case 'E1-E2':
    case 'E3–E4':
    case 'E3-E4':
    case 'E1–E4':
    case 'E1-E4':
      return STANDARDIZED_GRADE_BANDS.E1_E4;

    // Band 4: O3–O5
    case 'O3':
    case 'O4':
    case 'O5':
    case 'O3–O5':
    case 'O3-O5':
      return STANDARDIZED_GRADE_BANDS.O3_O5;

    // Band 5: O2 and Below + Intern
    case 'O1':
    case 'O2':
    case 'O2 AND BELOW + INTERN':
    case 'O2 AND BELOW':
      return STANDARDIZED_GRADE_BANDS.O2_BELOW_INTERN;

    default:
      // If employeeType is Contract or Outsourced even if grade was not NA
      if (normType === 'contract' || normType.includes('contract') || normType.includes('outsourced')) {
        return STANDARDIZED_GRADE_BANDS.OUTSOURCED_CONTRACTUAL;
      }
      return 'Unmapped';
  }
}

/**
 * Check whether a band is one of the exactly 6 approved bands
 */
function isApprovedGradeBand(band) {
  return APPROVED_GRADE_BANDS.includes(band);
}

// System / administrative test accounts that must be excluded from operational workforce analytics
const SYSTEM_TEST_ACCOUNT_IDS = Object.freeze(['BPER-000', 'BPER-999']);

module.exports = {
  STANDARDIZED_GRADE_BANDS,
  APPROVED_GRADE_BANDS,
  ORDERED_GRADE_BANDS,
  SYSTEM_TEST_ACCOUNT_IDS,
  standardizeGrade,
  isApprovedGradeBand,
};
