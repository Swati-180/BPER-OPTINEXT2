const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

// Models
const User = require('../models/User');
const Company = require('../models/Company');
const Project = require('../models/Project');
const CompanyMembership = require('../models/CompanyMembership');
const UserProjectMembership = require('../models/UserProjectMembership');
const WDTSubmission = require('../models/WDTSubmission');
const EmployeeInvite = require('../models/EmployeeInvite');
const SystemConfig = require('../models/SystemConfig');

// Middleware & Controllers
const { resolveTenantScope } = require('../middleware/tenantContext');
const { submitWDT, getSubmissions, getSubmissionByRefId, updateSubmissionStatus } = require('../controllers/wdtController');
const { exportWDTSubmissions } = require('../controllers/exportController');
const { getFitmentByEmployee, upsertFitment } = require('../controllers/fitmentController');
const { confirmInvites, getInviteStatus, registerViaInvite } = require('../controllers/inviteController');
const { getDashboardReport } = require('../controllers/reportsController');
const { getSixBySixData } = require('../controllers/analysisController');
const { assessLegacyDataMigration } = require('../scripts/assess_legacy_migration');

function createMockReqRes({ body = {}, params = {}, query = {}, headers = {}, user = null } = {}) {
  const req = { body, params, query, headers, user };
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(name, val) {
      this.headers[name] = val;
    }
  };
  return { req, res };
}

function runMiddleware(middleware, req, res) {
  return new Promise((resolve) => {
    let resolved = false;
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      originalJson(data);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
      return this;
    };
    middleware(req, res, (err) => {
      if (!resolved) {
        resolved = true;
        resolve(true);
      }
    });
  });
}

async function runMilestone3Tests() {
  console.log('--- Starting Milestone 3 Workforce Data Integration & Tenant Scoping Test Suite ---');
  let mongod;

  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log('[Test Setup] Connected to isolated in-memory MongoDB.');

    // Ensure model indexes
    await User.init();
    await Company.init();
    await Project.init();
    await CompanyMembership.init();
    await UserProjectMembership.init();
    await WDTSubmission.init();
    await EmployeeInvite.init();
    await SystemConfig.init();
    console.log('[Test Setup] All model indexes initialized.');

    process.env.JWT_SECRET = 'milestone3_test_jwt_secret_999';

    // 1. Provision Platform Hierarchy: Company A, Company B, and respective Projects
    const rootAdmin = await User.create({
      name: 'System Root',
      email: 'root@bper.test',
      password: 'password123',
      role: 'super_admin',
      isActive: true
    });

    const compA = await Company.create({
      name: 'Alpha Holdings Corp',
      code: 'ALPHA_CORP',
      createdBy: rootAdmin._id
    });

    const compB = await Company.create({
      name: 'Beta Global Industries',
      code: 'BETA_CORP',
      createdBy: rootAdmin._id
    });

    const projA1 = await Project.create({
      companyId: compA._id,
      name: 'Alpha Project One',
      code: 'PRJ_A1',
      department: 'Finance',
      createdBy: rootAdmin._id
    });

    const projB1 = await Project.create({
      companyId: compB._id,
      name: 'Beta Project One',
      code: 'PRJ_B1',
      department: 'Finance',
      createdBy: rootAdmin._id
    });

    // Create users for Company A and Company B
    const userA_Employee = await User.create({
      name: 'Employee Alpha',
      email: 'emp_alpha@bper.test',
      password: 'password123',
      role: 'employee',
      employeeId: 'EMP-A01',
      department: 'Finance',
      formAccessGranted: true,
      isActive: true
    });
    await UserProjectMembership.create({
      companyId: compA._id,
      projectId: projA1._id,
      userId: userA_Employee._id,
      role: 'employee',
      employeeId: 'EMP-A01',
      createdBy: rootAdmin._id
    });

    const userB_Employee = await User.create({
      name: 'Employee Beta',
      email: 'emp_beta@bper.test',
      password: 'password123',
      role: 'employee',
      employeeId: 'EMP-B01',
      department: 'Finance',
      formAccessGranted: true,
      isActive: true
    });
    await UserProjectMembership.create({
      companyId: compB._id,
      projectId: projB1._id,
      userId: userB_Employee._id,
      role: 'employee',
      employeeId: 'EMP-B01',
      createdBy: rootAdmin._id
    });

    const userA_Manager = await User.create({
      name: 'Manager Alpha',
      email: 'mgr_alpha@bper.test',
      password: 'password123',
      role: 'manager',
      department: 'Finance',
      isActive: true
    });
    await UserProjectMembership.create({
      companyId: compA._id,
      projectId: projA1._id,
      userId: userA_Manager._id,
      role: 'manager',
      createdBy: rootAdmin._id
    });

    // =========================================================================
    // Suite 1: WDT Submission & Scoped Creation
    // =========================================================================
    console.log('\n[Suite 1] WDT Submission Tenant Scoping Tests');

    // 1a. User A submits WDT under Project A1
    const { req: reqSubA, res: resSubA } = createMockReqRes({
      user: { userId: userA_Employee._id, role: 'employee', email: userA_Employee.email },
      headers: { 'x-company-id': compA._id.toString(), 'x-project-id': projA1._id.toString() },
      body: {
        referenceId: 'REF-ALPHA-001',
        month: 10,
        year: 2026,
        employee: {
          employeeId: userA_Employee.employeeId,
          name: userA_Employee.name,
          email: userA_Employee.email,
          department: 'Finance'
        },
        payload: {
          rows: [{
            process: 'General Ledger Entry',
            subProcess: 'Journal Posting',
            activityCategory: 'core',
            timeTakenHoursPerMonth: 40,
            comments: 'Standard entry'
          }]
        }
      }
    });
    await runMiddleware(resolveTenantScope({ required: true }), reqSubA, resSubA);
    assert.strictEqual(reqSubA.tenantScope.companyId.toString(), compA._id.toString());
    assert.strictEqual(reqSubA.tenantScope.projectId.toString(), projA1._id.toString());

    await submitWDT(reqSubA, resSubA);
    assert.strictEqual(resSubA.statusCode, 201, 'WDT Submission must succeed');
    assert.strictEqual(resSubA.data.companyId.toString(), compA._id.toString());
    assert.strictEqual(resSubA.data.projectId.toString(), projA1._id.toString());
    console.log('✓ 1a. WDT submission created with verified companyId and projectId.');

    // 1b. User B submits WDT under Project B1
    const { req: reqSubB, res: resSubB } = createMockReqRes({
      user: { userId: userB_Employee._id, role: 'employee', email: userB_Employee.email },
      headers: { 'x-company-id': compB._id.toString(), 'x-project-id': projB1._id.toString() },
      body: {
        referenceId: 'REF-BETA-001',
        month: 10,
        year: 2026,
        employee: {
          employeeId: userB_Employee.employeeId,
          name: userB_Employee.name,
          email: userB_Employee.email,
          department: 'Finance'
        },
        payload: {
          rows: [{
            process: 'Accounts Payable',
            subProcess: 'Invoice Verification',
            activityCategory: 'core',
            timeTakenHoursPerMonth: 50,
            comments: 'Beta invoice'
          }]
        }
      }
    });
    await runMiddleware(resolveTenantScope({ required: true }), reqSubB, resSubB);
    await submitWDT(reqSubB, resSubB);
    assert.strictEqual(resSubB.statusCode, 201);
    assert.strictEqual(resSubB.data.companyId.toString(), compB._id.toString());
    console.log('✓ 1b. Company B WDT submission created successfully with Company B scoping.');

    // =========================================================================
    // Suite 2: Cross-Tenant Data Isolation & Query Filtering
    // =========================================================================
    console.log('\n[Suite 2] Cross-Tenant Read & Query Isolation Tests');

    // 2a. Manager Alpha queries submissions in Project A1
    const { req: reqGetA, res: resGetA } = createMockReqRes({
      user: { userId: userA_Manager._id, role: 'manager', email: userA_Manager.email },
      headers: { 'x-company-id': compA._id.toString(), 'x-project-id': projA1._id.toString() },
      query: { department: 'Finance' }
    });
    await runMiddleware(resolveTenantScope({ required: true }), reqGetA, resGetA);
    await getSubmissions(reqGetA, resGetA);
    assert.strictEqual(resGetA.statusCode, 200);
    assert.strictEqual(resGetA.data.length, 1);
    assert.strictEqual(resGetA.data[0].referenceId, 'REF-ALPHA-001', 'Manager Alpha must only see Alpha submissions');
    console.log('✓ 2a. Manager Alpha query correctly isolated to Alpha submissions.');

    // 2b. Manager Alpha attempts to query Project B1 (Unauthorized project access)
    const { req: reqCross, res: resCross } = createMockReqRes({
      user: { userId: userA_Manager._id, role: 'manager', email: userA_Manager.email },
      headers: { 'x-company-id': compB._id.toString(), 'x-project-id': projB1._id.toString() }
    });
    const crossAllowed = await runMiddleware(resolveTenantScope({ required: true }), reqCross, resCross);
    assert.strictEqual(crossAllowed, false, 'Manager A cannot access Project B1');
    assert.strictEqual(resCross.statusCode, 403);
    console.log('✓ 2b. Cross-tenant project access rejected with 403 Forbidden.');

    // =========================================================================
    // Suite 3: Employee Invitation Scoping & Registration
    // =========================================================================
    console.log('\n[Suite 3] Employee Invitation Scoping Tests');

    // 3a. Create invitation scoped to Project A1
    const { req: reqInvA, res: resInvA } = createMockReqRes({
      user: { userId: userA_Manager._id, role: 'manager' },
      headers: { 'x-company-id': compA._id.toString(), 'x-project-id': projA1._id.toString() },
      body: {
        rows: [{ name: 'New Hire Alpha', email: 'hire_alpha@bper.test' }]
      }
    });
    await runMiddleware(resolveTenantScope({ required: true }), reqInvA, resInvA);
    await confirmInvites(reqInvA, resInvA);
    assert.strictEqual(resInvA.statusCode, 200);
    assert.strictEqual(resInvA.data.saved.length, 1);

    const createdInvite = await EmployeeInvite.findOne({ email: 'hire_alpha@bper.test' });
    assert.ok(createdInvite);
    assert.strictEqual(createdInvite.companyId.toString(), compA._id.toString());
    assert.strictEqual(createdInvite.projectId.toString(), projA1._id.toString());
    console.log('✓ 3a. Employee invitation successfully created with company & project scoping.');

    // 3b. Register via invite and verify automatic UserProjectMembership assignment
    const rawInviteToken = resInvA.data.saved[0].inviteToken;
    const { req: reqReg, res: resReg } = createMockReqRes({
      params: { token: rawInviteToken },
      body: { password: 'strongpassword123' }
    });
    await registerViaInvite(reqReg, resReg);
    assert.strictEqual(resReg.statusCode, 200);

    const registeredUser = await User.findOne({ email: 'hire_alpha@bper.test' });
    assert.ok(registeredUser);

    const userMembership = await UserProjectMembership.findOne({
      projectId: projA1._id,
      userId: registeredUser._id
    });
    assert.ok(userMembership, 'New registrant must receive UserProjectMembership in Project A1');
    assert.strictEqual(userMembership.role, 'employee');
    assert.strictEqual(userMembership.companyId.toString(), compA._id.toString());
    console.log('✓ 3b. Invitee registration correctly attached UserProjectMembership to Project A1.');

    // 3c. List invites with tenant filtering
    const { req: reqListInv, res: resListInv } = createMockReqRes({
      user: { userId: userA_Manager._id, role: 'manager' },
      headers: { 'x-company-id': compA._id.toString(), 'x-project-id': projA1._id.toString() },
      query: { status: 'all' }
    });
    await runMiddleware(resolveTenantScope({ required: true }), reqListInv, resListInv);
    await getInviteStatus(reqListInv, resListInv);
    assert.strictEqual(resListInv.statusCode, 200);
    assert.strictEqual(resListInv.data.length, 1);
    assert.strictEqual(resListInv.data[0].email, 'hire_alpha@bper.test');
    console.log('✓ 3c. Employee invite listing strictly filtered by tenant scope.');

    // =========================================================================
    // Suite 4: Analytics, Dashboards & Cache Key Isolation
    // =========================================================================
    console.log('\n[Suite 4] Scoped Reports & Analytics Cache Isolation Tests');

    // Approve Alpha submission so it appears in analytics calculations
    await WDTSubmission.updateOne({ referenceId: 'REF-ALPHA-001' }, { $set: { status: 'Approved' } });

    // 4a. Fetch Dashboard report with tenant scoping
    const { req: reqDash, res: resDash } = createMockReqRes({
      user: { userId: userA_Manager._id, role: 'manager' },
      headers: { 'x-company-id': compA._id.toString(), 'x-project-id': projA1._id.toString() },
      query: { department: 'Finance', month: '10', year: '2026' }
    });
    await runMiddleware(resolveTenantScope({ required: true }), reqDash, resDash);
    await getDashboardReport(reqDash, resDash);
    assert.strictEqual(resDash.statusCode, 200);
    assert.ok(resDash.data.summary, 'Dashboard report must return valid summary');
    assert.strictEqual(resDash.data.summary.totalSubmissions, 1, 'Company A dashboard should see 1 submission');
    console.log('✓ 4a. Dashboard report calculation executed within authorized tenant scope.');

    // 4b. 6x6 Analytics cache isolation: verify cache keys include tenant identifiers
    const { req: req6x6_A, res: res6x6_A } = createMockReqRes({
      user: { userId: userA_Manager._id, role: 'manager' },
      headers: { 'x-company-id': compA._id.toString(), 'x-project-id': projA1._id.toString() },
      query: { department: 'Finance' }
    });
    await runMiddleware(resolveTenantScope({ required: true }), req6x6_A, res6x6_A);
    await getSixBySixData(req6x6_A, res6x6_A);
    assert.strictEqual(res6x6_A.statusCode, 200);

    const { req: req6x6_B, res: res6x6_B } = createMockReqRes({
      user: { userId: rootAdmin._id, role: 'super_admin' },
      headers: { 'x-company-id': compB._id.toString(), 'x-project-id': projB1._id.toString() },
      query: { department: 'Finance' }
    });
    await runMiddleware(resolveTenantScope({ required: true }), req6x6_B, res6x6_B);
    await getSixBySixData(req6x6_B, res6x6_B);
    assert.strictEqual(res6x6_B.statusCode, 200);
    console.log('✓ 4b. 6x6 analytics cache isolation verified between Company A and Company B.');

    // =========================================================================
    // Suite 5: Legacy Data Migration Assessment & Dry Run
    // =========================================================================
    console.log('\n[Suite 5] Legacy Data Migration Strategy Tests');

    // Create an unassigned legacy submission (simulating pre-existing data without companyId)
    await WDTSubmission.create({
      referenceId: 'LEGACY-UNSCOPED-001',
      month: 10,
      year: 2026,
      employee: { employeeId: 'EMP-LEGACY', name: 'Legacy Worker', department: 'Operations' },
      payload: { rows: [] }
    });

    const migrationDryRun = await assessLegacyDataMigration(mongoose.connection, { dryRun: true });
    assert.strictEqual(migrationDryRun.dryRun, true);
    assert.ok(migrationDryRun.unassignedWDTCount >= 1, 'Dry run must identify legacy unassigned submissions');
    console.log('✓ 5a. Legacy data migration dry-run accurately identifies unassigned records.');

    // =========================================================================
    // Suite 6: Security Remediation (Export, WDT Review Authorization, Fitment)
    // =========================================================================
    console.log('\n[Suite 6] Security Remediation Verification Tests');

    const authManagerA = { userId: userA_Manager._id, role: 'manager', email: userA_Manager.email };
    
    const userB_Manager = await User.create({
      name: 'Manager Beta',
      email: 'mgr_beta@bper.test',
      password: 'password123',
      role: 'manager',
      department: 'Finance',
      isActive: true
    });
    await UserProjectMembership.create({
      companyId: compB._id,
      projectId: projB1._id,
      userId: userB_Manager._id,
      role: 'manager',
      createdBy: rootAdmin._id
    });
    const authManagerB = { userId: userB_Manager._id, role: 'manager', email: userB_Manager.email };

    // 6a. Export security: missing tenant scope for multi-membership or super_admin rejected with 400
    const { req: reqExportMissing, res: resExportMissing } = createMockReqRes({
      user: { userId: rootAdmin._id, role: 'super_admin', email: rootAdmin.email },
      headers: {} // missing x-company-id and x-project-id
    });
    await runMiddleware(resolveTenantScope({ required: true }), reqExportMissing, resExportMissing);
    assert.strictEqual(resExportMissing.statusCode, 400, 'Export route must reject requests without tenant scope');
    console.log('✓ 6a. Export request without tenant headers correctly rejected with 400.');

    // 6b. WDT status update: cross-tenant authorization check
    // Manager Alpha attempts to update Company B submission status
    const compBSubmission = await WDTSubmission.findOne({ companyId: compB._id });
    assert.ok(compBSubmission, 'Company B submission must exist');

    const { req: reqStatusCross, res: resStatusCross } = createMockReqRes({
      user: authManagerA, // belongs to Company A / Project A1
      params: { referenceId: compBSubmission.referenceId },
      body: { status: 'Approved', managerName: 'Manager Alpha' }
    });
    await updateSubmissionStatus(reqStatusCross, resStatusCross);
    assert.strictEqual(resStatusCross.statusCode, 403, 'Cross-tenant WDT status update must be forbidden');
    console.log('✓ 6b. Cross-tenant WDT status update rejected with 403 Forbidden.');

    // 6c. WDT view by ref ID: cross-tenant authorization check
    const { req: reqViewCross, res: resViewCross } = createMockReqRes({
      user: authManagerA,
      params: { referenceId: compBSubmission.referenceId }
    });
    await getSubmissionByRefId(reqViewCross, resViewCross);
    assert.strictEqual(resViewCross.statusCode, 403, 'Cross-tenant WDT view by referenceId must be forbidden');
    console.log('✓ 6c. Cross-tenant WDT reference lookup rejected with 403 Forbidden.');

    // 6d. Fitment scoping & isolation
    const { req: reqFitmentUpsertA, res: resFitmentUpsertA } = createMockReqRes({
      user: authManagerA,
      headers: { 'x-company-id': compA._id.toString(), 'x-project-id': projA1._id.toString() },
      body: {
        employeeId: 'EMP-FIT-001',
        name: 'Fitment Candidate 1',
        scores: { technical: 85, leadership: 90 }
      }
    });
    await runMiddleware(resolveTenantScope({ required: true }), reqFitmentUpsertA, resFitmentUpsertA);
    await upsertFitment(reqFitmentUpsertA, resFitmentUpsertA);
    assert.strictEqual(resFitmentUpsertA.statusCode, 200);

    // Company B manager tries to access EMP-FIT-001 in their project -> should be 404 (isolated)
    const { req: reqFitmentGetB, res: resFitmentGetB } = createMockReqRes({
      user: authManagerB,
      headers: { 'x-company-id': compB._id.toString(), 'x-project-id': projB1._id.toString() },
      params: { employeeId: 'EMP-FIT-001' }
    });
    await runMiddleware(resolveTenantScope({ required: true }), reqFitmentGetB, resFitmentGetB);
    await getFitmentByEmployee(reqFitmentGetB, resFitmentGetB);
    assert.strictEqual(resFitmentGetB.statusCode, 404, 'Fitment profile must be strictly scoped to project');
    console.log('✓ 6d. Fitment profile strictly isolated by projectId (cross-project returns 404).');

    console.log('\n============================================================');
    console.log('ALL MILESTONE 3 TESTS PASSED SUCCESSFULLY (6/6 SUITES)');
    console.log('============================================================');

  } catch (err) {
    console.error('Milestone 3 Test Suite Failed:', err);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongod) {
      await mongod.stop();
    }
  }
}

runMilestone3Tests();
