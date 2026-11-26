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

// Controllers & Middleware
const { listCompanies, createCompany, assignCompanyAdmin } = require('../controllers/companyController');
const { createProject, listMyAuthorizedProjects, listCompanyProjects } = require('../controllers/projectController');
const { resolveTenantScope } = require('../middleware/tenantContext');

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

async function runMilestone4FrontendTests() {
  console.log('--- Starting Milestone 4 Frontend Multi-Company Integration Test Suite ---');
  let mongod;

  try {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    console.log('[Test Setup] Connected to isolated in-memory MongoDB.');

    await User.init();
    await Company.init();
    await Project.init();
    await CompanyMembership.init();
    await UserProjectMembership.init();

    // 1. Create Super Admin
    const superAdmin = await User.create({
      name: 'Super Admin User',
      email: 'superadmin@bper.test',
      password: 'password123',
      role: 'super_admin',
      isActive: true
    });

    // 2. Super Admin creates Company 1 (Acme Corp) and Company 2 (Global Corp)
    const { req: reqC1, res: resC1 } = createMockReqRes({
      user: { userId: superAdmin._id, role: 'super_admin', email: superAdmin.email },
      body: { name: 'Acme Corporation', code: 'ACME', description: 'Acme Test' }
    });
    await createCompany(reqC1, resC1);
    assert.strictEqual(resC1.statusCode, 201);
    const companyAcme = resC1.data.company;

    const { req: reqC2, res: resC2 } = createMockReqRes({
      user: { userId: superAdmin._id, role: 'super_admin', email: superAdmin.email },
      body: { name: 'Global Logistics', code: 'GLOG', description: 'Global Test' }
    });
    await createCompany(reqC2, resC2);
    assert.strictEqual(resC2.statusCode, 201);
    const companyGlobal = resC2.data.company;

    console.log('✓ 1. Super Admin created multiple companies (ACME and GLOG).');

    // 3. Super Admin creates projects under each company
    const { req: reqP1, res: resP1 } = createMockReqRes({
      user: { userId: superAdmin._id, role: 'super_admin', email: superAdmin.email },
      body: { companyId: companyAcme._id, name: 'Acme Finance', code: 'ACME_FIN', department: 'Finance' }
    });
    await createProject(reqP1, resP1);
    assert.strictEqual(resP1.statusCode, 201);
    const projectAcmeFin = resP1.data.project;

    const { req: reqP2, res: resP2 } = createMockReqRes({
      user: { userId: superAdmin._id, role: 'super_admin', email: superAdmin.email },
      body: { companyId: companyGlobal._id, name: 'Global Supply', code: 'GLO_SUP', department: 'Logistics' }
    });
    await createProject(reqP2, resP2);
    assert.strictEqual(resP2.statusCode, 201);
    const projectGlobalSup = resP2.data.project;

    console.log('✓ 2. Super Admin created projects under ACME and GLOG.');

    // 4. Create Company Admin for Acme Corp
    const adminAcme = await User.create({
      name: 'Acme Admin',
      email: 'admin@acme.test',
      password: 'password123',
      role: 'admin',
      isActive: true
    });
    await CompanyMembership.create({
      companyId: companyAcme._id,
      userId: adminAcme._id,
      role: 'company_admin',
      canCreateProjects: true,
      isActive: true,
      createdBy: superAdmin._id
    });

    // 5. Test /api/projects/my for Acme Admin: should see Acme project, NEVER Global project
    const { req: reqMyProjectsAcme, res: resMyProjectsAcme } = createMockReqRes({
      user: { userId: adminAcme._id, role: 'admin', email: adminAcme.email }
    });
    await listMyAuthorizedProjects(reqMyProjectsAcme, resMyProjectsAcme);
    assert.strictEqual(resMyProjectsAcme.statusCode, 200);
    assert.strictEqual(resMyProjectsAcme.data.projects.length, 1);
    assert.strictEqual(resMyProjectsAcme.data.projects[0]._id.toString(), projectAcmeFin._id.toString());
    assert.strictEqual(resMyProjectsAcme.data.projects[0].companyId._id.toString(), companyAcme._id.toString());
    console.log('✓ 3. Company Admin /api/projects/my strictly returns only Acme projects.');

    // 6. Test /api/projects/my for Super Admin: sees all projects across companies
    const { req: reqMyProjectsSuper, res: resMyProjectsSuper } = createMockReqRes({
      user: { userId: superAdmin._id, role: 'super_admin', email: superAdmin.email }
    });
    await listMyAuthorizedProjects(reqMyProjectsSuper, resMyProjectsSuper);
    assert.strictEqual(resMyProjectsSuper.statusCode, 200);
    assert.strictEqual(resMyProjectsSuper.data.projects.length, 2);
    console.log('✓ 4. Super Admin /api/projects/my returns all projects across all companies.');

    // 7. Test Tenant Context Switch & Authorization
    // Acme Admin accesses with Acme headers -> PASS
    const { req: reqTenantPass, res: resTenantPass } = createMockReqRes({
      user: { userId: adminAcme._id, role: 'admin', email: adminAcme.email },
      headers: { 'x-company-id': companyAcme._id.toString(), 'x-project-id': projectAcmeFin._id.toString() }
    });
    const passed = await runMiddleware(resolveTenantScope({ required: true }), reqTenantPass, resTenantPass);
    assert.strictEqual(passed, true);
    assert.strictEqual(reqTenantPass.tenantScope.projectId.toString(), projectAcmeFin._id.toString());
    console.log('✓ 5. Authorized project context switch passes tenant validation.');

    // Acme Admin attempts to tamper headers with Global Corp project -> FORBIDDEN 403
    const { req: reqTenantTamper, res: resTenantTamper } = createMockReqRes({
      user: { userId: adminAcme._id, role: 'admin', email: adminAcme.email },
      headers: { 'x-company-id': companyGlobal._id.toString(), 'x-project-id': projectGlobalSup._id.toString() }
    });
    const blocked = await runMiddleware(resolveTenantScope({ required: true }), reqTenantTamper, resTenantTamper);
    assert.strictEqual(blocked, false);
    assert.strictEqual(resTenantTamper.statusCode, 403);
    console.log('✓ 6. Tampered cross-company project header strictly rejected with 403 Forbidden.');

    console.log('\n============================================================');
    console.log('ALL MILESTONE 4 FRONTEND & CONTEXT TESTS PASSED (6/6)');
    console.log('============================================================');

  } catch (err) {
    console.error('Milestone 4 Test Failed:', err);
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

runMilestone4FrontendTests();
