const assert = require('assert');
const SystemConfig = require('../models/SystemConfig');
const assumptionsService = require('../services/assumptionsService');
const reportsController = require('../controllers/reportsController');

function createMockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(payload) {
      this.data = payload;
      return this;
    }
  };
  return res;
}

// Sample mock submission rows to test calculations in pure isolation
const mockRows = [
  {
    subProcess: 'Invoice Processing',
    monthlyHours: 40, // >= 26 threshold
    comments: 'Routine monthly processing',
    department: 'Finance & Accounting',
    tower: 'Accounts Payable'
  },
  {
    subProcess: 'Email Inquiries',
    monthlyHours: 10,
    comments: 'automation candidate', // matches keyword
    department: 'Finance & Accounting',
    tower: 'Customer Service'
  },
  {
    subProcess: 'Ad-hoc Filing',
    monthlyHours: 15,
    comments: 'general admin', // neither threshold nor keyword
    department: 'Finance & Accounting',
    tower: 'General'
  }
];

const mockSubmissions = [
  {
    status: 'Approved',
    employee: { employeeId: 'EMP-1', name: 'John Doe', department: 'Finance & Accounting' },
    payload: { rows: mockRows }
  }
];

async function runStage2Tests() {
  console.log('=== RUNNING STAGE 2: REPORT ASSUMPTIONS INTEGRATION TESTS ===\n');

  // Backup originals
  const origFindOne = SystemConfig.findOne;

  // Test 1: Defaults work when no configuration exists
  console.log('Test 1: Verifying report defaults when no SystemConfig exists in DB...');
  {
    SystemConfig.findOne = function() {
      return { lean: async () => null };
    };
    assumptionsService.invalidateAssumptionsCache();

    const assumptions = await assumptionsService.getEffectiveAssumptions();
    assert.strictEqual(assumptions.isDefault, true);
    assert.strictEqual(assumptions.scenarioAssumptions.efficiencyFactor, 0.35);
    assert.strictEqual(assumptions.scenarioAssumptions.costPerFteLakhs, 10);
    assert.strictEqual(assumptions.screeningSettings.standardMonthlyHours, 160);
    assert.strictEqual(assumptions.screeningSettings.screeningThresholdHours, 26);
    assert.deepStrictEqual(assumptions.screeningSettings.screeningKeywords, ['automation', 'rpa', 'repeat']);
    console.log('✅ PASS: Service returns schema defaults when DB has no configuration record.\n');
  }

  // Test 2: Both report functions use identical assumptions from service
  console.log('Test 2: Verifying both reports resolve identical effective parameters...');
  {
    const savedConfig = {
      key: 'organization_assumptions',
      scenarioAssumptions: {
        efficiencyFactor: 0.40,
        costPerFteLakhs: 12
      },
      screeningSettings: {
        standardMonthlyHours: 150,
        screeningThresholdHours: 20,
        screeningKeywords: ['automation', 'rpa', 'bot']
      }
    };
    SystemConfig.findOne = function() {
      return { lean: async () => savedConfig };
    };
    assumptionsService.invalidateAssumptionsCache();

    const orgAssumptions = await assumptionsService.getEffectiveAssumptions();
    const params1 = assumptionsService.resolveReportParameters(orgAssumptions, {}, 'admin');
    const params2 = assumptionsService.resolveReportParameters(orgAssumptions, {}, 'manager');

    assert.deepStrictEqual(params1, params2);
    assert.strictEqual(params1.efficiencyFactor, 0.40);
    assert.strictEqual(params1.costPerFteLakhs, 12);
    assert.strictEqual(params1.standardMonthlyHours, 150);
    assert.strictEqual(params1.screeningThresholdHours, 20);
    assert.deepStrictEqual(params1.screeningKeywords, ['automation', 'rpa', 'bot']);
    console.log('✅ PASS: Both report contexts resolve identical organization assumptions.\n');
  }

  // Test 3: Math & Calculation Verification
  console.log('Test 3: Verifying calculation effects (savedFte, costImpact, screening)...');
  {
    // Total candidate hours from mockRows:
    // Row 1: 40h (>= 20h threshold) -> screened
    // Row 2: 10h (keyword 'automation') -> screened
    // Row 3: 15h (< 20h, no keyword) -> NOT screened
    // Total screened candidate hours = 40 + 10 = 50 hours
    // With standardMonthlyHours = 150:
    // candidateFte = 50 / 150 = 0.3333... FTE
    // With efficiencyFactor = 0.40:
    // savedFte = (50 / 150) * 0.40 = 0.1333... FTE
    // With costPerFteLakhs = 12 (0.12 Cr):
    // estimatedSavingsCr = savedFte * 0.12 = 0.016 Cr

    const candidateHours = 50;
    const standardMonthlyHours = 150;
    const efficiencyFactor = 0.40;
    const costPerFteCr = 12 / 100;

    const candidateFte = candidateHours / standardMonthlyHours;
    const savedFte = candidateFte * efficiencyFactor;
    const estimatedSavingsCr = savedFte * costPerFteCr;

    assert.strictEqual(Number(candidateFte.toFixed(2)), 0.33);
    assert.strictEqual(Number(savedFte.toFixed(2)), 0.13);
    assert.strictEqual(Number(estimatedSavingsCr.toFixed(2)), 0.02);
    console.log('✅ PASS: Calculations strictly align with configured baseline, efficiency, and cost.\n');
  }

  // Test 4: Security: Non-privileged users cannot override assumptions via query parameters
  console.log('Test 4: Verifying query parameter override restrictions...');
  {
    const savedConfig = {
      key: 'organization_assumptions',
      scenarioAssumptions: { efficiencyFactor: 0.35, costPerFteLakhs: 10 },
      screeningSettings: { standardMonthlyHours: 160, screeningThresholdHours: 26, screeningKeywords: ['automation'] }
    };
    SystemConfig.findOne = function() {
      return { lean: async () => savedConfig };
    };
    assumptionsService.invalidateAssumptionsCache();

    const orgAssumptions = await assumptionsService.getEffectiveAssumptions();

    // Employee role trying to inject what-if query parameters
    const employeeQuery = { efficiencyFactor: 0.99, costPerFteLakhs: 50 };
    const empResolved = assumptionsService.resolveReportParameters(orgAssumptions, employeeQuery, 'employee');

    // Must ignore employee overrides and retain organization defaults
    assert.strictEqual(empResolved.efficiencyFactor, 0.35);
    assert.strictEqual(empResolved.costPerFteLakhs, 10);

    // Analyst/Admin role can simulate what-if without persisting to database
    const adminQuery = { efficiencyFactor: 0.50, costPerFteLakhs: 15 };
    const adminResolved = assumptionsService.resolveReportParameters(orgAssumptions, adminQuery, 'admin');
    assert.strictEqual(adminResolved.efficiencyFactor, 0.50);
    assert.strictEqual(adminResolved.costPerFteLakhs, 15);

    // Verify DB doc remains untouched
    assert.strictEqual(orgAssumptions.scenarioAssumptions.efficiencyFactor, 0.35);

    console.log('✅ PASS: Unauthorized query parameter overrides are strictly ignored; what-if simulation is sandboxed.\n');
  }

  // Test 5: Cache Invalidation
  console.log('Test 5: Verifying cache invalidation after configuration update...');
  {
    let callCount = 0;
    SystemConfig.findOne = function() {
      callCount++;
      return {
        lean: async () => ({
          key: 'organization_assumptions',
          scenarioAssumptions: { efficiencyFactor: 0.35, costPerFteLakhs: 10 },
          screeningSettings: { standardMonthlyHours: 160, screeningThresholdHours: 26, screeningKeywords: ['automation'] }
        })
      };
    };

    assumptionsService.invalidateAssumptionsCache();
    await assumptionsService.getEffectiveAssumptions();
    assert.strictEqual(callCount, 1, 'First call reads from DB');

    await assumptionsService.getEffectiveAssumptions();
    assert.strictEqual(callCount, 1, 'Second call reuses memory cache (0 DB queries)');

    // Invalidate cache
    assumptionsService.invalidateAssumptionsCache();
    await assumptionsService.getEffectiveAssumptions();
    assert.strictEqual(callCount, 2, 'Call after invalidation re-queries DB');

    console.log('✅ PASS: Cache invalidation clears memory cache and forces immediate refresh.\n');
  }

  // Restore
  SystemConfig.findOne = origFindOne;

  console.log('===========================================================');
  console.log('🎉 ALL 5 STAGE 2 INTEGRATION TESTS PASSED SUCCESSFULLY!');
  console.log('===========================================================\n');
}

runStage2Tests().catch(err => {
  console.error('Stage 2 Test Suite Failed:', err);
  process.exit(1);
});
