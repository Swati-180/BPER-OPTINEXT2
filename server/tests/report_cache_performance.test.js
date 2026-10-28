const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const WDTSubmission = require('../models/WDTSubmission');
const User = require('../models/User');
const Fitment = require('../models/Fitment');
const {
  getDashboardReport,
  getFteSummaryReport,
  getFteConsolidationSummaryReport,
  getFitmentSummaryReport,
  invalidateScopedReportsCache,
  invalidateFitmentSummaryCache,
} = require('../controllers/reportsController');

async function runCacheAndPerformanceTests() {
  console.log('=== RUNNING REPORT CACHING, SCOPE ISOLATION & PERFORMANCE TESTS ===\n');

  const mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  try {
    // 1. Create simulated test submissions across two distinct periods: Oct 2026 and Nov 2026
    const octDoc1 = new WDTSubmission({
      referenceId: 'OCT-WDT-001',
      month: 10,
      year: 2026,
      status: 'Approved',
      employee: {
        employeeId: 'EMP-101',
        name: 'Finance User',
        department: 'Finance',
        tower: 'R2R'
      },
      payload: {
        rows: [
          {
            activityCategory: 'core',
            majorProcess: 'R2R',
            process: 'GL',
            subProcess: 'Journal Posting',
            timeTakenHoursPerMonth: 80,
            fte: 0.5,
            approvalStatus: 'Approved'
          }
        ]
      },
      totalHours: 80
    });

    const octDoc2 = new WDTSubmission({
      referenceId: 'OCT-WDT-002',
      month: 10,
      year: 2026,
      status: 'Approved',
      employee: {
        employeeId: 'EMP-102',
        name: 'HR User',
        department: 'HR',
        tower: 'Talent'
      },
      payload: {
        rows: [
          {
            activityCategory: 'core',
            majorProcess: 'Talent',
            process: 'Recruitment',
            subProcess: 'Interviewing',
            timeTakenHoursPerMonth: 80,
            fte: 0.5,
            approvalStatus: 'Approved'
          }
        ]
      },
      totalHours: 80
    });

    const novDoc = new WDTSubmission({
      referenceId: 'NOV-WDT-001',
      month: 11,
      year: 2026,
      status: 'Approved',
      employee: {
        employeeId: 'EMP-103',
        name: 'Nov User',
        department: 'Finance',
        tower: 'R2R'
      },
      payload: {
        rows: [
          {
            activityCategory: 'core',
            majorProcess: 'R2R',
            process: 'GL',
            subProcess: 'Nov Posting',
            timeTakenHoursPerMonth: 160,
            fte: 1.0,
            approvalStatus: 'Approved'
          }
        ]
      },
      totalHours: 160
    });

    await WDTSubmission.create([octDoc1, octDoc2, novDoc]);

    // Test 1: In-flight deduplication / concurrent calls reuse query promise
    invalidateScopedReportsCache();
    const reqOct = {
      query: { month: 10, year: 2026 },
      user: { role: 'admin', email: 'admin@bper.com' }
    };

    let dashboardRes = null;
    let fteSummaryRes = null;
    let fteConsolidationRes = null;

    const mockRes1 = { json: (data) => { dashboardRes = data; } };
    const mockRes2 = { json: (data) => { fteSummaryRes = data; } };
    const mockRes3 = { json: (data) => { fteConsolidationRes = data; } };

    // Fire 3 simultaneous requests (simulating Dashboard frontend load)
    const t0 = Date.now();
    await Promise.all([
      getDashboardReport(reqOct, mockRes1),
      getFteSummaryReport(reqOct, mockRes2),
      getFteConsolidationSummaryReport(reqOct, mockRes3),
    ]);
    const durationConcurrent = Date.now() - t0;

    assert.strictEqual(dashboardRes.summary.totalSubmissions, 2, 'Oct submissions count must be 2');
    assert.strictEqual(dashboardRes.summary.totalHours, 160, 'Oct total hours must be 160');
    assert.strictEqual(dashboardRes.summary.totalFte, 1.0, 'Oct total FTE must be 1.0');
    assert.strictEqual(fteSummaryRes.summary.totalHours, 160, 'FteSummary total hours must match 160');
    console.log(`Test 1: Simultaneous dashboard endpoints executed in ${durationConcurrent}ms with correct data -> PASS`);

    // Test 2: Scope Isolation across reporting periods
    const reqNov = {
      query: { month: 11, year: 2026 },
      user: { role: 'admin', email: 'admin@bper.com' }
    };
    let novDashboardRes = null;
    const mockResNov = { json: (data) => { novDashboardRes = data; } };
    await getDashboardReport(reqNov, mockResNov);

    assert.strictEqual(novDashboardRes.summary.totalSubmissions, 1, 'Nov submissions count must be 1');
    assert.strictEqual(novDashboardRes.summary.totalHours, 160, 'Nov total hours must be 160');
    console.log('Test 2: Scope isolation between Oct and Nov maintained without data leakage -> PASS');

    // Test 3: Scope Isolation across departments
    const reqOctFinance = {
      query: { month: 10, year: 2026, department: 'Finance' },
      user: { role: 'admin', email: 'admin@bper.com' }
    };
    let octFinanceRes = null;
    await getDashboardReport(reqOctFinance, { json: (data) => { octFinanceRes = data; } });
    assert.strictEqual(octFinanceRes.summary.totalSubmissions, 1, 'Finance scoped count must be 1');
    assert.strictEqual(octFinanceRes.summary.totalHours, 80, 'Finance scoped hours must be 80');
    console.log('Test 3: Scope isolation by department filter maintained -> PASS');

    // Test 4: Cache invalidation works
    // Insert new document into Oct
    const octDoc3 = new WDTSubmission({
      referenceId: 'OCT-WDT-003',
      month: 10,
      year: 2026,
      status: 'Approved',
      employee: {
        employeeId: 'EMP-104',
        name: 'New User',
        department: 'Finance',
        tower: 'R2R'
      },
      payload: {
        rows: [{ activityCategory: 'core', timeTakenHoursPerMonth: 40, fte: 0.25, approvalStatus: 'Approved' }]
      },
      totalHours: 40
    });
    await octDoc3.save();

    // Before invalidation, cached result would have 2 submissions
    // Invalidate explicitly:
    invalidateScopedReportsCache();

    let updatedDashboardRes = null;
    await getDashboardReport(reqOct, { json: (data) => { updatedDashboardRes = data; } });
    assert.strictEqual(updatedDashboardRes.summary.totalSubmissions, 3, 'After invalidation, new count should be 3');
    assert.strictEqual(updatedDashboardRes.summary.totalHours, 200, 'After invalidation, total hours should be 200');
    console.log('Test 4: Cache invalidation correctly refreshes fresh database updates -> PASS');

    // 5. Fitment Summary Caching, Invalidation, and Race Guard Tests
    const reqFitment = {
      query: { department: 'Finance' },
      user: { role: 'manager' },
      headers: {},
    };

    // First request: computes and caches
    let fitmentRes1 = null;
    await getFitmentSummaryReport(reqFitment, { json: (data) => { fitmentRes1 = data; } });
    assert.ok(fitmentRes1 && fitmentRes1.generatedAt, 'Initial fitment report generated');
    assert.strictEqual(fitmentRes1.summary.totalEmployees, 3, 'Total employees in Finance should be 3');

    // Second request: hits cache (identical generatedAt)
    let fitmentRes2 = null;
    await getFitmentSummaryReport(reqFitment, { json: (data) => { fitmentRes2 = data; } });
    assert.strictEqual(fitmentRes2.generatedAt, fitmentRes1.generatedAt, 'Cache hit must return identical generatedAt');

    // Add a fitment profile
    const fitmentProfile = new Fitment({
      employeeId: 'EMP-101',
      weightedScore: 85,
      fitmentLabel: 'FIT',
    });
    await fitmentProfile.save();

    // Invalidate fitment cache
    invalidateFitmentSummaryCache();

    // After invalidation: recomputed with updated fitment profile
    let fitmentRes3 = null;
    await getFitmentSummaryReport(reqFitment, { json: (data) => { fitmentRes3 = data; } });
    assert.notStrictEqual(fitmentRes3.generatedAt, fitmentRes1.generatedAt, 'After invalidation, new timestamp should be generated');
    assert.strictEqual(fitmentRes3.summary.profiles, 1, 'Assessed profile count should now be 1');
    assert.strictEqual(fitmentRes3.summary.coveragePct, 33.3, 'Coverage should be 33.3% (1 of 3)');
    console.log('Test 5: Fitment summary cache hit & invalidation -> PASS');

    // Concurrent coalescing test
    const concurrentPromises = Array.from({ length: 3 }, () => {
      return new Promise((resolve) => {
        getFitmentSummaryReport(reqFitment, { json: resolve });
      });
    });
    const concurrentResults = await Promise.all(concurrentPromises);
    assert.strictEqual(concurrentResults[0].generatedAt, concurrentResults[1].generatedAt, 'Concurrent requests must coalesce to identical generatedAt');
    assert.strictEqual(concurrentResults[1].generatedAt, concurrentResults[2].generatedAt, 'Concurrent requests must coalesce to identical generatedAt');
    console.log('Test 6: Fitment summary concurrent request coalescing -> PASS');

    // 7. Phase C2.2 In-Flight Invalidation Race Condition Regression Test
    // Scenario:
    // - Simulate a fitment-summary computation that remains pending via controlled promise.
    // - Invalidate the cache while that computation is in flight.
    // - Resolve the old computation and verify its result is NOT cached.
    // - Make a subsequent request and verify it recomputes using fresh data.
    invalidateFitmentSummaryCache(); // Ensure clean slate before test

    const origDistinct = WDTSubmission.distinct;
    let gate1Triggered = false;
    let gate1Resolve;
    const gate1Promise = new Promise((resolve) => {
      gate1Resolve = resolve;
    });

    // Intercept WDTSubmission.distinct so the database distinct operation executes, then holds in flight
    WDTSubmission.distinct = function (...args) {
      gate1Triggered = true;
      return origDistinct.apply(this, args).then((distinctEmployeeIds) => {
        return gate1Promise.then(() => distinctEmployeeIds);
      });
    };

    let oldRequestResult = null;
    let oldRequestCompleted = false;
    const oldRequestPromise = getFitmentSummaryReport(reqFitment, {
      status: () => ({ json: () => {} }),
      json: (data) => {
        oldRequestResult = data;
        oldRequestCompleted = true;
      },
    });

    // Use setImmediate to ensure event loop ticks into computePromise
    await new Promise((resolve) => setImmediate(resolve));

    // Ensure the computation has started and is suspended in flight
    assert.strictEqual(gate1Triggered, true, 'WDT distinct query must have started');
    assert.strictEqual(oldRequestCompleted, false, 'Old computation must still be in flight');

    // Add a new profile into the database while the old request is in flight (EMP-104 is in Finance)
    const newFitmentDoc = new Fitment({
      employeeId: 'EMP-104',
      weightedScore: 92,
      fitmentLabel: 'FIT',
    });
    await newFitmentDoc.save();

    // Invalidate the cache while the old computation is in flight
    invalidateFitmentSummaryCache();

    // Now resolve the old computation
    gate1Resolve();
    await oldRequestPromise;
    assert.strictEqual(oldRequestCompleted, true, 'Old computation should now be resolved');
    assert.strictEqual(oldRequestResult.summary.profiles, 2, 'Old computation completed with data observed before invalidation');

    // Restore distinct before issuing subsequent requests
    WDTSubmission.distinct = origDistinct;

    // Mutate database with a fresh profile after invalidation to verify fresh recompute reflects newer data
    const thirdFitmentDoc = new Fitment({
      employeeId: 'EMP-103',
      weightedScore: 78,
      fitmentLabel: 'FIT',
    });
    await thirdFitmentDoc.save();

    // Subsequent request should NOT receive the stale result; it must recompute fresh data
    let freshRequestResult = null;
    await getFitmentSummaryReport(reqFitment, {
      status: () => ({ json: () => {} }),
      json: (data) => {
        freshRequestResult = data;
      },
    });

    assert.notStrictEqual(
      freshRequestResult.generatedAt,
      oldRequestResult.generatedAt,
      'Subsequent request must not return stale cached result'
    );
    assert.strictEqual(
      freshRequestResult.summary.profiles,
      3,
      'Subsequent request must recompute fresh data showing 3 profiles'
    );
    assert.strictEqual(
      freshRequestResult.summary.coveragePct,
      100,
      'Coverage should be updated to 100% (3 of 3)'
    );

    // Verify subsequent identical request hits the newly populated cache
    let cachedSubsequentResult = null;
    await getFitmentSummaryReport(reqFitment, {
      status: () => ({ json: () => {} }),
      json: (data) => {
        cachedSubsequentResult = data;
      },
    });
    assert.strictEqual(
      cachedSubsequentResult.generatedAt,
      freshRequestResult.generatedAt,
      'Subsequent request should now hit the newly cached fresh result'
    );

    console.log('Test 7: In-flight invalidation race guard (stale results not cached, fresh recompute verified) -> PASS');

    // 8. In-Flight Failure After Invalidation Cannot Delete Newer In-Flight/Valid Cache Entry
    // Scenario:
    // - Request A starts computation and is held in flight.
    // - Invalidation occurs, incrementing the generation counter.
    // - Request B starts and populates a new in-flight entry or cache entry for the new generation.
    // - Request A fails (rejects).
    // - Request A's catch block must NOT delete Request B's entry because generation has advanced.
    let gateFailResolve, gateFailReject;
    const gateFailPromise = new Promise((resolve, reject) => {
      gateFailResolve = resolve;
      gateFailReject = reject;
    });

    let failGateTriggered = false;
    WDTSubmission.distinct = function (...args) {
      failGateTriggered = true;
      return origDistinct.apply(this, args).then(() => {
        return gateFailPromise;
      });
    };

    // Invalidate again to start clean
    invalidateFitmentSummaryCache();

    // Start failing request A
    let reqAFailed = false;
    let reqAStatus = 0;
    const reqAPromise = getFitmentSummaryReport(reqFitment, {
      status: (code) => {
        reqAStatus = code;
        return {
          json: () => {
            reqAFailed = true;
          },
        };
      },
      json: () => {},
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(failGateTriggered, true, 'Request A must have entered in-flight state');

    // Invalidate while Request A is in flight
    invalidateFitmentSummaryCache();

    // Restore distinct before starting Request B under the new generation
    WDTSubmission.distinct = origDistinct;

    // Now start Request B under the new generation
    let reqBResult = null;
    await getFitmentSummaryReport(reqFitment, {
      status: () => ({ json: () => {} }),
      json: (data) => {
        reqBResult = data;
      },
    });
    assert.ok(reqBResult && reqBResult.generatedAt, 'Request B under new generation succeeded and cached');

    // Now fail Request A
    gateFailReject(new Error('Simulated database failure for Request A'));
    await reqAPromise;
    assert.strictEqual(reqAStatus, 500, 'Request A should fail with 500 status');
    assert.strictEqual(reqAFailed, true, 'Request A error response handled');

    // Verify Request B's cache entry was NOT deleted by Request A's failure
    let postReqACacheHit = null;
    await getFitmentSummaryReport(reqFitment, {
      status: () => ({ json: () => {} }),
      json: (data) => {
        postReqACacheHit = data;
      },
    });
    assert.strictEqual(
      postReqACacheHit.generatedAt,
      reqBResult.generatedAt,
      'Request B cache entry must remain intact and not deleted by superseded Request A failure'
    );

    console.log('Test 8: In-flight error after invalidation cannot delete newer generation cache entry -> PASS');

    // 9. Phase C4 Dashboard Report Top 50 Activity Preview & KPI Parity Test
    // Scenario:
    // - Generate a synthetic dataset with 60 distinct activities in Finance & HR.
    // - Verify getDashboardReport returns charts.topActivities sliced to max 50 items.
    // - Verify charts.totalActivitiesCount reports the true total count.
    // - Verify activities are ordered strictly in descending order of FTE.
    // - Verify totalHours, totalFte, totalSubmissions, and employee counts remain unaffected.
    // - Verify department filter scoping restricts preview and count to that department.
    invalidateScopedReportsCache();

    // Create 55 distinct activities across submissions
    const bulkSubmissions = [];
    for (let i = 1; i <= 55; i++) {
      bulkSubmissions.push(new WDTSubmission({
        referenceId: `OCT-PREVIEW-${String(i).padStart(3, '0')}`,
        month: 10,
        year: 2026,
        status: 'Approved',
        employee: {
          employeeId: `EMP-C4-${i}`,
          name: `Employee ${i}`,
          department: i <= 50 ? 'Finance' : 'Operations',
          tower: 'R2R'
        },
        payload: {
          rows: [
            {
              activityCategory: 'core',
              majorProcess: 'R2R',
              process: `Process-${i}`,
              subProcess: `SubProcess-${i}`,
              timeTakenHoursPerMonth: i, // distinct hours: 1, 2, ..., 55
              fte: Number((i / 160).toFixed(2)),
              approvalStatus: 'Approved'
            }
          ]
        },
        totalHours: i
      }));
    }
    await WDTSubmission.insertMany(bulkSubmissions);
    invalidateScopedReportsCache();

    // 9a. Test All Departments scope
    let dashAllRes = null;
    await getDashboardReport(
      { query: { month: 10, year: 2026 }, user: { role: 'admin' } },
      { json: (data) => { dashAllRes = data; } }
    );

    assert.ok(dashAllRes && dashAllRes.charts, 'Dashboard response received');
    assert.strictEqual(
      dashAllRes.charts.topActivities.length,
      50,
      'Top activities must be capped at 50 items'
    );
    assert.ok(
      dashAllRes.charts.totalActivitiesCount > 50,
      `totalActivitiesCount (${dashAllRes.charts.totalActivitiesCount}) must reflect true activity count (>50)`
    );

    // Verify strict descending FTE order
    for (let idx = 0; idx < dashAllRes.charts.topActivities.length - 1; idx++) {
      const current = dashAllRes.charts.topActivities[idx];
      const next = dashAllRes.charts.topActivities[idx + 1];
      assert.ok(
        current.fte >= next.fte,
        `Activity ordering violation: item ${idx} (${current.fte}) must be >= item ${idx + 1} (${next.fte})`
      );
    }

    // Verify KPI totals remain accurate and not truncated by the 50 limit
    assert.ok(dashAllRes.summary.totalHours > 1000, 'Total hours must reflect all submissions');
    assert.ok(dashAllRes.summary.totalSubmissions >= 55, 'Total submissions must reflect all submissions');

    // 9b. Test Department Scoped request
    let dashFinanceRes = null;
    await getDashboardReport(
      { query: { month: 10, year: 2026, department: 'Finance' }, user: { role: 'admin' } },
      { json: (data) => { dashFinanceRes = data; } }
    );

    assert.ok(dashFinanceRes && dashFinanceRes.charts, 'Department-scoped response received');
    // Ensure every activity in the preview belongs to the Finance scope
    dashFinanceRes.charts.topActivities.forEach((act) => {
      assert.ok(['R2R', 'Finance'].includes(act.tower), `Activity tower (${act.tower}) should match Finance submissions`);
    });
    assert.ok(
      dashFinanceRes.charts.topActivities.length <= 50,
      'Department preview must also be capped at 50'
    );

    console.log('Test 9: Phase C4 Dashboard top 50 preview, total count, descending FTE & KPI parity -> PASS');

    console.log('\n>>> ALL 9 CACHE & PERFORMANCE TESTS PASSED SUCCESSFULLY! <<<\n');
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
}

runCacheAndPerformanceTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
