/**
 * Stage 2.5 Correction Pass Comprehensive Test Suite
 *
 * Verifies:
 * 1. FIX 1 & 2: Excel Export Calculations with configured non-default monthly hours (e.g. 150h).
 *    - Workload: 300 hours -> Expected FTE: 2.00 FTE (instead of 1.88 FTE at 160h).
 *    - Both exportWDTSubmissionsExcel and exportFTEReportExcel paths verified.
 * 2. FIX 3: Audit failure compensating rollback.
 *    - If auditLogger fails, SystemConfig is rolled back to previous state.
 *    - Returns HTTP 500 with { rolledBack: true }.
 *    - When rollback itself fails, returns { rolledBack: false }.
 */

const assert = require('assert');
const ExcelJS = require('exceljs');
const SystemConfig = require('../models/SystemConfig');
const assumptionsService = require('../services/assumptionsService');
const exportController = require('../controllers/exportController');
const configController = require('../controllers/configController');
const auditLogger = require('../utils/auditLogger');
const User = require('../models/User');
const WDTSubmission = require('../models/WDTSubmission');
const ProcessAnalysis = require('../models/ProcessAnalysis');
const Taxonomy = require('../models/Taxonomy');

// Helper mock response that buffers Excel binary output
function createMockExcelRes() {
  const chunks = [];
  const headers = {};
  let statusCode = 200;
  return {
    setHeader(name, val) {
      headers[name] = val;
    },
    getHeader(name) {
      return headers[name];
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      return data;
    },
    write(chunk) {
      if (chunk) chunks.push(Buffer.from(chunk));
      return true;
    },
    end(chunk) {
      if (chunk) chunks.push(Buffer.from(chunk));
    },
    getBuffer() {
      return Buffer.concat(chunks);
    }
  };
}

async function runTests() {
  console.log('=== Starting Problem 4(g) Stage 2.5 Correction Pass Tests ===\n');
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // ─── TEST 1: exportWDTSubmissionsExcel with non-default standardMonthlyHours (150h) ───
  await test('1. exportWDTSubmissionsExcel uses configured monthly hours (150h => 300h workload = 2.00 FTE)', async () => {
    assumptionsService.invalidateAssumptionsCache();

    const origUserFindById = User.findById;
    User.findById = () => ({
      select: async () => ({ role: 'manager' })
    });

    const origFindOne = SystemConfig.findOne;
    SystemConfig.findOne = () => ({
      lean: async () => ({
        key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY,
        scenarioAssumptions: { efficiencyFactor: 0.35, costPerFteLakhs: 10 },
        screeningSettings: {
          standardMonthlyHours: 150,
          screeningThresholdHours: 26,
          screeningKeywords: ['automation', 'rpa', 'repeat']
        }
      })
    });

    const origPamFind = ProcessAnalysis.find;
    ProcessAnalysis.find = () => ({
      sort: () => ({
        lean: async () => []
      })
    });

    const origTaxFind = Taxonomy.find;
    Taxonomy.find = () => ({
      lean: async () => []
    });

    const origSubFind = WDTSubmission.find;
    WDTSubmission.find = () => ({
      sort: () => ({
        lean: async () => [
          {
            referenceId: 'WDT-TEST-001',
            employee: { name: 'Test User', employeeId: 'EMP001', department: 'Claims' },
            month: 10,
            year: 2026,
            totalHours: 300,
            status: 'Approved',
            submittedAt: new Date(),
            payload: {
              rows: [
                {
                  majorProcess: 'Operations',
                  process: 'Adjudication',
                  subProcess: 'Auto Adjudication',
                  activityCategory: 'core',
                  frequency: 'Monthly',
                  volumesMonthly: 100,
                  timePerTransactionMinutes: 180,
                  timeTakenHoursPerMonth: 300,
                  applicationsUsed: 'CoreApp',
                  comments: '300 hours claim processing'
                }
              ]
            }
          }
        ]
      })
    });

    const mockReq = {
      user: { userId: 'mgr-001', role: 'manager' },
      query: { department: 'All Departments' }
    };
    const mockRes = createMockExcelRes();

    try {
      await exportController.exportWDTSubmissionsExcel(mockReq, mockRes);
      const buffer = mockRes.getBuffer();
      assert.ok(buffer.length > 0, 'Workbook buffer should not be empty');

      // Parse generated Excel workbook to inspect cell values
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      // Sheet 1: Submission Summary -> Row 2, column 'FTE' (col 8)
      const summarySheet = workbook.getWorksheet('Submission Summary');
      assert.ok(summarySheet, 'Submission Summary sheet must exist');
      const summaryRow = summarySheet.getRow(2);
      const summaryFte = summaryRow.getCell(8).value;
      assert.strictEqual(summaryFte, 2, 'Summary FTE for 300h / 150h must equal exactly 2.00 (not 1.88 at 160h)');

      // Sheet 2: Activity Detail -> Row 2, column 'FTE' (col 12)
      const detailSheet = workbook.getWorksheet('Activity Detail');
      assert.ok(detailSheet, 'Activity Detail sheet must exist');
      const detailRow = detailSheet.getRow(2);
      const detailFte = detailRow.getCell(12).value;
      assert.strictEqual(detailFte, 2, 'Activity Detail FTE for 300h / 150h must equal exactly 2.00');

      // Sheet 3: FTE by Department -> Row 2, column 'FTE' (col 3)
      const fteDeptSheet = workbook.getWorksheet('FTE by Department');
      assert.ok(fteDeptSheet, 'FTE by Department sheet must exist');
      const fteDeptRow = fteDeptSheet.getRow(2);
      const deptFte = fteDeptRow.getCell(3).value;
      assert.strictEqual(deptFte, 2, 'Department FTE for 300h / 150h must equal exactly 2.00');
    } finally {
      User.findById = origUserFindById;
      SystemConfig.findOne = origFindOne;
      WDTSubmission.find = origSubFind;
      ProcessAnalysis.find = origPamFind;
      Taxonomy.find = origTaxFind;
      assumptionsService.invalidateAssumptionsCache();
    }
  });

  // ─── TEST 2: exportFTEReportExcel with non-default standardMonthlyHours (150h) ───
  await test('2. exportFTEReportExcel uses configured monthly hours (150h => 300h workload = 2.00 FTE)', async () => {
    assumptionsService.invalidateAssumptionsCache();

    const origUserFindById = User.findById;
    User.findById = () => ({
      select: async () => ({ role: 'manager' })
    });

    const origFindOne = SystemConfig.findOne;
    SystemConfig.findOne = () => ({
      lean: async () => ({
        key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY,
        scenarioAssumptions: { efficiencyFactor: 0.35, costPerFteLakhs: 10 },
        screeningSettings: {
          standardMonthlyHours: 150,
          screeningThresholdHours: 26,
          screeningKeywords: ['automation', 'rpa', 'repeat']
        }
      })
    });

    const origSubFind = WDTSubmission.find;
    WDTSubmission.find = () => ({
      sort: () => ({
        lean: async () => [
          {
            referenceId: 'WDT-TEST-002',
            employee: { name: 'Test User 2', employeeId: 'EMP002', department: 'Billing' },
            month: 10,
            year: 2026,
            totalHours: 300,
            status: 'Approved',
            payload: {
              rows: [
                {
                  majorProcess: 'Finance',
                  process: 'Invoicing',
                  subProcess: 'Manual Bill Check',
                  activityCategory: 'core',
                  timeTakenHoursPerMonth: 300
                }
              ]
            }
          }
        ]
      })
    });

    const mockReq = {
      user: { userId: 'mgr-002', role: 'manager' },
      query: { department: 'All Departments' }
    };
    const mockRes = createMockExcelRes();

    try {
      await exportController.exportFTEReportExcel(mockReq, mockRes);
      const buffer = mockRes.getBuffer();
      assert.ok(buffer.length > 0, 'Workbook buffer should not be empty');

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const actSheet = workbook.getWorksheet('FTE Analysis');
      assert.ok(actSheet, 'FTE Analysis sheet must exist');
      const row = actSheet.getRow(2);
      const fte = row.getCell(8).value;
      assert.strictEqual(fte, 2, 'FTE Analysis for 300h / 150h must equal exactly 2.00');
    } finally {
      User.findById = origUserFindById;
      SystemConfig.findOne = origFindOne;
      WDTSubmission.find = origSubFind;
      assumptionsService.invalidateAssumptionsCache();
    }
  });

  // ─── TEST 3: Audit failure compensating rollback succeeds ───
  await test('3. Audit failure triggers compensating rollback (reverts SystemConfig & returns rolledBack: true)', async () => {
    const origFindOne = SystemConfig.findOne;
    const origFindOneAndUpdate = SystemConfig.findOneAndUpdate;
    const origLogAction = auditLogger.logAction;

    let rollbackCalledWith = null;

    // Existing doc snapshot before modification
    const initialDoc = {
      key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY,
      scenarioAssumptions: { efficiencyFactor: 0.35, costPerFteLakhs: 10 },
      screeningSettings: {
        standardMonthlyHours: 160,
        screeningThresholdHours: 26,
        screeningKeywords: ['automation', 'rpa', 'repeat']
      },
      updatedBy: 'initial-admin',
      updatedAt: new Date('2026-01-01T00:00:00Z')
    };

    let callCount = 0;
    SystemConfig.findOne = () => ({
      lean: async () => initialDoc
    });

    SystemConfig.findOneAndUpdate = async (filter, update) => {
      callCount++;
      if (callCount === 1) {
        // Initial update: pretend update succeeded
        return {
          ...initialDoc,
          scenarioAssumptions: { efficiencyFactor: 0.45, costPerFteLakhs: 10 },
          toObject: () => ({
            key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY,
            scenarioAssumptions: { efficiencyFactor: 0.45, costPerFteLakhs: 10 },
            screeningSettings: initialDoc.screeningSettings
          })
        };
      } else {
        // Second call is compensating rollback
        rollbackCalledWith = update;
        return initialDoc;
      }
    };

    // Simulate audit logger failure
    auditLogger.logAction = async () => ({
      success: false,
      error: 'Disk full on audit log cluster'
    });

    let statusCode = null;
    let jsonResponse = null;
    const mockReq = {
      user: { userId: 'admin-001', role: 'admin' },
      body: { scenarioAssumptions: { efficiencyFactor: 0.45 } }
    };
    const mockRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    try {
      await configController.updateAssumptions(mockReq, mockRes);
      assert.strictEqual(statusCode, 500);
      assert.strictEqual(jsonResponse.rolledBack, true, 'Response must confirm rollback succeeded');
      assert.ok(jsonResponse.message.includes('rolled back successfully'));
      assert.strictEqual(rollbackCalledWith.$set.scenarioAssumptions.efficiencyFactor, 0.35, 'Compensating update must revert efficiencyFactor back to 0.35');
    } finally {
      SystemConfig.findOne = origFindOne;
      SystemConfig.findOneAndUpdate = origFindOneAndUpdate;
      auditLogger.logAction = origLogAction;
    }
  });

  // ─── TEST 4: Audit failure compensating rollback fails gracefully ───
  await test('4. Audit failure reports rolledBack: false if compensating rollback encounters an error', async () => {
    const origFindOne = SystemConfig.findOne;
    const origFindOneAndUpdate = SystemConfig.findOneAndUpdate;
    const origLogAction = auditLogger.logAction;

    const initialDoc = {
      key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY,
      scenarioAssumptions: { efficiencyFactor: 0.35, costPerFteLakhs: 10 },
      screeningSettings: SystemConfig.DEFAULT_SCREENING_SETTINGS
    };

    let callCount = 0;
    SystemConfig.findOne = () => ({
      lean: async () => initialDoc
    });

    SystemConfig.findOneAndUpdate = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ...initialDoc,
          scenarioAssumptions: { efficiencyFactor: 0.50, costPerFteLakhs: 10 },
          toObject: () => initialDoc
        };
      } else {
        throw new Error('Database disconnected during rollback attempt');
      }
    };

    auditLogger.logAction = async () => ({
      success: false,
      error: 'Audit service timeout'
    });

    let statusCode = null;
    let jsonResponse = null;
    const mockReq = {
      user: { userId: 'admin-001', role: 'admin' },
      body: { scenarioAssumptions: { efficiencyFactor: 0.50 } }
    };
    const mockRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    try {
      await configController.updateAssumptions(mockReq, mockRes);
      assert.strictEqual(statusCode, 500);
      assert.strictEqual(jsonResponse.rolledBack, false, 'Must report rolledBack: false when rollback threw error');
      assert.ok(jsonResponse.message.includes('compensating rollback encountered an error'));
    } finally {
      SystemConfig.findOne = origFindOne;
      SystemConfig.findOneAndUpdate = origFindOneAndUpdate;
      auditLogger.logAction = origLogAction;
    }
  });

  console.log(`\nAll ${passed}/${total} Stage 2.5 Correction Pass Tests Passed Successfully!`);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
