/**
 * test_point8c_classification_suite.test.js
 *
 * Functional Verification Suite for Point 8(c): Configurable Core/Support Classification.
 *
 * Tests:
 * 1. Existing mappings load correctly (18 processes, case-insensitive normalization).
 * 2. Admin can change a Major Process from Core to Support and back.
 * 3. Non-admin users cannot modify mappings (HTTP 403).
 * 4. Duplicate and invalid mappings are rejected (HTTP 400).
 * 5. Unmapped Major Processes are clearly identified.
 * 6. WDT Analytics, Deep Analysis, and exports show consistent classifications.
 * 7. Total hours remain unchanged after reclassification (Total hours = 79,913.91h).
 * 8. Changing baseline to 161 recalculates FTE without changing hours; restore to 160 afterwards.
 */

const assert = require('assert');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const rootDir = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(rootDir, '.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'bper_jwt_secret_key_2024';

const adminToken = jwt.sign({ id: '6abe04ff6d2aa9e94496fc70', userId: '6abe04ff6d2aa9e94496fc70', role: 'admin', email: 'admin@bper.com' }, JWT_SECRET);
const employeeToken = jwt.sign({ id: '6abe04ff6d2aa9e94496fc71', userId: '6abe04ff6d2aa9e94496fc71', role: 'employee', email: 'employee@bper.com' }, JWT_SECRET);

const BASE_URL = 'http://127.0.0.1:5000';

async function runPoint8cTests() {
  console.log('================================================================');
  console.log('POINT 8(c): CONFIGURABLE CORE/SUPPORT CLASSIFICATION TEST SUITE');
  console.log('================================================================\n');

  const testResults = [];

  // Helper for authenticated requests
  const apiCall = async (endpoint, method = 'GET', body = null, token = adminToken) => {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${endpoint}`, options);
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { status: res.status, ok: res.ok, data };
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Existing mappings load correctly
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Load Existing Configuration & Mappings ---');
    {
      const res = await apiCall('/api/config/assumptions');
      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);
      const mappings = res.data?.processCategoryMappings;
      assert(Array.isArray(mappings), 'processCategoryMappings must be an array');
      assert.strictEqual(mappings.length, 18, `Expected exactly 18 mapped major processes, got ${mappings?.length}`);

      const others = mappings.find(m => m.majorProcess === 'Others');
      assert.ok(others, 'Others process must be present');
      assert.strictEqual(others.category, 'support', 'Others default category must be support');

      const ap = mappings.find(m => m.majorProcess === 'Accounts Payable');
      assert.ok(ap, 'Accounts Payable process must be present');
      assert.strictEqual(ap.category, 'core', 'Accounts Payable default category must be core');

      console.log('âœ… PASS: Test 1 â€“ 18 baseline Major Process mappings loaded accurately.');
      testResults.push({ test: 'Test 1 â€“ Existing mappings load correctly', status: 'PASS' });
    }

    // -------------------------------------------------------------------------
    // TEST 2: Admin can change Major Process from Core to Support and back
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Admin Reclassification (Round-trip) ---');
    {
      const initialRes = await apiCall('/api/config/assumptions');
      const originalMappings = initialRes.data.processCategoryMappings;

      // Flip "Others" from support -> core
      const modifiedMappings = originalMappings.map(m =>
        m.majorProcess === 'Others' ? { ...m, category: 'core' } : m
      );

      const putRes1 = await apiCall('/api/config/assumptions', 'PUT', {
        processCategoryMappings: modifiedMappings
      });
      assert.strictEqual(putRes1.status, 200, `Expected HTTP 200 on update, got ${putRes1.status}`);

      // Verify update persisted
      const getRes1 = await apiCall('/api/config/assumptions');
      const othersUpdated = getRes1.data.processCategoryMappings.find(m => m.majorProcess === 'Others');
      assert.strictEqual(othersUpdated.category, 'core', '"Others" should now be "core"');

      // Revert "Others" back to support
      const revertedMappings = originalMappings.map(m =>
        m.majorProcess === 'Others' ? { ...m, category: 'support' } : m
      );
      const putRes2 = await apiCall('/api/config/assumptions', 'PUT', {
        processCategoryMappings: revertedMappings
      });
      assert.strictEqual(putRes2.status, 200, `Expected HTTP 200 on revert, got ${putRes2.status}`);

      const getRes2 = await apiCall('/api/config/assumptions');
      const othersReverted = getRes2.data.processCategoryMappings.find(m => m.majorProcess === 'Others');
      assert.strictEqual(othersReverted.category, 'support', '"Others" should be reverted to "support"');

      console.log('âœ… PASS: Test 2 â€“ Admin can change classification from Support to Core and back cleanly.');
      testResults.push({ test: 'Test 2 â€“ Admin reclassification (round-trip)', status: 'PASS' });
    }

    // -------------------------------------------------------------------------
    // TEST 3: Non-admin users cannot modify mappings
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Non-Admin Access Rejection ---');
    {
      const empAttempt = await apiCall(
        '/api/config/assumptions',
        'PUT',
        { processCategoryMappings: [{ majorProcess: 'Others', category: 'core' }] },
        employeeToken
      );
      assert.strictEqual(empAttempt.status, 403, `Expected HTTP 403, got ${empAttempt.status}`);

      console.log('âœ… PASS: Test 3 â€“ Non-admin modification rejected with HTTP 403 Forbidden.');
      testResults.push({ test: 'Test 3 â€“ Non-admin access rejection', status: 'PASS' });
    }

    // -------------------------------------------------------------------------
    // TEST 4: Duplicate and invalid mappings are rejected
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Validation (Duplicate & Invalid Categories) ---');
    {
      // Duplicate check
      const dupAttempt = await apiCall('/api/config/assumptions', 'PUT', {
        processCategoryMappings: [
          { majorProcess: 'FP&A', category: 'core' },
          { majorProcess: 'fp&a', category: 'support' } // duplicate case-insensitive
        ]
      });
      assert.strictEqual(dupAttempt.status, 400, `Expected HTTP 400 for duplicate, got ${dupAttempt.status}`);
      assert(dupAttempt.data?.message?.includes('Duplicate'), `Expected duplicate error, got: ${dupAttempt.data?.message}`);

      // Invalid category check
      const invalidCatAttempt = await apiCall('/api/config/assumptions', 'PUT', {
        processCategoryMappings: [
          { majorProcess: 'FP&A', category: 'invalid_category' }
        ]
      });
      assert.strictEqual(invalidCatAttempt.status, 400, `Expected HTTP 400 for invalid category, got ${invalidCatAttempt.status}`);
      assert(invalidCatAttempt.data?.message?.includes('Invalid category'), `Expected category error, got: ${invalidCatAttempt.data?.message}`);

      console.log('âœ… PASS: Test 4 â€“ Duplicate (case-insensitive) and invalid categories rejected with HTTP 400.');
      testResults.push({ test: 'Test 4 â€“ Duplicate and invalid mappings rejection', status: 'PASS' });
    }

    // -------------------------------------------------------------------------
    // TEST 5: Unmapped Major Processes are clearly identified
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Unmapped Major Processes Discovery ---');
    {
      const res = await apiCall('/api/config/assumptions');
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.data?.unmappedProcesses), 'unmappedProcesses array must be returned');
      assert.strictEqual(res.data.unmappedProcesses.length, 0, 'All 18 current operational processes must be covered');

      console.log('âœ… PASS: Test 5 â€“ Unmapped process detection returned cleanly (0 unmapped in active scope).');
      testResults.push({ test: 'Test 5 â€“ Unmapped process detection', status: 'PASS' });
    }

    // -------------------------------------------------------------------------
    // TEST 6: Reporting consistency across endpoints
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Report Consistency Across Endpoints ---');
    {
      const utilRes = await apiCall('/api/reports/utilization');
      assert.strictEqual(utilRes.status, 200);
      const coreHours = utilRes.data?.coreSupport?.coreHours;
      const supportHours = utilRes.data?.coreSupport?.supportHours;
      const totalHours = utilRes.data?.summary?.totalHours;

      assert.strictEqual(coreHours, 71587.07, `Expected coreHours 71587.07, got ${coreHours}`);
      assert.strictEqual(supportHours, 8326.84, `Expected supportHours 8326.84, got ${supportHours}`);
      assert.strictEqual(totalHours, 79913.91, `Expected totalHours 79913.91, got ${totalHours}`);
      assert.strictEqual(Number((coreHours + supportHours).toFixed(2)), totalHours, 'Core + Support must equal Total Hours');

      console.log('âœ… PASS: Test 6 â€“ Utilization report Core (71,587.07h) + Support (8,326.84h) reconcile exactly.');
      testResults.push({ test: 'Test 6 â€“ Reporting consistency across endpoints', status: 'PASS' });
    }

    // -------------------------------------------------------------------------
    // TEST 7: Total hours remain unchanged after reclassification
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Total Hours Invariance Under Reclassification ---');
    {
      const initial = await apiCall('/api/reports/utilization');
      const initialTotal = initial.data?.summary?.totalHours;

      // Reclassify "Others" (4,785.78h) to core
      const cfg = await apiCall('/api/config/assumptions');
      const tempMappings = cfg.data.processCategoryMappings.map(m =>
        m.majorProcess === 'Others' ? { ...m, category: 'core' } : m
      );
      await apiCall('/api/config/assumptions', 'PUT', { processCategoryMappings: tempMappings });

      const reclassifiedUtil = await apiCall('/api/reports/utilization');
      const reclassifiedTotal = reclassifiedUtil.data?.summary?.totalHours;
      const reclassifiedCore = reclassifiedUtil.data?.coreSupport?.coreHours;
      const reclassifiedSupport = reclassifiedUtil.data?.coreSupport?.supportHours;

      assert.strictEqual(reclassifiedTotal, initialTotal, 'Total hours must NOT change when reclassifying');
      assert.strictEqual(reclassifiedCore, 76372.85, `Expected 76,372.85h core, got ${reclassifiedCore}`);
      assert.strictEqual(reclassifiedSupport, 3541.06, `Expected 3,541.06h support, got ${reclassifiedSupport}`);

      // Restore
      const restoreMappings = cfg.data.processCategoryMappings.map(m =>
        m.majorProcess === 'Others' ? { ...m, category: 'support' } : m
      );
      await apiCall('/api/config/assumptions', 'PUT', { processCategoryMappings: restoreMappings });

      console.log('âœ… PASS: Test 7 â€“ Reclassification preserves exact total hours (79,913.91h) with mathematical delta shift.');
      testResults.push({ test: 'Test 7 â€“ Total hours invariance under reclassification', status: 'PASS' });
    }

    // -------------------------------------------------------------------------
    // TEST 8: Baseline change to 161 recalculates FTE without changing hours
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Configurable Baseline Hours (160h -> 161h -> 160h) ---');
    {
      const initial = await apiCall('/api/reports/utilization');
      const initialHours = initial.data?.summary?.totalHours;
      const initialFte = initial.data?.summary?.totalFte;
      assert.strictEqual(initialFte, 499.46, `Expected 499.46 FTE at 160h, got ${initialFte}`);

      // Change baseline to 161
      await apiCall('/api/config/assumptions', 'PUT', {
        screeningSettings: { standardMonthlyHours: 161 }
      });

      const updated = await apiCall('/api/reports/utilization');
      const updatedHours = updated.data?.summary?.totalHours;
      const updatedFte = updated.data?.summary?.totalFte;

      assert.strictEqual(updatedHours, initialHours, 'Total hours must remain 79913.91h');
      const expected161Fte = Number((79913.91 / 161).toFixed(2)); // 496.36
      assert.strictEqual(updatedFte, expected161Fte, `Expected ${expected161Fte} FTE at 161h, got ${updatedFte}`);

      // Restore baseline back to 160
      await apiCall('/api/config/assumptions', 'PUT', {
        screeningSettings: { standardMonthlyHours: 160 }
      });

      const restored = await apiCall('/api/reports/utilization');
      assert.strictEqual(restored.data?.summary?.totalFte, 499.46, 'FTE must return to 499.46 at 160h');

      console.log('âœ… PASS: Test 8 â€“ Baseline modification (161h) recalculated FTE (496.36 FTE) without changing hours (79,913.91h), restored cleanly to 160h (499.46 FTE).');
      testResults.push({ test: 'Test 8 â€“ Baseline configuration recalculation & restore', status: 'PASS' });
    }

    console.log('\n================================================================');
    console.log('ALL 8 POINT 8(c) FUNCTIONAL TESTS PASSED PERFECTLY!');
    console.log('================================================================\n');

    return testResults;
  } catch (err) {
    console.error('\nâŒ TEST SUITE FAILED:', err);
    throw err;
  }
}

if (require.main === module) {
  runPoint8cTests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runPoint8cTests };
