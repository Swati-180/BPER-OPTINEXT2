/**
 * Milestone 1 Automated Test Suite: Multi-Tenant Database Foundation
 *
 * Validates:
 * 1. Schema field definitions, validations, enums, trims, and defaults.
 * 2. Uniqueness constraints on Company.code, Project (companyId + code).
 * 3. Partial unique index on CompanyMembership (companyId + userId, isActive: true).
 * 4. Partial unique index on UserProjectMembership (projectId + userId, isActive: true).
 * 5. Partial unique index on UserProjectMembership (projectId + employeeId, isActive: true, employeeId non-empty).
 * 6. Non-destructive backfill logic execution against isolated mock database.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Company = require('../models/Company');
const Project = require('../models/Project');
const CompanyMembership = require('../models/CompanyMembership');
const UserProjectMembership = require('../models/UserProjectMembership');
const User = require('../models/User');
const { backfillDefaultTenant } = require('../scripts/backfill_default_tenant');

async function runMilestone1Tests() {
  console.log('--- Starting Milestone 1 Multi-Tenant Schema Test Suite ---');
  let mongod;

  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log('[Test Setup] Connected to isolated in-memory MongoDB.');

    // Ensure indexes are built
    await Company.init();
    await Project.init();
    await CompanyMembership.init();
    await UserProjectMembership.init();
    await User.init();
    console.log('[Test Setup] All model indexes initialized.');

    const adminUser = await User.create({
      name: 'Test Administrator',
      email: 'admin@bper.test',
      password: 'password123',
      role: 'admin',
      isActive: true
    });

    const standardUser1 = await User.create({
      name: 'Employee One',
      email: 'emp1@bper.test',
      password: 'password123',
      role: 'employee',
      employeeId: 'EMP-001',
      isActive: true
    });

    const standardUser2 = await User.create({
      name: 'Employee Two',
      email: 'emp2@bper.test',
      password: 'password123',
      role: 'employee',
      employeeId: 'EMP-002',
      isActive: true
    });

    const managerUser = await User.create({
      name: 'Manager User',
      email: 'mgr@bper.test',
      password: 'password123',
      role: 'manager',
      employeeId: 'MGR-001',
      isActive: true
    });

    // Test 1: Company Creation and Code Uniqueness
    console.log('\n[Test 1] Testing Company Model & Code Uniqueness...');
    const compA = await Company.create({
      name: 'Acme Holdings Corp',
      code: 'acme', // should be uppercase trimmed
      createdBy: adminUser._id
    });
    assert.strictEqual(compA.code, 'ACME', 'Company code must be normalized to uppercase');
    assert.strictEqual(compA.isActive, true, 'Company must be active by default');

    let duplicateCompanyError = false;
    try {
      await Company.create({
        name: 'Acme Duplicate',
        code: 'ACME',
        createdBy: adminUser._id
      });
    } catch (err) {
      duplicateCompanyError = err.code === 11000;
    }
    assert.strictEqual(duplicateCompanyError, true, 'Duplicate Company code must throw E11000');
    console.log('✓ Test 1 Passed: Company schema validations and uniqueness confirmed.');

    // Test 2: Project Creation and Scoped Code Uniqueness
    console.log('\n[Test 2] Testing Project Model & Scoped Code Uniqueness...');
    const projA1 = await Project.create({
      companyId: compA._id,
      name: 'Finance Transformation',
      code: 'fin_tx',
      department: 'Finance',
      createdBy: adminUser._id
    });
    assert.strictEqual(projA1.code, 'FIN_TX', 'Project code must be uppercase');
    assert.strictEqual(projA1.status, 'active', 'Project status defaults to active');

    // Create another company
    const compB = await Company.create({
      name: 'Beta Global Industries',
      code: 'BETA',
      createdBy: adminUser._id
    });

    // Same project code in DIFFERENT company must SUCCEED
    const projB1 = await Project.create({
      companyId: compB._id,
      name: 'Finance Transformation Beta',
      code: 'FIN_TX',
      department: 'Finance',
      createdBy: adminUser._id
    });
    assert.strictEqual(projB1.code, 'FIN_TX');

    // Same project code in SAME company must FAIL with E11000
    let duplicateProjectError = false;
    try {
      await Project.create({
        companyId: compA._id,
        name: 'Finance Duplicate in Acme',
        code: 'FIN_TX',
        department: 'Finance',
        createdBy: adminUser._id
      });
    } catch (err) {
      duplicateProjectError = err.code === 11000;
    }
    assert.strictEqual(duplicateProjectError, true, 'Duplicate Project code within same company must throw E11000');
    console.log('✓ Test 2 Passed: Scoped Project code uniqueness confirmed.');

    // Test 3: CompanyMembership & Active Partial Uniqueness
    console.log('\n[Test 3] Testing CompanyMembership & Partial Uniqueness...');
    const cm1 = await CompanyMembership.create({
      companyId: compA._id,
      userId: standardUser1._id,
      role: 'company_admin',
      canCreateProjects: true,
      createdBy: adminUser._id
    });
    assert.strictEqual(cm1.role, 'company_admin');
    assert.strictEqual(cm1.canCreateProjects, true);

    // Duplicate active membership must fail
    let duplicateCmError = false;
    try {
      await CompanyMembership.create({
        companyId: compA._id,
        userId: standardUser1._id,
        role: 'project_admin',
        createdBy: adminUser._id
      });
    } catch (err) {
      duplicateCmError = err.code === 11000;
    }
    assert.strictEqual(duplicateCmError, true, 'Active duplicate CompanyMembership must throw E11000');

    // Deactivating first membership permits creating new active record
    cm1.isActive = false;
    cm1.deactivatedAt = new Date();
    await cm1.save();

    const cm1Reactivated = await CompanyMembership.create({
      companyId: compA._id,
      userId: standardUser1._id,
      role: 'project_admin',
      canCreateProjects: false,
      createdBy: adminUser._id
    });
    assert.strictEqual(cm1Reactivated.role, 'project_admin');
    console.log('✓ Test 3 Passed: CompanyMembership lifecycle and partial unique index confirmed.');

    // Test 4: UserProjectMembership & EmployeeId Partial Uniqueness
    console.log('\n[Test 4] Testing UserProjectMembership & EmployeeId Constraints...');
    const upm1 = await UserProjectMembership.create({
      companyId: compA._id,
      projectId: projA1._id,
      userId: standardUser1._id,
      role: 'employee',
      employeeId: 'EMP-001',
      createdBy: adminUser._id
    });
    assert.strictEqual(upm1.role, 'employee');

    // User cannot have duplicate active membership in the SAME project
    let duplicateUpmUserError = false;
    try {
      await UserProjectMembership.create({
        companyId: compA._id,
        projectId: projA1._id,
        userId: standardUser1._id,
        role: 'manager',
        createdBy: adminUser._id
      });
    } catch (err) {
      duplicateUpmUserError = err.code === 11000;
    }
    assert.strictEqual(duplicateUpmUserError, true, 'Duplicate active project membership for same user must throw E11000');

    // Distinct user cannot claim same employeeId in the SAME project
    let duplicateUpmEmpError = false;
    try {
      await UserProjectMembership.create({
        companyId: compA._id,
        projectId: projA1._id,
        userId: standardUser2._id,
        role: 'employee',
        employeeId: 'EMP-001', // conflict with upm1
        createdBy: adminUser._id
      });
    } catch (err) {
      duplicateUpmEmpError = err.code === 11000;
    }
    assert.strictEqual(duplicateUpmEmpError, true, 'Duplicate employeeId in same active project must throw E11000');

    // Null or empty employeeId does NOT collide (sparse partial unique index)
    const upmRoster1 = await UserProjectMembership.create({
      companyId: compA._id,
      projectId: projA1._id,
      userId: new mongoose.Types.ObjectId(),
      role: 'employee',
      employeeId: null,
      createdBy: adminUser._id
    });
    const upmRoster2 = await UserProjectMembership.create({
      companyId: compA._id,
      projectId: projA1._id,
      userId: new mongoose.Types.ObjectId(),
      role: 'employee',
      employeeId: '', // should trim to null
      createdBy: adminUser._id
    });
    assert.strictEqual(upmRoster2.employeeId, null);
    console.log('✓ Test 4 Passed: UserProjectMembership scoped uniqueness & partial employeeId index confirmed.');

    // Test 5: Non-Destructive Backfill Simulation & Permission Boundary Enforcement
    console.log('\n[Test 5] Testing Non-Destructive Tenant Backfill & Permission Boundaries...');
    // Run backfill with dryRun: true
    const dryRunResult = await backfillDefaultTenant(mongoose.connection, { dryRun: true });
    assert.strictEqual(dryRunResult.dryRun, true);
    // In dry run, only admin users should be slated for CompanyMembership (adminUser = 1)
    assert.strictEqual(dryRunResult.createdCompanyMemberships, 1, 'Dry run should only identify admin users for company membership');
    // All 4 active users (1 admin, 1 manager, 2 employees) should be slated for ProjectMembership
    assert.strictEqual(dryRunResult.createdProjectMemberships, 4, 'Dry run should identify all active users for project membership');

    // Run actual backfill against in-memory DB
    const liveRunResult = await backfillDefaultTenant(mongoose.connection, { dryRun: false });
    assert.strictEqual(liveRunResult.dryRun, false);
    assert.strictEqual(liveRunResult.createdCompanyMemberships, 1);
    assert.strictEqual(liveRunResult.createdProjectMemberships, 4);

    // Verify Default Company and Project exist
    const defaultComp = await Company.findOne({ code: 'DEFAULT_CORP' });
    assert.ok(defaultComp, 'Default company must be created');
    const defaultProj = await Project.findOne({ code: 'CORE_OPS' });
    assert.ok(defaultProj, 'Default project must be created');

    // 5a. Rigorous Verification of Company Membership:
    // ONLY adminUser has a CompanyMembership record
    const compMemberships = await CompanyMembership.find({ companyId: defaultComp._id });
    assert.strictEqual(compMemberships.length, 1, 'Only admin user must have CompanyMembership');
    assert.strictEqual(compMemberships[0].userId.toString(), adminUser._id.toString());
    assert.strictEqual(compMemberships[0].role, 'company_admin');
    assert.strictEqual(compMemberships[0].canCreateProjects, true);

    // Employees and Manager MUST NOT have any CompanyMembership in defaultComp
    const emp1CompMem = await CompanyMembership.findOne({ companyId: defaultComp._id, userId: standardUser1._id });
    assert.strictEqual(emp1CompMem, null, 'Employee 1 must not have CompanyMembership in defaultComp');
    const emp2CompMem = await CompanyMembership.findOne({ companyId: defaultComp._id, userId: standardUser2._id });
    assert.strictEqual(emp2CompMem, null, 'Employee 2 must not have CompanyMembership in defaultComp');
    const mgrCompMem = await CompanyMembership.findOne({ companyId: defaultComp._id, userId: managerUser._id });
    assert.strictEqual(mgrCompMem, null, 'Manager must not have CompanyMembership in defaultComp');

    // 5b. Rigorous Verification of UserProjectMembership:
    const adminProjMem = await UserProjectMembership.findOne({ projectId: defaultProj._id, userId: adminUser._id });
    assert.ok(adminProjMem, 'Admin must have UserProjectMembership');
    assert.strictEqual(adminProjMem.role, 'project_admin');

    const mgrProjMem = await UserProjectMembership.findOne({ projectId: defaultProj._id, userId: managerUser._id });
    assert.ok(mgrProjMem, 'Manager must have UserProjectMembership');
    assert.strictEqual(mgrProjMem.role, 'manager');

    const emp1ProjMem = await UserProjectMembership.findOne({ projectId: defaultProj._id, userId: standardUser1._id });
    assert.ok(emp1ProjMem, 'Employee 1 must have UserProjectMembership');
    assert.strictEqual(emp1ProjMem.role, 'employee');
    assert.strictEqual(emp1ProjMem.employeeId, 'EMP-001');

    const emp2ProjMem = await UserProjectMembership.findOne({ projectId: defaultProj._id, userId: standardUser2._id });
    assert.ok(emp2ProjMem, 'Employee 2 must have UserProjectMembership');
    assert.strictEqual(emp2ProjMem.role, 'employee');
    assert.strictEqual(emp2ProjMem.employeeId, 'EMP-002');

    // Idempotent second run must create 0 additional records
    const idempotentRun = await backfillDefaultTenant(mongoose.connection, { dryRun: false });
    assert.strictEqual(idempotentRun.createdCompanyMemberships, 0, 'Idempotent run must not recreate company memberships');
    assert.strictEqual(idempotentRun.createdProjectMemberships, 0, 'Idempotent run must not recreate project memberships');

    // Re-verify counts after idempotent run
    const totalCompMems = await CompanyMembership.countDocuments({ companyId: defaultComp._id });
    assert.strictEqual(totalCompMems, 1, 'Total CompanyMembership count must remain exactly 1');
    const totalProjMems = await UserProjectMembership.countDocuments({ projectId: defaultProj._id });
    assert.strictEqual(totalProjMems, 4, 'Total UserProjectMembership count must remain exactly 4');

    console.log('✓ Test 5 Passed: Non-destructive backfill verified idempotent, employee administrative privilege isolation verified.');

    console.log('\n============================================================');
    console.log('ALL MILESTONE 1 TESTS PASSED SUCCESSFULLY (5/5 SUITES)');
    console.log('============================================================');

  } catch (error) {
    console.error('Milestone 1 Test Suite Failed:', error);
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

runMilestone1Tests();
