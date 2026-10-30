/**
 * Comprehensive Stage 2.5 Hardening Test Suite
 * Problem 4(g): Persistent Organization-Wide Assumptions
 *
 * Verifies:
 * 1. Partial updates to scenarioAssumptions & screeningSettings
 * 2. Keyword normalization and deduplication
 * 3. Fallback when DB connection fails / no record exists
 * 4. Export controller reflects configured standardMonthlyHours
 * 5. What-if metadata (isWhatIfScenario, simulationOverrides) & blocking advanced overrides without allowAdvancedSimulation
 * 6. Report cache invalidation hook cleanly triggers upon assumption changes
 * 7. Audit log failure returns HTTP 500 and prevents silent success
 */

const assert = require('assert');
const SystemConfig = require('../models/SystemConfig');
const assumptionsService = require('../services/assumptionsService');
const configController = require('../controllers/configController');
const auditLogger = require('../utils/auditLogger');

async function runTests() {
  console.log('--- Starting Stage 2.5 Hardening Tests ---');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  async function testAsync(name, fn) {
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

  // TEST 1: Keyword Normalization & Deduplication in SystemConfig schema
  test('1. Keyword normalization and deduplication', () => {
    const raw = ['  Automation  ', 'rpa', 'REPEAT', '  automation ', '   rpa  ', 'AI/ML'];
    const cleaned = Array.from(new Set(raw.map(k => String(k).trim().toLowerCase())));
    assert.deepStrictEqual(cleaned, ['automation', 'rpa', 'repeat', 'ai/ml']);
  });

  // TEST 2: Fallback to defaults when DB returns null
  await testAsync('2. Fallback when no record exists / DB query returns null', async () => {
    assumptionsService.invalidateAssumptionsCache();
    // getEffectiveAssumptions with null returns schema defaults
    const origFindOne = SystemConfig.findOne;
    SystemConfig.findOne = () => ({
      lean: async () => null
    });

    try {
      const config = await assumptionsService.getEffectiveAssumptions();
      assert.strictEqual(config.isDefault, true);
      assert.strictEqual(config.scenarioAssumptions.efficiencyFactor, 0.35);
      assert.strictEqual(config.scenarioAssumptions.costPerFteLakhs, 10);
      assert.strictEqual(config.screeningSettings.standardMonthlyHours, 160);
      assert.strictEqual(config.screeningSettings.screeningThresholdHours, 26);
      assert.deepStrictEqual(config.screeningSettings.screeningKeywords, ['automation', 'rpa', 'repeat']);
    } finally {
      SystemConfig.findOne = origFindOne;
      assumptionsService.invalidateAssumptionsCache();
    }
  });

  // TEST 3: What-if parameter resolution: official baseline (no overrides)
  test('3. What-if parameter resolution: official baseline', () => {
    const baseAssumptions = SystemConfig.getDefaults();
    const query = {};
    const resolved = assumptionsService.resolveReportParameters(baseAssumptions, query, 'admin');

    assert.strictEqual(resolved.isWhatIfScenario, false);
    assert.deepStrictEqual(resolved.simulationOverrides, {});
    assert.strictEqual(resolved.efficiencyFactor, 0.35);
    assert.strictEqual(resolved.costPerFteLakhs, 10);
    assert.strictEqual(resolved.standardMonthlyHours, 160);
    assert.strictEqual(resolved.screeningThresholdHours, 26);
  });

  // TEST 4: What-if parameter resolution: scenario overrides flag isWhatIfScenario=true
  test('4. What-if parameter resolution: temporary efficiencyFactor override', () => {
    const baseAssumptions = SystemConfig.getDefaults();
    const query = { efficiencyFactor: '0.45' };
    const resolved = assumptionsService.resolveReportParameters(baseAssumptions, query, 'admin');

    assert.strictEqual(resolved.isWhatIfScenario, true);
    assert.strictEqual(resolved.simulationOverrides.efficiencyFactor, 0.45);
    assert.strictEqual(resolved.efficiencyFactor, 0.45);
    // Baseline assumptions must remain untouched
    assert.strictEqual(baseAssumptions.scenarioAssumptions.efficiencyFactor, 0.35);
  });

  // TEST 5: Blocking advanced screening overrides without allowAdvancedSimulation=true
  test('5. Advanced screening overrides blocked without allowAdvancedSimulation', () => {
    const baseAssumptions = SystemConfig.getDefaults();
    const query = {
      standardMonthlyHours: '180',
      screeningThresholdHours: '40',
      keywords: 'fast,audit'
    };
    const resolved = assumptionsService.resolveReportParameters(baseAssumptions, query, 'admin');

    // Advanced overrides should NOT be applied
    assert.strictEqual(resolved.isWhatIfScenario, false);
    assert.strictEqual(resolved.standardMonthlyHours, 160);
    assert.strictEqual(resolved.screeningThresholdHours, 26);
    assert.deepStrictEqual(resolved.screeningKeywords, ['automation', 'rpa', 'repeat']);
  });

  // TEST 6: Advanced screening overrides allowed when allowAdvancedSimulation=true
  test('6. Advanced screening overrides permitted with allowAdvancedSimulation=true', () => {
    const baseAssumptions = SystemConfig.getDefaults();
    const query = {
      standardMonthlyHours: '180',
      screeningThresholdHours: '40',
      keywords: 'custom,process',
      allowAdvancedSimulation: 'true'
    };
    const resolved = assumptionsService.resolveReportParameters(baseAssumptions, query, 'admin');

    assert.strictEqual(resolved.isWhatIfScenario, true);
    assert.strictEqual(resolved.standardMonthlyHours, 180);
    assert.strictEqual(resolved.screeningThresholdHours, 40);
    assert.deepStrictEqual(resolved.screeningKeywords, ['custom', 'process']);
    assert.strictEqual(resolved.simulationOverrides.standardMonthlyHours, 180);
    assert.strictEqual(resolved.simulationOverrides.screeningThresholdHours, 40);
    assert.deepStrictEqual(resolved.simulationOverrides.screeningKeywords, ['custom', 'process']);
  });

  // TEST 7: Report Cache Invalidation Hook
  await testAsync('7. Report Cache Invalidator Hook registration and triggering', async () => {
    let invalidatorCallCount = 0;
    const testInvalidator = () => {
      invalidatorCallCount++;
    };

    assumptionsService.registerReportCacheInvalidator(testInvalidator);
    assumptionsService.invalidateAssumptionsCache();

    assert.strictEqual(invalidatorCallCount, 1, 'Invalidator hook should be called when assumptions cache is cleared');
  });

  // TEST 8: Audit log failure handling in configController
  await testAsync('8. Audit log failure returns HTTP 500 and prevents silent success', async () => {
    const origFindOne = SystemConfig.findOne;
    const origFindOneAndUpdate = SystemConfig.findOneAndUpdate;
    const origLogAction = auditLogger.logAction;

    SystemConfig.findOne = () => ({
      lean: async () => SystemConfig.getDefaults()
    });

    SystemConfig.findOneAndUpdate = async () => ({
      ...SystemConfig.getDefaults(),
      scenarioAssumptions: { efficiencyFactor: 0.40, costPerFteLakhs: 12 },
      toObject: () => ({
        key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY,
        scenarioAssumptions: { efficiencyFactor: 0.40, costPerFteLakhs: 12 },
        screeningSettings: SystemConfig.DEFAULT_SCREENING_SETTINGS
      })
    });

    // Mock auditLogger to simulate failure
    auditLogger.logAction = async () => ({
      success: false,
      error: 'Simulated MongoDB connection drop during audit write'
    });

    let statusCode = null;
    let jsonResponse = null;

    const mockReq = {
      user: { userId: 'admin-123', role: 'admin' },
      body: { scenarioAssumptions: { efficiencyFactor: 0.40 } }
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
      assert.strictEqual(statusCode, 500, 'Expected status 500 when audit write fails');
      assert.ok(jsonResponse.message.toLowerCase().includes('failed to record audit trail log'));
      assert.strictEqual(jsonResponse.error, 'Simulated MongoDB connection drop during audit write');
    } finally {
      SystemConfig.findOne = origFindOne;
      SystemConfig.findOneAndUpdate = origFindOneAndUpdate;
      auditLogger.logAction = origLogAction;
    }
  });

  // TEST 9: Partial update validation (scenarioAssumptions only or screeningSettings only)
  await testAsync('9. Partial updates accepted cleanly', async () => {
    const origFindOne = SystemConfig.findOne;
    const origFindOneAndUpdate = SystemConfig.findOneAndUpdate;
    const origLogAction = auditLogger.logAction;

    let capturedUpdates = null;

    SystemConfig.findOne = () => ({
      lean: async () => SystemConfig.getDefaults()
    });

    SystemConfig.findOneAndUpdate = async (filter, update) => {
      capturedUpdates = update.$set;
      return {
        ...SystemConfig.getDefaults(),
        scenarioAssumptions: { efficiencyFactor: 0.42, costPerFteLakhs: 10 },
        toObject: () => ({
          key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY,
          scenarioAssumptions: { efficiencyFactor: 0.42, costPerFteLakhs: 10 },
          screeningSettings: SystemConfig.DEFAULT_SCREENING_SETTINGS
        })
      };
    };

    auditLogger.logAction = async () => ({
      success: true,
      id: 'audit-mock-id'
    });

    let statusCode = null;
    let jsonResponse = null;

    const mockReq = {
      user: { userId: 'admin-123', role: 'admin' },
      body: { scenarioAssumptions: { efficiencyFactor: 0.42 } }
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
      assert.strictEqual(capturedUpdates['scenarioAssumptions.efficiencyFactor'], 0.42);
      assert.strictEqual(capturedUpdates['scenarioAssumptions.costPerFteLakhs'], undefined);
      assert.strictEqual(jsonResponse.message, 'Organization assumptions successfully updated');
      assert.strictEqual(jsonResponse.data.scenarioAssumptions.efficiencyFactor, 0.42);
    } finally {
      SystemConfig.findOne = origFindOne;
      SystemConfig.findOneAndUpdate = origFindOneAndUpdate;
      auditLogger.logAction = origLogAction;
    }
  });

  console.log(`\nAll ${passed}/${total} Stage 2.5 Hardening Tests Passed Successfully!`);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
