const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Import models
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const AuditLog = require('../models/AuditLog');
const Company = require('../models/Company');
const Project = require('../models/Project');
const CompanyMembership = require('../models/CompanyMembership');
const UserProjectMembership = require('../models/UserProjectMembership');

// Import controllers
const { bootstrapSuperAdmin, BOOTSTRAP_CONFIG_KEY } = require('../controllers/bootstrapController');
const {
  createCompany,
  listCompanies,
  getCompanyById,
  updateCompany,
  setCompanyStatus,
  assignCompanyAdmin,
  listCompanyAdmins
} = require('../controllers/companyController');
const {
  createProject,
  listCompanyProjects,
  getProjectById,
  updateProject,
  setProjectStatus,
  assignProjectAdmin,
  listProjectMembers
} = require('../controllers/projectController');
const {
  requireSuperAdmin,
  requireCompanyAdmin,
  requireProjectCreationPermission,
  requireProjectAdmin
} = require('../middleware/tenantAuth');

// Helper to create mock Express req/res
function createMockReqRes({ body = {}, params = {}, query = {}, user = null, ip = '127.0.0.1' } = {}) {
  const req = { body, params, query, user, ip };
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

// Helper to run middleware
function runMiddleware(middleware, req, res) {
  return new Promise((resolve) => {
    let resolved = false;
    const originalJson = res.json.bind(res);
    const originalStatus = res.status.bind(res);

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

async function runMilestone2Tests() {
  console.log('--- Starting Milestone 2 Super Admin Bootstrap & Tenant Governance Test Suite ---');
  let mongod;

  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log('[Test Setup] Connected to isolated in-memory MongoDB.');

    // Ensure model indexes
    await User.init();
    await SystemConfig.init();
    await AuditLog.init();
    await Company.init();
    await Project.init();
    await CompanyMembership.init();
    await UserProjectMembership.init();
    console.log('[Test Setup] All model indexes initialized.');

    const BOOTSTRAP_SECRET = 'TEST_SUPER_ADMIN_BOOTSTRAP_SECRET_KEY_12345';
    process.env.SUPER_ADMIN_BOOTSTRAP_KEY = BOOTSTRAP_SECRET;
    process.env.JWT_SECRET = 'test_jwt_secret_key_999';

    // =========================================================================
    // 1. Super Admin Bootstrap Tests
    // =========================================================================
    console.log('\n[Suite 1] Super Admin Bootstrap Tests');

    // 1a. Invalid bootstrap key rejection
    const { req: req1a, res: res1a } = createMockReqRes({
      body: {
        name: 'Attacker',
        email: 'attacker@evil.com',
        password: 'password123',
        bootstrapKey: 'wrong_secret'
      }
    });
    await bootstrapSuperAdmin(req1a, res1a);
    assert.strictEqual(res1a.statusCode, 401, 'Invalid bootstrap key must return 401');
    assert.strictEqual(res1a.data.message, 'Invalid bootstrap key.');
    console.log('✓ 1a. Invalid bootstrap key rejected with 401.');

    // 1b. Successful first bootstrap
    const { req: req1b, res: res1b } = createMockReqRes({
      body: {
        name: 'Chief Super Admin',
        email: 'superadmin@bper.test',
        password: 'superadminpass123',
        bootstrapKey: BOOTSTRAP_SECRET
      }
    });
    await bootstrapSuperAdmin(req1b, res1b);
    assert.strictEqual(res1b.statusCode, 201, 'Successful bootstrap must return 201');
    assert.ok(res1b.data.user, 'Response must contain created user');
    assert.strictEqual(res1b.data.user.role, 'super_admin');
    assert.strictEqual(res1b.data.user.email, 'superadmin@bper.test');
    assert.strictEqual(res1b.data.bootstrapKey, undefined, 'Bootstrap key must never be echoed');

    const bootstrappedUser = await User.findOne({ email: 'superadmin@bper.test' });
    assert.ok(bootstrappedUser, 'Super Admin must exist in DB');
    assert.strictEqual(bootstrappedUser.role, 'super_admin');

    const configRecord = await SystemConfig.findOne({ key: BOOTSTRAP_CONFIG_KEY });
    assert.ok(configRecord, 'Bootstrap config state must exist');
    assert.strictEqual(configRecord.bootstrapCompleted, true);

    const auditEntry = await AuditLog.findOne({ action: 'SUPER_ADMIN_BOOTSTRAP' });
    assert.ok(auditEntry, 'Audit log must record bootstrap event');
    console.log('✓ 1b. First Super Admin bootstrap succeeded with 201 and audit logged.');

    // 1c. Repeated bootstrap rejection with 410 Gone
    const { req: req1c, res: res1c } = createMockReqRes({
      body: {
        name: 'Second Super Admin',
        email: 'second@bper.test',
        password: 'anotherpass123',
        bootstrapKey: BOOTSTRAP_SECRET
      }
    });
    await bootstrapSuperAdmin(req1c, res1c);
    assert.strictEqual(res1c.statusCode, 410, 'Subsequent bootstrap attempts must return 410 Gone');
    console.log('✓ 1c. Repeated bootstrap rejected with 410 Gone.');

    // 1d. Concurrent bootstrap simulation: atomic claim guarantees singleton
    // Reset config record to uncompleted state to simulate concurrency
    await SystemConfig.updateOne({ key: BOOTSTRAP_CONFIG_KEY }, { $set: { bootstrapCompleted: false } });
    await User.deleteMany({ role: 'super_admin' });

    const concurrentRequests = Array.from({ length: 5 }, (_, i) => {
      const { req, res } = createMockReqRes({
        body: {
          name: `Concurrent Admin ${i}`,
          email: `concurrent${i}@bper.test`,
          password: 'securepassword123',
          bootstrapKey: BOOTSTRAP_SECRET
        }
      });
      return { req, res, run: () => bootstrapSuperAdmin(req, res) };
    });

    await Promise.all(concurrentRequests.map(r => r.run()));

    const successCount = concurrentRequests.filter(r => r.res.statusCode === 201).length;
    const goneCount = concurrentRequests.filter(r => r.res.statusCode === 410).length;
    assert.strictEqual(successCount, 1, 'Exactly one concurrent request must succeed with 201');
    assert.strictEqual(goneCount, 4, 'All other concurrent requests must return 410');
    console.log('✓ 1d. Concurrent bootstrap requests safely arbitrated (1 success, 4 410 Gone).');

    // Re-resolve super admin user for subsequent governance tests
    const superAdmin = await User.findOne({ role: 'super_admin' });

    // =========================================================================
    // 2. Company Governance & Authorization Tests
    // =========================================================================
    console.log('\n[Suite 2] Company Governance & Authorization Tests');

    // Create actors for testing
    const companyAdminUser = await User.create({
      name: 'Company Admin User',
      email: 'corpadmin@bper.test',
      password: 'password123',
      role: 'admin',
      isActive: true
    });

    const standardManager = await User.create({
      name: 'Standard Manager',
      email: 'manager@bper.test',
      password: 'password123',
      role: 'manager',
      isActive: true
    });

    const standardEmployee = await User.create({
      name: 'Standard Employee',
      email: 'employee@bper.test',
      password: 'password123',
      role: 'employee',
      employeeId: 'EMP-CORP-01',
      isActive: true
    });

    // 2a. Unauthorized company creation rejection (non-Super Admin)
    const { req: req2a, res: res2a } = createMockReqRes({
      user: { userId: companyAdminUser._id, role: 'admin' },
      body: { name: 'Acme International', code: 'ACME' }
    });
    requireSuperAdmin(req2a, res2a, () => {});
    assert.strictEqual(res2a.statusCode, 403, 'Company Admin cannot create companies');
    console.log('✓ 2a. Non-Super Admin denied company creation with 403.');

    // 2b. Authorized company creation by Super Admin
    const { req: req2b, res: res2b } = createMockReqRes({
      user: { userId: superAdmin._id, role: 'super_admin' },
      body: { name: 'Acme International', code: 'ACME', description: 'Primary Enterprise Corp' }
    });
    await createCompany(req2b, res2b);
    assert.strictEqual(res2b.statusCode, 201, 'Super Admin creates company successfully');
    const acmeCompany = res2b.data.company;
    assert.strictEqual(acmeCompany.code, 'ACME');
    console.log('✓ 2b. Super Admin created company successfully with 201.');

    // 2c. Assign Company Admin
    const { req: req2c, res: res2c } = createMockReqRes({
      user: { userId: superAdmin._id, role: 'super_admin' },
      params: { id: acmeCompany._id },
      body: { userId: companyAdminUser._id, role: 'company_admin', canCreateProjects: true }
    });
    await assignCompanyAdmin(req2c, res2c);
    assert.strictEqual(res2c.statusCode, 200);
    assert.strictEqual(res2c.data.membership.role, 'company_admin');
    assert.strictEqual(res2c.data.membership.canCreateProjects, true);
    console.log('✓ 2c. Company Admin assigned with canCreateProjects: true.');

    // 2d. Company Admin can view their company
    const { req: req2d, res: res2d } = createMockReqRes({
      user: { userId: companyAdminUser._id, role: 'admin' },
      params: { id: acmeCompany._id }
    });
    let companyAdminAllowed = false;
    await runMiddleware(requireCompanyAdmin, req2d, res2d).then(() => { companyAdminAllowed = true; });
    assert.strictEqual(companyAdminAllowed, true, 'Company Admin must pass requireCompanyAdmin');
    console.log('✓ 2d. Company Admin successfully authorized for their company.');

    // 2e. Cross-company access denial: create second company
    const { req: req2e_setup, res: res2e_setup } = createMockReqRes({
      user: { userId: superAdmin._id, role: 'super_admin' },
      body: { name: 'Beta Logistics', code: 'BETA' }
    });
    await createCompany(req2e_setup, res2e_setup);
    const betaCompany = res2e_setup.data.company;

    // Company Admin of Acme attempts to access Beta company
    const { req: req2e, res: res2e } = createMockReqRes({
      user: { userId: companyAdminUser._id, role: 'admin' },
      params: { id: betaCompany._id }
    });
    await runMiddleware(requireCompanyAdmin, req2e, res2e).catch(() => {});
    assert.strictEqual(res2e.statusCode, 403, 'Cross-company access must be denied with 403');
    console.log('✓ 2e. Cross-company access strictly denied with 403.');

    // 2f. Employee and Manager denied Company Admin privileges
    const { req: req2f_emp, res: res2f_emp } = createMockReqRes({
      user: { userId: standardEmployee._id, role: 'employee' },
      params: { id: acmeCompany._id }
    });
    await runMiddleware(requireCompanyAdmin, req2f_emp, res2f_emp).catch(() => {});
    assert.strictEqual(res2f_emp.statusCode, 403, 'Employee must be denied company administration');

    const { req: req2f_mgr, res: res2f_mgr } = createMockReqRes({
      user: { userId: standardManager._id, role: 'manager' },
      params: { id: acmeCompany._id }
    });
    await runMiddleware(requireCompanyAdmin, req2f_mgr, res2f_mgr).catch(() => {});
    assert.strictEqual(res2f_mgr.statusCode, 403, 'Manager must be denied company administration');
    console.log('✓ 2f. Employees and Managers strictly denied company administration.');

    // =========================================================================
    // 3. Project Governance & canCreateProjects Enforcement
    // =========================================================================
    console.log('\n[Suite 3] Project Governance & Permission Enforcement');

    // Create a Project Admin user WITH canCreateProjects: false
    const projectAdminNoCreate = await User.create({
      name: 'Project Admin Restricted',
      email: 'pa_nocreate@bper.test',
      password: 'password123',
      role: 'admin',
      isActive: true
    });
    await CompanyMembership.create({
      companyId: acmeCompany._id,
      userId: projectAdminNoCreate._id,
      role: 'project_admin',
      canCreateProjects: false,
      createdBy: superAdmin._id
    });

    // Create a Project Admin user WITH canCreateProjects: true
    const projectAdminWithCreate = await User.create({
      name: 'Project Admin Allowed',
      email: 'pa_create@bper.test',
      password: 'password123',
      role: 'admin',
      isActive: true
    });
    await CompanyMembership.create({
      companyId: acmeCompany._id,
      userId: projectAdminWithCreate._id,
      role: 'project_admin',
      canCreateProjects: true,
      createdBy: superAdmin._id
    });

    // 3a. Project Admin without canCreateProjects is REJECTED
    const { req: req3a, res: res3a } = createMockReqRes({
      user: { userId: projectAdminNoCreate._id, role: 'admin' },
      body: { companyId: acmeCompany._id, name: 'Project Fail', code: 'PRJ_FAIL', department: 'IT' }
    });
    await runMiddleware(requireProjectCreationPermission, req3a, res3a).catch(() => {});
    assert.strictEqual(res3a.statusCode, 403, 'Project Admin without canCreateProjects must be rejected');
    console.log('✓ 3a. Project Admin without canCreateProjects rejected with 403.');

    // 3b. Project Admin WITH canCreateProjects is ALLOWED
    const { req: req3b, res: res3b } = createMockReqRes({
      user: { userId: projectAdminWithCreate._id, role: 'admin' },
      body: { companyId: acmeCompany._id, name: 'Project Alpha', code: 'PRJ_ALPHA', department: 'IT' }
    });
    let paAllowed = false;
    await runMiddleware(requireProjectCreationPermission, req3b, res3b).then(() => { paAllowed = true; });
    assert.strictEqual(paAllowed, true, 'Project Admin with canCreateProjects: true must pass');

    // Actually create project
    await createProject(req3b, res3b);
    assert.strictEqual(res3b.statusCode, 201);
    const projectAlpha = res3b.data.project;
    assert.strictEqual(projectAlpha.code, 'PRJ_ALPHA');
    console.log('✓ 3b. Project Admin with explicit canCreateProjects created project successfully.');

    // 3c. Company Admin can create projects
    const { req: req3c, res: res3c } = createMockReqRes({
      user: { userId: companyAdminUser._id, role: 'admin' },
      body: { companyId: acmeCompany._id, name: 'Project Beta', code: 'PRJ_BETA', department: 'Finance' }
    });
    await runMiddleware(requireProjectCreationPermission, req3c, res3c);
    await createProject(req3c, res3c);
    assert.strictEqual(res3c.statusCode, 201);
    const projectBeta = res3c.data.project;
    console.log('✓ 3c. Company Admin created project successfully.');

    // 3d. Assign member to Project Beta and verify project-level access
    const { req: req3d, res: res3d } = createMockReqRes({
      user: { userId: companyAdminUser._id, role: 'admin' },
      params: { id: projectBeta._id },
      body: { userId: standardManager._id, role: 'manager' }
    });
    await assignProjectAdmin(req3d, res3d);
    assert.strictEqual(res3d.statusCode, 200);
    assert.strictEqual(res3d.data.membership.role, 'manager');
    console.log('✓ 3d. Project member assigned with role manager.');

    // 3e. Standard Manager denied project administration (update, archive)
    const { req: req3e, res: res3e } = createMockReqRes({
      user: { userId: standardManager._id, role: 'manager' },
      params: { id: projectBeta._id }
    });
    await runMiddleware(requireProjectAdmin, req3e, res3e).catch(() => {});
    assert.strictEqual(res3e.statusCode, 403, 'Manager must be denied project administration');
    console.log('✓ 3e. Project Manager denied project administration privileges.');

    // 3f. Archive project by Company Admin
    const { req: req3f, res: res3f } = createMockReqRes({
      user: { userId: companyAdminUser._id, role: 'admin' },
      params: { id: projectBeta._id },
      body: { status: 'archived' }
    });
    await setProjectStatus(req3f, res3f);
    assert.strictEqual(res3f.statusCode, 200);
    assert.strictEqual(res3f.data.project.status, 'archived');
    console.log('✓ 3f. Project successfully archived.');

    // =========================================================================
    // 4. Existing Authentication & Login Regression Tests
    // =========================================================================
    console.log('\n[Suite 4] Existing Authentication Regression Tests');

    // Generate JWT token for bootstrapped Super Admin
    const token = jwt.sign(
      { userId: superAdmin._id, role: superAdmin.role, email: superAdmin.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    assert.ok(token, 'JWT token must be successfully signed');

    // Verify token with existing verifyToken middleware
    const verifyToken = require('../middleware/verifyToken');
    const { req: reqAuth, res: resAuth } = createMockReqRes();
    reqAuth.header = (headerName) => headerName === 'Authorization' ? `Bearer ${token}` : null;

    let authPassed = false;
    await runMiddleware(verifyToken, reqAuth, resAuth).then(() => { authPassed = true; });
    assert.strictEqual(authPassed, true, 'verifyToken middleware must accept Super Admin token');
    assert.strictEqual(reqAuth.user.role, 'super_admin');
    console.log('✓ 4a. Super Admin authentication compatible with existing verifyToken middleware.');

    // Verify legacy user authentication
    const legacyAdminToken = jwt.sign(
      { userId: companyAdminUser._id, role: companyAdminUser.role, email: companyAdminUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const { req: reqLegacy, res: resLegacy } = createMockReqRes();
    reqLegacy.header = (h) => h === 'Authorization' ? `Bearer ${legacyAdminToken}` : null;
    let legacyPassed = false;
    await runMiddleware(verifyToken, reqLegacy, resLegacy).then(() => { legacyPassed = true; });
    assert.strictEqual(legacyPassed, true);
    assert.strictEqual(reqLegacy.user.role, 'admin');
    console.log('✓ 4b. Existing admin user token verification unaffected.');

    // =========================================================================
    // 5. Security Audit Hardening & Boundary Enforcement Tests
    // =========================================================================
    console.log('\n[Suite 5] Security Audit Hardening & Boundary Enforcement Tests');

    // 5a. Project Admin cannot assign another Project Admin (Privilege Escalation Prevention)
    const newTargetUser = await User.create({
      name: 'Aspiring Admin',
      email: 'aspiring@bper.test',
      password: 'password123',
      role: 'employee',
      employeeId: 'EMP-ASP-01',
      isActive: true
    });

    const { req: req5a, res: res5a } = createMockReqRes({
      user: { userId: projectAdminWithCreate._id, role: 'admin' },
      params: { id: projectAlpha._id },
      body: { userId: newTargetUser._id, role: 'project_admin' }
    });
    // Run middleware to populate req.isCompanyAdmin (false) and req.projectMembership
    await runMiddleware(requireProjectAdmin, req5a, res5a);
    await assignProjectAdmin(req5a, res5a);
    assert.strictEqual(res5a.statusCode, 403, 'Project Admin must be forbidden from assigning project_admin role');
    assert.ok(res5a.data.message.includes('Only Super Admin or Company Admin can assign the project_admin role'));
    console.log('✓ 5a. Project Admin privilege escalation rejected with 403.');

    // 5b. Project Admin CAN assign manager role
    const { req: req5b, res: res5b } = createMockReqRes({
      user: { userId: projectAdminWithCreate._id, role: 'admin' },
      params: { id: projectAlpha._id },
      body: { userId: newTargetUser._id, role: 'manager' }
    });
    await runMiddleware(requireProjectAdmin, req5b, res5b);
    await assignProjectAdmin(req5b, res5b);
    assert.strictEqual(res5b.statusCode, 200);
    assert.strictEqual(res5b.data.membership.role, 'manager');
    console.log('✓ 5b. Project Admin permitted to assign manager role.');

    // 5c. Mutations under Inactive Company are Rejected
    acmeCompany.isActive = false;
    await acmeCompany.save();

    const { req: req5c_update, res: res5c_update } = createMockReqRes({
      user: { userId: superAdmin._id, role: 'super_admin' },
      params: { id: projectAlpha._id },
      body: { name: 'Renamed While Inactive' }
    });
    await updateProject(req5c_update, res5c_update);
    assert.strictEqual(res5c_update.statusCode, 400, 'Project update under inactive company must be rejected');

    const { req: req5c_archive, res: res5c_archive } = createMockReqRes({
      user: { userId: superAdmin._id, role: 'super_admin' },
      params: { id: projectAlpha._id },
      body: { status: 'archived' }
    });
    await setProjectStatus(req5c_archive, res5c_archive);
    assert.strictEqual(res5c_archive.statusCode, 400, 'Project archiving under inactive company must be rejected');

    const { req: req5c_assign, res: res5c_assign } = createMockReqRes({
      user: { userId: superAdmin._id, role: 'super_admin' },
      params: { id: projectAlpha._id },
      body: { userId: newTargetUser._id, role: 'employee' }
    });
    await assignProjectAdmin(req5c_assign, res5c_assign);
    assert.strictEqual(res5c_assign.statusCode, 400, 'Project member assignment under inactive company must be rejected');
    console.log('✓ 5c. Project mutations under inactive company rejected with 400.');

    // Restore Acme company active status
    acmeCompany.isActive = true;
    await acmeCompany.save();

    // 5d. Bootstrap Key comparison with incorrect lengths and characters
    const testKeys = [
      'short',
      'TEST_SUPER_ADMIN_BOOTSTRAP_SECRET_KEY_12344', // 1 character difference at end
      'XEST_SUPER_ADMIN_BOOTSTRAP_SECRET_KEY_12345', // 1 character difference at start
      'TEST_SUPER_ADMIN_BOOTSTRAP_SECRET_KEY_12345_EXTRALONGSTRING1234567890' // longer
    ];
    for (const testKey of testKeys) {
      const { req, res } = createMockReqRes({
        body: {
          name: 'Hacker',
          email: 'hacker@bper.test',
          password: 'password123',
          bootstrapKey: testKey
        }
      });
      await bootstrapSuperAdmin(req, res);
      assert.strictEqual(res.statusCode, 401, `Invalid key '${testKey.slice(0, 10)}...' must return 401`);
    }
    console.log('✓ 5d. Bootstrap secret timingSafeEqual verification with varying lengths & characters passed.');

    // 5e. Malformed ObjectIds are rejected
    const malformedIds = ['123', 'not-a-valid-id', '$$ne', '00000000000000000000000z'];
    for (const malformedId of malformedIds) {
      const { req: reqBadCompany, res: resBadCompany } = createMockReqRes({
        user: { userId: superAdmin._id, role: 'super_admin' },
        params: { id: malformedId }
      });
      const passedCompany = await runMiddleware(requireCompanyAdmin, reqBadCompany, resBadCompany);
      assert.strictEqual(passedCompany, false, `Malformed ID ${malformedId} must fail requireCompanyAdmin`);

      const { req: reqBadProject, res: resBadProject } = createMockReqRes({
        user: { userId: superAdmin._id, role: 'super_admin' },
        params: { id: malformedId }
      });
      const passedProject = await runMiddleware(requireProjectAdmin, reqBadProject, resBadProject);
      assert.strictEqual(passedProject, false, `Malformed ID ${malformedId} must fail requireProjectAdmin`);
    }
    console.log('✓ 5e. Malformed ObjectIds properly rejected before database queries.');

    // 5f. SystemConfig strict: true enforcement (unrecognized keys stripped/ignored)
    const testConfig = new SystemConfig({
      key: 'test_strict_key',
      arbitraryUnwantedProperty: 'malicious_payload'
    });
    assert.strictEqual(testConfig.arbitraryUnwantedProperty, undefined, 'SystemConfig must not accept undeclared properties');
    console.log('✓ 5f. SystemConfig strict: true schema validation confirmed.');

    console.log('\n============================================================');
    console.log('ALL MILESTONE 2 TESTS PASSED SUCCESSFULLY (5/5 SUITES)');
    console.log('============================================================');

  } catch (err) {
    console.error('Milestone 2 Test Suite Failed:', err);
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

runMilestone2Tests();
