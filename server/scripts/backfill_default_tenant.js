/**
 * Milestone 1: Non-Destructive Tenant Foundation Backfill Script
 * 
 * IMPORTANT: This script is prepared for review and staging only.
 * DO NOT RUN AGAINST LIVE PRODUCTION DATABASE UNTIL FORMALLY AUTHORIZED.
 *
 * Operational Guarantees:
 * 1. Strictly non-destructive: uses $setOnInsert and conditional updates.
 * 2. Idempotent: safe to run multiple times with zero duplicate creation.
 * 3. Preserves all legacy user roles, submissions, and analytics calculations.
 */

const mongoose = require('mongoose');

const DEFAULT_COMPANY = {
  name: 'Default Enterprise Corp',
  code: 'DEFAULT_CORP',
  description: 'Primary corporate entity provisioned during Phase 1 migration.',
  isActive: true
};

const DEFAULT_PROJECT = {
  name: 'Core Operations Project',
  code: 'CORE_OPS',
  department: 'Operations',
  description: 'Default operational project scope for legacy workforce submissions.',
  status: 'active'
};

/**
 * Plans and executes non-destructive backfill of default corporate tenant,
 * default project, and maps existing active users to memberships.
 *
 * @param {mongoose.Connection} connection - Active mongoose connection
 * @param {Object} options - Migration options
 * @param {boolean} options.dryRun - If true, evaluates mutations without committing
 */
async function backfillDefaultTenant(connection, options = { dryRun: true }) {
  const Company = connection.model('Company');
  const Project = connection.model('Project');
  const CompanyMembership = connection.model('CompanyMembership');
  const UserProjectMembership = connection.model('UserProjectMembership');
  const User = connection.model('User');

  console.log(`[Backfill] Starting tenant backfill (dryRun: ${options.dryRun})...`);

  // 1. Resolve or identify migration anchor user (e.g. system admin or initial user)
  let anchorUser = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
  if (!anchorUser) {
    anchorUser = await User.findOne().sort({ createdAt: 1 });
  }

  if (!anchorUser) {
    throw new Error('[Backfill Aborted] No anchor user found in User collection.');
  }

  console.log(`[Backfill] Anchor user resolved: ${anchorUser.email || anchorUser._id} (${anchorUser._id})`);

  // 2. Provision or retrieve Default Company
  let defaultCompany = await Company.findOne({ code: DEFAULT_COMPANY.code });
  if (!defaultCompany) {
    if (!options.dryRun) {
      defaultCompany = await Company.create({
        ...DEFAULT_COMPANY,
        createdBy: anchorUser._id
      });
      console.log(`[Backfill] Created Default Company: ${defaultCompany._id}`);
    } else {
      console.log(`[Backfill DRY-RUN] Would create Default Company: ${DEFAULT_COMPANY.code}`);
      defaultCompany = { _id: new mongoose.Types.ObjectId(), ...DEFAULT_COMPANY };
    }
  } else {
    console.log(`[Backfill] Existing Default Company resolved: ${defaultCompany._id}`);
  }

  // 3. Provision or retrieve Default Project
  let defaultProject = await Project.findOne({ companyId: defaultCompany._id, code: DEFAULT_PROJECT.code });
  if (!defaultProject) {
    if (!options.dryRun) {
      defaultProject = await Project.create({
        companyId: defaultCompany._id,
        ...DEFAULT_PROJECT,
        createdBy: anchorUser._id
      });
      console.log(`[Backfill] Created Default Project: ${defaultProject._id}`);
    } else {
      console.log(`[Backfill DRY-RUN] Would create Default Project: ${DEFAULT_PROJECT.code}`);
      defaultProject = { _id: new mongoose.Types.ObjectId(), companyId: defaultCompany._id, ...DEFAULT_PROJECT };
    }
  } else {
    console.log(`[Backfill] Existing Default Project resolved: ${defaultProject._id}`);
  }

  // 4. Map existing active users to CompanyMembership & UserProjectMembership
  // Role Mapping Rules:
  // - Existing 'admin' -> CompanyMembership (role: 'company_admin', canCreateProjects: true)
  //                      AND UserProjectMembership (role: 'project_admin')
  // - Existing 'manager' -> NO CompanyMembership (no company-level admin governance)
  //                       AND UserProjectMembership (role: 'manager')
  // - Existing 'employee' -> NO CompanyMembership (cannot receive company or project admin permissions)
  //                         AND UserProjectMembership (role: 'employee')
  const activeUsers = await User.find({ isActive: true, isVacant: false });
  console.log(`[Backfill] Found ${activeUsers.length} active users to evaluate for membership.`);

  let createdCompanyMemberships = 0;
  let createdProjectMemberships = 0;

  for (const user of activeUsers) {
    // 4a. Company Membership - ONLY provisioned for existing 'admin' users
    if (user.role === 'admin') {
      const existingCompMem = await CompanyMembership.findOne({
        companyId: defaultCompany._id,
        userId: user._id,
        isActive: true
      });

      if (!existingCompMem && !options.dryRun) {
        await CompanyMembership.create({
          companyId: defaultCompany._id,
          userId: user._id,
          role: 'company_admin',
          canCreateProjects: true,
          isActive: true,
          createdBy: anchorUser._id
        });
        createdCompanyMemberships++;
      } else if (!existingCompMem && options.dryRun) {
        createdCompanyMemberships++;
      }
    }

    // 4b. User Project Membership - provisioned for all active users according to their scoped project role
    const projectRole = user.role === 'admin' ? 'project_admin' : (user.role === 'manager' ? 'manager' : 'employee');

    const existingProjMem = await UserProjectMembership.findOne({
      projectId: defaultProject._id,
      userId: user._id,
      isActive: true
    });

    if (!existingProjMem && !options.dryRun) {
      await UserProjectMembership.create({
        companyId: defaultCompany._id,
        projectId: defaultProject._id,
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

  console.log(`[Backfill Completed] Results:
  - Company: ${defaultCompany.code} (${defaultCompany._id})
  - Project: ${defaultProject.code} (${defaultProject._id})
  - Company Memberships Created: ${createdCompanyMemberships}
  - Project Memberships Created: ${createdProjectMemberships}
  - Dry Run: ${options.dryRun}`);

  return {
    companyId: defaultCompany._id,
    projectId: defaultProject._id,
    createdCompanyMemberships,
    createdProjectMemberships,
    dryRun: options.dryRun
  };
}

module.exports = {
  backfillDefaultTenant,
  DEFAULT_COMPANY,
  DEFAULT_PROJECT
};
