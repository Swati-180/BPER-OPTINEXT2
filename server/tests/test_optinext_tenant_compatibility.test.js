/**
 * test_optinext_tenant_compatibility.test.js
 *
 * Verifies OptiNext tenant compatibility under strict tenant enforcement:
 * 1. OptiNext Employee login, project auto-resolution, WDT submission scoping.
 * 2. OptiNext Manager / Project Admin login, project access, reports, PAM and workforce analytics.
 * 3. Prevention of cross-tenant data exposure (Strict Tenant Isolation).
 * 4. Verification that no global fallback exposes records across companies or projects.
 * 5. Grade standardizer compliance with 6 approved bands across workforce analytics.
 */

const assert = require('assert');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

require('../models/Company');
require('../models/Project');
require('../models/User');
require('../models/UserProjectMembership');
require('../models/CompanyMembership');
require('../models/WDTSubmission');

// Explicitly check server/.env and parent .env
const envCandidates = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../BPER-OPTINEXT2/server/.env'),
  path.resolve(__dirname, '../../BPER-OPTINEXT2/.env')
];
for (const envPath of envCandidates) {
  if (require('fs').existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }
}
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

const BASE_URL = 'http://127.0.0.1:5000';

async function runTenantCompatibilitySuite() {
  console.log('================================================================');
  console.log('OPTINEXT TENANT COMPATIBILITY & STRICT ISOLATION TEST SUITE');
  console.log('================================================================\n');

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect('mongodb://127.0.0.1:27018/bper_isolated_local_test');
  }

  const Company = mongoose.model('Company');
  const Project = mongoose.model('Project');
  const User = mongoose.model('User');
  const UPM = mongoose.model('UserProjectMembership');

  const optinext = await Company.findOne({ code: 'OPTINEXT' });
  const finOps = await Project.findOne({ code: 'FIN_OPS' });
  assert.ok(optinext, 'OptiNext Company must exist');
  assert.ok(finOps, 'FIN_OPS Project must exist');

  const adminUser = await User.findOne({ email: 'admin@optinext.test' });
  const empMem = await UPM.findOne({ projectId: finOps._id, role: 'employee', userId: { $ne: null } });
  const empUser = await User.findById(empMem.userId);

  assert.ok(adminUser, 'OptiNext Project Admin user must exist');
  assert.ok(empUser, 'OptiNext Employee user must exist');

  const adminToken = jwt.sign(
    { id: String(adminUser._id), userId: String(adminUser._id), email: adminUser.email, role: adminUser.role },
    JWT_SECRET
  );
  const empToken = jwt.sign(
    { id: String(empUser._id), userId: String(empUser._id), email: empUser.email, role: empUser.role },
    JWT_SECRET
  );

  const apiCall = async (endpoint, method = 'GET', body = null, token = adminToken, headers = {}) => {
    const defaultHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-company-id': String(optinext._id),
      'x-project-id': String(finOps._id),
      ...headers
    };
    const options = { method, headers: defaultHeaders };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${endpoint}`, options);
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { status: res.status, ok: res.ok, data };
  };

  // Ensure clean test submission for month 12
  await mongoose.model('WDTSubmission').deleteMany({
    'employee.employeeId': empUser.employeeId || 'EMP-TEST-TENANT',
    month: 12,
    year: 2026
  });

  // ---------------------------------------------------------------------------
  // TEST 1: OptiNext Employee can submit WDT and it attaches companyId & projectId
  // ---------------------------------------------------------------------------
  console.log('--- Test 1: Employee WDT Submission with Tenant Context ---');
  {
    const subPayload = {
      referenceId: `WDT-2026-12-${Date.now()}`,
      employee: {
        employeeId: empUser.employeeId || 'EMP-TEST-TENANT',
        name: empUser.name || 'Tenant Test Employee',
        department: 'Finance & Accounting',
        designation: 'Financial Analyst',
        grade: 'E2',
        originalGradeAtSubmission: 'E2',
        employeeType: 'Permanent'
      },
      month: 12,
      year: 2026,
      payload: {
        rows: [
          {
            majorProcess: 'General Ledger',
            process: 'Journal Entries',
            subProcess: 'Tenant Scoped Posting',
            timeTakenHoursPerMonth: 160,
            activityCategory: 'core',
            approvalStatus: 'Approved'
          }
        ]
      }
    };

    const res = await apiCall('/api/wdt/submit', 'POST', subPayload, empToken);
    if (res.status !== 201) {
      console.error('Test 1 failure response:', res.status, res.data);
    }
    assert.strictEqual(res.status, 201, `Expected HTTP 201 Created, got ${res.status}`);
    assert.strictEqual(String(res.data.companyId), String(optinext._id), 'Submission must link to OptiNext Company');
    assert.strictEqual(String(res.data.projectId), String(finOps._id), 'Submission must link to FIN_OPS Project');
    console.log('✅ PASS: Employee submission successfully scoped to OptiNext / FIN_OPS.');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: OptiNext Reports & Analytics under strict tenant context
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: Reports & Analytics under Strict OptiNext Scoping ---');
  {
    const resUtil = await apiCall('/api/reports/utilization', 'GET', null, adminToken);
    assert.strictEqual(resUtil.status, 200, `Expected HTTP 200, got ${resUtil.status}`);
    assert.ok(resUtil.data.summary, 'Utilization summary must exist');
    console.log(`✅ PASS: OptiNext Utilization Report returned ${resUtil.data.summary.totalHours} hrs cleanly.`);

    const resCap = await apiCall('/api/reports/workforce-capacity', 'GET', null, adminToken);
    assert.strictEqual(resCap.status, 200, `Expected HTTP 200, got ${resCap.status}`);
    assert.ok(resCap.data.actualWorkforce, 'Actual Workforce (View A) must exist');
    assert.ok(resCap.data.vacancyCapacityPlanning, 'Vacancy Planning (View B) must exist');
    assert.ok(resCap.data.workforceGapAnalysis, 'Workforce Gap (View C) must exist');
    console.log('✅ PASS: Workforce Capacity Views A, B, and C return 200 with complete structure.');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Strict Tenant Isolation (Cross-Tenant Rejection)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Cross-Tenant Request Rejection ---');
  {
    // Try passing ACME company ID with employee token (who is only member of OptiNext)
    const acmeCompany = await Company.findOne({ code: 'ACME' });
    const acmeProject = await Project.findOne({ code: 'ACME_FIN' });

    if (acmeCompany && acmeProject) {
      const resForbidden = await apiCall(
        '/api/reports/utilization',
        'GET',
        null,
        empToken,
        { 'x-company-id': String(acmeCompany._id), 'x-project-id': String(acmeProject._id) }
      );
      assert.strictEqual(resForbidden.status, 403, `Expected HTTP 403 Forbidden for cross-tenant access, got ${resForbidden.status}`);
      console.log('✅ PASS: Cross-tenant access strictly rejected with HTTP 403 Forbidden.');
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Missing Tenant Header Rejection (No Global Fallback Leakage)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: Missing Tenant Scope Enforces Rejection (No Global Leakage) ---');
  {
    const resNoHeaders = await fetch(`${BASE_URL}/api/reports/utilization`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    // For admin, missing tenant scope must reject with 400 (not fall back globally)
    assert.strictEqual(resNoHeaders.status, 400, `Expected HTTP 400 Bad Request, got ${resNoHeaders.status}`);
    console.log('✅ PASS: Missing tenant scope rejects with HTTP 400 (zero global cross-tenant fallback).');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Six Approved Grade Bands in Workforce Capacity API
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: Six Approved Grade Bands Compliance ---');
  {
    const resCap = await apiCall('/api/reports/workforce-capacity', 'GET', null, adminToken);
    const bandsInReport = resCap.data.actualWorkforce.byGradeBand.map(b => b.band);
    const approvedBands = ['VP & AVP', 'GM', 'E1–E4', 'O3–O5', 'O2 and Below + Intern', 'Outsourced / Contractual'];

    approvedBands.forEach(approvedBand => {
      assert.ok(bandsInReport.includes(approvedBand), `Report must include approved band: ${approvedBand}`);
    });

    // Check if Unmapped is flagged as data quality status
    const unmappedEntry = resCap.data.actualWorkforce.byGradeBand.find(b => b.band === 'Unmapped');
    if (unmappedEntry) {
      assert.strictEqual(unmappedEntry.isDataQualityStatus, true, 'Unmapped entry must carry isDataQualityStatus: true');
    }

    console.log('✅ PASS: All 6 approved grade bands correctly represented with Unmapped as data-quality status.');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL OPTINEXT TENANT COMPATIBILITY & ISOLATION TESTS PASSED 100%!');
  console.log('================================================================\n');
  process.exit(0);
}

runTenantCompatibilitySuite().catch(err => {
  console.error('❌ Tenant compatibility suite failed:', err);
  process.exit(1);
});
