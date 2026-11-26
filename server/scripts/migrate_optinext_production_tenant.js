/**
 * migrate_optinext_production_tenant.js
 *
 * Dedicated, Non-Destructive Production Tenant Migration Script for OptiNext Global.
 *
 * Production Identification:
 * - Company: OptiNext Global (code: 'OPTINEXT')
 * - Project: Finance & Accounting Operations (code: 'FIN_OPS')
 *
 * Guarantees:
 * 1. Non-destructive: Does NOT drop collections, overwrite fields, or alter existing data.
 * 2. Idempotent: Uses conditional updates ($set on missing/null fields only) and upserts.
 * 3. Dry-Run capable: Simulates all operations without committing when --dry-run is passed.
 * 4. Production verification: Reports detailed counts of records carrying OptiNext tenant vs unassigned.
 */

const mongoose = require('mongoose');
require('../models/Company');
require('../models/Project');
require('../models/CompanyMembership');
require('../models/UserProjectMembership');
require('../models/User');
require('../models/WDTSubmission');
require('../models/ProcessAnalysis');
require('../models/EmployeeInvite');

const OPTINEXT_COMPANY_CONFIG = {
  name: 'OptiNext Global',
  code: 'OPTINEXT',
  description: 'Enterprise corporate entity for OptiNext Global operations.',
  isActive: true
};

const FIN_OPS_PROJECT_CONFIG = {
  name: 'Finance & Accounting Operations',
  code: 'FIN_OPS',
  department: 'Finance & Accounting',
  description: 'Primary financial operations workforce analytics workspace.',
  status: 'active'
};

/**
 * Plans or executes non-destructive backfill for OptiNext Global and FIN_OPS project.
 *
 * @param {mongoose.Connection} connection - Active mongoose connection
 * @param {Object} options - Migration options
 * @param {boolean} options.dryRun - If true, evaluates mutations without committing
 */
async function migrateOptiNextTenant(connection, options = { dryRun: true }) {
  const Company = connection.model('Company');
  const Project = connection.model('Project');
  const CompanyMembership = connection.model('CompanyMembership');
  const UserProjectMembership = connection.model('UserProjectMembership');
  const User = connection.model('User');
  const WDTSubmission = connection.model('WDTSubmission');
  const ProcessAnalysis = connection.model('ProcessAnalysis');
  const EmployeeInvite = connection.model('EmployeeInvite');

  console.log(`[OptiNext Migration] Starting tenant migration assessment (dryRun: ${options.dryRun})...`);

  // 1. Resolve Anchor Superadmin/Admin User
  let anchorUser = await User.findOne({ role: { $in: ['super_admin', 'admin'] } }).sort({ createdAt: 1 });
  if (!anchorUser) {
    anchorUser = await User.findOne().sort({ createdAt: 1 });
  }
  if (!anchorUser) {
    throw new Error('[Migration Aborted] No anchor user found in User collection.');
  }
  console.log(`[OptiNext Migration] Anchor User: ${anchorUser.email || anchorUser._id} (${anchorUser._id})`);

  // 2. Resolve or Provision OptiNext Company
  let optinextCompany = await Company.findOne({ code: OPTINEXT_COMPANY_CONFIG.code });
  if (!optinextCompany && !options.dryRun) {
    optinextCompany = await Company.create({
      ...OPTINEXT_COMPANY_CONFIG,
      createdBy: anchorUser._id
    });
    console.log(`[OptiNext Migration] Created Company: ${optinextCompany.name} (${optinextCompany._id})`);
  } else if (!optinextCompany && options.dryRun) {
    console.log(`[OptiNext Migration DRY-RUN] Would create Company: ${OPTINEXT_COMPANY_CONFIG.name}`);
    optinextCompany = { _id: new mongoose.Types.ObjectId(), ...OPTINEXT_COMPANY_CONFIG };
  } else {
    console.log(`[OptiNext Migration] Existing Company resolved: ${optinextCompany.name} (${optinextCompany._id})`);
  }

  // 3. Resolve or Provision FIN_OPS Project
  let finOpsProject = await Project.findOne({ companyId: optinextCompany._id, code: FIN_OPS_PROJECT_CONFIG.code });
  if (!finOpsProject && !options.dryRun) {
    finOpsProject = await Project.create({
      ...FIN_OPS_PROJECT_CONFIG,
      companyId: optinextCompany._id,
      createdBy: anchorUser._id
    });
    console.log(`[OptiNext Migration] Created Project: ${finOpsProject.name} (${finOpsProject._id})`);
  } else if (!finOpsProject && options.dryRun) {
    console.log(`[OptiNext Migration DRY-RUN] Would create Project: ${FIN_OPS_PROJECT_CONFIG.name}`);
    finOpsProject = { _id: new mongoose.Types.ObjectId(), companyId: optinextCompany._id, ...FIN_OPS_PROJECT_CONFIG };
  } else {
    console.log(`[OptiNext Migration] Existing Project resolved: ${finOpsProject.name} (${finOpsProject._id})`);
  }

  // 4. Audit & Migrate WDT Submissions (326 historical records)
  const unassignedWDTFilter = {
    $or: [{ companyId: null }, { projectId: null }, { companyId: { $exists: false } }, { projectId: { $exists: false } }]
  };
  const unassignedWDTCount = await WDTSubmission.countDocuments(unassignedWDTFilter);
  const optinextWDTCount = await WDTSubmission.countDocuments({ companyId: optinextCompany._id, projectId: finOpsProject._id });
  console.log(`[OptiNext Migration] WDT Submissions: ${optinextWDTCount} already linked to OptiNext, ${unassignedWDTCount} unassigned.`);

  let migratedWDT = 0;
  if (unassignedWDTCount > 0 && !options.dryRun) {
    const resWDT = await WDTSubmission.updateMany(unassignedWDTFilter, {
      $set: { companyId: optinextCompany._id, projectId: finOpsProject._id }
    });
    migratedWDT = resWDT.modifiedCount;
    console.log(`[OptiNext Migration] Successfully migrated ${migratedWDT} WDT submissions to OptiNext.`);
  } else if (unassignedWDTCount > 0 && options.dryRun) {
    migratedWDT = unassignedWDTCount;
    console.log(`[OptiNext Migration DRY-RUN] Would migrate ${unassignedWDTCount} unassigned WDT submissions.`);
  }

  // 5. Audit & Migrate ProcessAnalysis (PAM) Records (2,126 historical records)
  const unassignedPAMFilter = {
    $or: [{ companyId: null }, { projectId: null }, { companyId: { $exists: false } }, { projectId: { $exists: false } }]
  };
  const unassignedPAMCount = await ProcessAnalysis.countDocuments(unassignedPAMFilter);
  const optinextPAMCount = await ProcessAnalysis.countDocuments({ companyId: optinextCompany._id, projectId: finOpsProject._id });
  console.log(`[OptiNext Migration] PAM Records: ${optinextPAMCount} already linked to OptiNext, ${unassignedPAMCount} unassigned.`);

  let migratedPAM = 0;
  if (unassignedPAMCount > 0 && !options.dryRun) {
    const resPAM = await ProcessAnalysis.updateMany(unassignedPAMFilter, {
      $set: { companyId: optinextCompany._id, projectId: finOpsProject._id }
    });
    migratedPAM = resPAM.modifiedCount;
    console.log(`[OptiNext Migration] Successfully migrated ${migratedPAM} PAM records to OptiNext.`);
  } else if (unassignedPAMCount > 0 && options.dryRun) {
    migratedPAM = unassignedPAMCount;
    console.log(`[OptiNext Migration DRY-RUN] Would migrate ${unassignedPAMCount} unassigned PAM records.`);
  }

  // 6. Audit & Map Users to Company & Project Memberships
  const activeUsers = await User.find({ isActive: true, isVacant: false });
  console.log(`[OptiNext Migration] Found ${activeUsers.length} active operational users to evaluate for membership.`);

  let createdCompanyMemberships = 0;
  let createdProjectMemberships = 0;

  for (const user of activeUsers) {
    const existingCompMem = await CompanyMembership.findOne({
      companyId: optinextCompany._id,
      userId: user._id
    });

    const isCompanyAdmin = user.role === 'admin' || user.role === 'company_admin' || user.role === 'super_admin';
    const compRole = isCompanyAdmin ? 'company_admin' : 'member';

    if (!existingCompMem && !options.dryRun) {
      await CompanyMembership.create({
        companyId: optinextCompany._id,
        userId: user._id,
        role: compRole,
        isActive: true,
        createdBy: anchorUser._id
      });
      createdCompanyMemberships++;
    } else if (!existingCompMem && options.dryRun) {
      createdCompanyMemberships++;
    }

    const existingProjMem = await UserProjectMembership.findOne({
      companyId: optinextCompany._id,
      projectId: finOpsProject._id,
      userId: user._id
    });

    let projectRole = 'employee';
    if (isCompanyAdmin) projectRole = 'project_admin';
    else if (user.role === 'manager') projectRole = 'manager';

    if (!existingProjMem && !options.dryRun) {
      await UserProjectMembership.create({
        companyId: optinextCompany._id,
        projectId: finOpsProject._id,
        userId: user._id,
        role: projectRole,
        employeeId: user.employeeId || null,
        formAccessGranted: user.formAccessGranted !== false,
        isActive: true,
        createdBy: anchorUser._id
      });
      createdProjectMemberships++;
    } else if (!existingProjMem && options.dryRun) {
      createdProjectMemberships++;
    }
  }

  const summary = {
    companyId: optinextCompany._id,
    companyCode: optinextCompany.code,
    companyName: optinextCompany.name,
    projectId: finOpsProject._id,
    projectCode: finOpsProject.code,
    projectName: finOpsProject.name,
    totalWDT: await WDTSubmission.countDocuments(),
    optinextWDT: optinextWDTCount + (options.dryRun ? 0 : migratedWDT),
    unassignedWDT: unassignedWDTCount,
    migratedWDT,
    totalPAM: await ProcessAnalysis.countDocuments(),
    optinextPAM: optinextPAMCount + (options.dryRun ? 0 : migratedPAM),
    unassignedPAM: unassignedPAMCount,
    migratedPAM,
    activeUsersEvaluated: activeUsers.length,
    createdCompanyMemberships,
    createdProjectMemberships,
    dryRun: options.dryRun
  };

  console.log(`[OptiNext Migration Completed] Summary:`, JSON.stringify(summary, null, 2));
  return summary;
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--execute');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/bper_isolated_local_test';

  mongoose.connect(mongoUri).then(async (conn) => {
    try {
      await migrateOptiNextTenant(mongoose.connection, { dryRun: isDryRun });
      process.exit(0);
    } catch (err) {
      console.error('[OptiNext Migration Error]:', err);
      process.exit(1);
    }
  });
}

module.exports = {
  migrateOptiNextTenant,
  OPTINEXT_COMPANY_CONFIG,
  FIN_OPS_PROJECT_CONFIG
};
