const assert = require('assert');
const mongoose = require('mongoose');
const SystemConfig = require('../models/SystemConfig');
const configController = require('../controllers/configController');
const requireRoles = require('../middleware/roleAccess');

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

async function runStage1Tests() {
  console.log('=== RUNNING STAGE 1: SYSTEMCONFIG & ASSUMPTIONS API TESTS ===\n');

  // Test 1: Defaults returned without creating DB records
  console.log('Test 1: Verifying default return when no configuration exists in DB...');
  {
    const origFindOne = SystemConfig.findOne;
    SystemConfig.findOne = function() {
      return {
        lean: async () => null
      };
    };

    const req = { user: { role: 'admin', userId: '507f1f77bcf86cd799439011' } };
    const res = createMockRes();
    await configController.getAssumptions(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.key, 'organization_assumptions');
    assert.strictEqual(res.data.isDefault, true);
    assert.strictEqual(res.data.scenarioAssumptions.efficiencyFactor, 0.35);
    assert.strictEqual(res.data.scenarioAssumptions.costPerFteLakhs, 10);
    assert.strictEqual(res.data.screeningSettings.standardMonthlyHours, 160);
    assert.strictEqual(res.data.screeningSettings.screeningThresholdHours, 26);
    assert.deepStrictEqual(res.data.screeningSettings.screeningKeywords, ['automation', 'rpa', 'repeat']);

    SystemConfig.findOne = origFindOne;
    console.log('✅ PASS: Defaults cleanly returned when no database record exists.\n');
  }

  // Test 2: Role Authorization Checks
  console.log('Test 2: Verifying role-based access control (Admin, Manager, Employee)...');
  {
    // GET endpoint requires ['admin', 'manager']
    const getMiddleware = requireRoles(['admin', 'manager']);
    const putMiddleware = requireRoles(['admin']);

    // Admin can GET and PUT
    let nextCalled = false;
    getMiddleware({ user: { role: 'admin' } }, createMockRes(), () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Admin must pass GET authorization');

    nextCalled = false;
    putMiddleware({ user: { role: 'admin' } }, createMockRes(), () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Admin must pass PUT authorization');

    // Manager can GET but CANNOT PUT
    nextCalled = false;
    getMiddleware({ user: { role: 'manager' } }, createMockRes(), () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Manager must pass GET authorization');

    const resManagerPut = createMockRes();
    nextCalled = false;
    putMiddleware({ user: { role: 'manager' } }, resManagerPut, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, 'Manager must NOT pass PUT authorization');
    assert.strictEqual(resManagerPut.statusCode, 403, 'Manager PUT must return HTTP 403');

    // Employee CANNOT GET and CANNOT PUT
    const resEmpGet = createMockRes();
    nextCalled = false;
    getMiddleware({ user: { role: 'employee' } }, resEmpGet, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, 'Employee must NOT pass GET authorization');
    assert.strictEqual(resEmpGet.statusCode, 403, 'Employee GET must return HTTP 403');

    const resEmpPut = createMockRes();
    nextCalled = false;
    putMiddleware({ user: { role: 'employee' } }, resEmpPut, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, 'Employee must NOT pass PUT authorization');
    assert.strictEqual(resEmpPut.statusCode, 403, 'Employee PUT must return HTTP 403');

    console.log('✅ PASS: Role authorization correctly restricts PUT to admin and GET to admin/manager.\n');
  }

  // Test 3: Validation of Invalid Values
  console.log('Test 3: Verifying server-side rejection of malformed or out-of-range values...');
  {
    const reqBase = { user: { role: 'admin', userId: '507f1f77bcf86cd799439011' } };

    // Efficiency Factor < 0
    let res = createMockRes();
    await configController.updateAssumptions({ ...reqBase, body: { scenarioAssumptions: { efficiencyFactor: -0.1 } } }, res);
    assert.strictEqual(res.statusCode, 400);

    // Efficiency Factor > 1
    res = createMockRes();
    await configController.updateAssumptions({ ...reqBase, body: { scenarioAssumptions: { efficiencyFactor: 1.5 } } }, res);
    assert.strictEqual(res.statusCode, 400);

    // Non-finite value
    res = createMockRes();
    await configController.updateAssumptions({ ...reqBase, body: { scenarioAssumptions: { costPerFteLakhs: 'NaN' } } }, res);
    assert.strictEqual(res.statusCode, 400);

    // standardMonthlyHours out of range (0 or > 744)
    res = createMockRes();
    await configController.updateAssumptions({ ...reqBase, body: { screeningSettings: { standardMonthlyHours: 0 } } }, res);
    assert.strictEqual(res.statusCode, 400);

    // screeningKeywords must be non-empty array of strings
    res = createMockRes();
    await configController.updateAssumptions({ ...reqBase, body: { screeningSettings: { screeningKeywords: [] } } }, res);
    assert.strictEqual(res.statusCode, 400);

    res = createMockRes();
    await configController.updateAssumptions({ ...reqBase, body: { screeningSettings: { screeningKeywords: ['valid', '   ', ''] } } }, res);
    assert.strictEqual(res.statusCode, 400);

    console.log('✅ PASS: Malformed, negative, out-of-range, and empty keywords are strictly rejected with 400.\n');
  }

  // Test 4: Successful Update and Audit Logging
  console.log('Test 4: Verifying successful update, atomic $set, and audit logging...');
  {
    let capturedUpsert = null;
    let capturedAudit = null;

    const origFindOneAndUpdate = SystemConfig.findOneAndUpdate;
    const origFindOne = SystemConfig.findOne;
    const auditLogger = require('../utils/auditLogger');
    const origLogAction = auditLogger.logAction;

    SystemConfig.findOne = function() {
      return {
        lean: async () => null // initial snapshot is default
      };
    };

    SystemConfig.findOneAndUpdate = async function(query, update, options) {
      capturedUpsert = { query, update, options };
      return {
        key: 'organization_assumptions',
        scenarioAssumptions: {
          efficiencyFactor: 0.40,
          costPerFteLakhs: 12
        },
        screeningSettings: {
          standardMonthlyHours: 160,
          screeningThresholdHours: 30,
          screeningKeywords: ['automation', 'rpa', 'batch']
        },
        updatedAt: new Date(),
        updatedBy: '507f1f77bcf86cd799439011'
      };
    };

    auditLogger.logAction = async function(params) {
      capturedAudit = params;
      return { success: true, logId: 'mock-log-id' };
    };

    const req = {
      user: { role: 'admin', userId: '507f1f77bcf86cd799439011' },
      body: {
        scenarioAssumptions: {
          efficiencyFactor: 0.40,
          costPerFteLakhs: 12
        },
        screeningSettings: {
          screeningThresholdHours: 30,
          screeningKeywords: ['Automation', 'RPA', 'Batch ']
        }
      }
    };
    const res = createMockRes();
    await configController.updateAssumptions(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.data.scenarioAssumptions.efficiencyFactor, 0.40);
    assert.strictEqual(res.data.data.scenarioAssumptions.costPerFteLakhs, 12);
    assert.strictEqual(res.data.data.screeningSettings.screeningThresholdHours, 30);
    assert.deepStrictEqual(res.data.data.screeningSettings.screeningKeywords, ['automation', 'rpa', 'batch']);

    // Check atomic update query
    assert.strictEqual(capturedUpsert.query.key, 'organization_assumptions');
    assert.strictEqual(capturedUpsert.options.upsert, true);
    assert.strictEqual(capturedUpsert.options.new, true);
    assert.strictEqual(capturedUpsert.update.$set['scenarioAssumptions.efficiencyFactor'], 0.40);

    // Check audit logger invocation
    assert.ok(capturedAudit, 'logAction must be called');
    assert.strictEqual(capturedAudit.action, 'UPDATE_ORGANIZATION_ASSUMPTIONS');
    assert.strictEqual(capturedAudit.targetType, 'SystemConfig');
    assert.strictEqual(capturedAudit.targetId, 'organization_assumptions');
    assert.strictEqual(capturedAudit.prev.isDefault, true);
    assert.strictEqual(capturedAudit.next.scenarioAssumptions.efficiencyFactor, 0.40);

    // Restore mocks
    SystemConfig.findOneAndUpdate = origFindOneAndUpdate;
    SystemConfig.findOne = origFindOne;
    auditLogger.logAction = origLogAction;

    console.log('✅ PASS: Atomic update, keyword normalization, and audit logging successfully verified.\n');
  }

  // Test 5: Failure Handling (No success reported on error)
  console.log('Test 5: Verifying failure handling if database write fails...');
  {
    const origFindOneAndUpdate = SystemConfig.findOneAndUpdate;
    SystemConfig.findOneAndUpdate = async function() {
      throw new Error('Database connection failed');
    };

    const req = {
      user: { role: 'admin', userId: '507f1f77bcf86cd799439011' },
      body: { scenarioAssumptions: { efficiencyFactor: 0.40 } }
    };
    const res = createMockRes();
    await configController.updateAssumptions(req, res);

    assert.strictEqual(res.statusCode, 500);
    assert.ok(res.data.message.includes('Failed to update'));

    SystemConfig.findOneAndUpdate = origFindOneAndUpdate;
    console.log('✅ PASS: Database write failures cleanly return 500 and never report false success.\n');
  }

  console.log('====================================================');
  console.log('🎉 ALL 5 STAGE 1 BACKEND CONFIGURATION TESTS PASSED!');
  console.log('====================================================\n');
}

runStage1Tests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
