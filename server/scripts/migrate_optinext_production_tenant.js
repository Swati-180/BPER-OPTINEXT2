/**
 * migrate_optinext_production_tenant.js
 *
 * Migration & Verification Script for Historical Tenant Isolation (OptiNext Global / FIN_OPS).
 * Links historical unassigned WDT Submissions (326) and PAM Records (2,126) to:
 * - Company: OptiNext Global (code: 'OPTINEXT')
 * - Project: Finance & Accounting Operations (code: 'FIN_OPS')
 *
 * RESTRICTED AUTHORIZATION RULES:
 * 1. Only explicitly approved OptiNext production identities are eligible for membership:
 *    - admin@optinext.test (Company: company_admin, Project: project_admin)
 *    - manager@bper.com (Company: member, Project: manager)
 *    - employee@bper.com (Company: member, Project: employee)
 * 2. Foreign-company accounts, Super Admin accounts, and test fixtures are strictly excluded.
 * 3. Anomalous records (inactive admin membership, unlinked EMP-001 placeholder) are detected
 *    and audited as separate proposed repairs — NEVER silently modified or activated during dry-run.
 * 4. Failsafe safety checks enforce dry-run default, require --execute, and prevent running on unintended targets.
 */

const mongoose = require('mongoose');
const Company = require('../models/Company');
const Project = require('../models/Project');
const CompanyMembership = require('../models/CompanyMembership');
const UserProjectMembership = require('../models/UserProjectMembership');
const WDTSubmission = require('../models/WDTSubmission');
const ProcessAnalysis = require('../models/ProcessAnalysis');
const User = require('../models/User');

const OPTINEXT_COMPANY_CONFIG = {
  name: 'OptiNext Global',
  code: 'OPTINEXT',
  status: 'active',
  settings: {
    allowCrossProjectAnalytics: false,
    requireProjectSelection: true
  }
};

const FIN_OPS_PROJECT_CONFIG = {
  name: 'Finance & Accounting Operations',
  code: 'FIN_OPS',
  status: 'active',
  settings: {
    workforcePlanningEnabled: true,
    historicalComparisonsEnabled: true
  }
};

// Explicitly approved OptiNext production roster
// NOTE: admin@optinext.test is flagged as requiring explicit production identity confirmation.
// In production mode, migration will halt if admin@optinext.test is used without explicit approval.
const APPROVED_OPTINEXT_ROSTER = [
  {
    email: 'admin@optinext.test',
    expectedCompanyRole: 'company_admin',
    expectedProjectRole: 'project_admin',
    requiresProductionConfirmation: true,
    description: 'OptiNext Company & Project Administrator (anchor account - REQUIRES IDENTITY CONFIRMATION)'
  },
  {
    email: 'manager@bper.com',
    expectedCompanyRole: 'member',
    expectedProjectRole: 'manager',
    requiresProductionConfirmation: false,
    description: 'Finance & Accounting Operations Line Manager'
  },
  {
    email: 'employee@bper.com',
    expectedCompanyRole: 'member',
    expectedProjectRole: 'employee',
    requiresProductionConfirmation: false,
    description: 'Operational Process Contributor (EMP-001)'
  }
];

async function migrateOptiNextTenant(dbConnection, options = { dryRun: true }) {
  console.log(`[OptiNext Migration] Starting tenant migration (DRY_RUN = ${!!options.dryRun})...`);

  // Target Database Safeguard Check
  const dbName = dbConnection.name || mongoose.connection.name;
  const dbHost = dbConnection.host || mongoose.connection.host;
  console.log(`[OptiNext Migration] Target database: "${dbName}" on host "${dbHost}"`);

  if (!options.dryRun) {
    if (!options.allowExecution) {
      throw new Error('[SAFETY HALT] Database write requested without explicit --execute flag. Aborting.');
    }
    // Warn if pointing to Atlas / non-localhost without confirmation
    const isRemote = dbHost && !['localhost', '127.0.0.1'].includes(dbHost);
    if (isRemote && !options.confirmRemoteProduction) {
      throw new Error(`[SAFETY HALT] Target database is remote (${dbHost}). Explicit confirmation token required.`);
    }
  }

  // 1. Audit & Resolve Anchor User
  let anchorUser = await User.findOne({ email: 'admin@optinext.test' });
  if (!anchorUser) {
    anchorUser = await User.findOne({ role: 'admin' });
  }
  if (!anchorUser) {
    anchorUser = await User.findOne({});
  }
  if (!anchorUser) {
    throw new Error('No user found in database to anchor company creation.');
  }
  console.log(`[OptiNext Migration] Anchor User resolved: ${anchorUser.email} (${anchorUser._id})`);

  // 2. Audit & Create/Resolve Company: OptiNext Global
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

  // 3. Audit & Create/Resolve Project: FIN_OPS
  let finOpsProject = await Project.findOne({
    companyId: optinextCompany._id,
    code: FIN_OPS_PROJECT_CONFIG.code
  });
  if (!finOpsProject && !options.dryRun) {
    finOpsProject = await Project.create({
      companyId: optinextCompany._id,
      ...FIN_OPS_PROJECT_CONFIG,
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

  // 6. Strict Authorized Roster Evaluation
  console.log(`\n--- [OptiNext Migration: Evaluating Approved Roster] ---`);
  
  const proposedCompanyMemberships = [];
  const proposedProjectMemberships = [];
  const existingValidMemberships = [];
  const proposedRepairs = [];
  const excludedAccounts = [];

  // A. Audit all database users to categorize exclusions
  const allUsers = await User.find({});
  for (const u of allUsers) {
    const isApproved = APPROVED_OPTINEXT_ROSTER.some(r => r.email.toLowerCase() === u.email.toLowerCase());
    if (!isApproved) {
      let reason = 'Test fixture / non-operational account';
      if (u.role === 'super_admin' || u.email.includes('superadmin')) {
        reason = 'Platform Super Admin (governance role, not tenant member)';
      } else if (u.email.includes('acme') || u.email.includes('alpha') || u.email.includes('beta')) {
        reason = 'Foreign company account';
      }
      excludedAccounts.push({
        userId: u._id,
        email: u.email,
        role: u.role,
        reason
      });
    }
  }

  // B. Process each approved identity
  for (const rosterEntry of APPROVED_OPTINEXT_ROSTER) {
    if (rosterEntry.requiresProductionConfirmation) {
      if (!options.dryRun && !options.confirmAdminTestIdentity) {
        throw new Error(`[SAFETY HALT] ${rosterEntry.email} requires explicit production identity confirmation. Migration blocked from executing against unconfirmed admin account.`);
      }
      console.log(`[OptiNext Migration WARNING] Account ${rosterEntry.email} is flagged as requiring production identity confirmation (uses .test domain).`);
    }

    const user = await User.findOne({ email: rosterEntry.email });
    if (!user) {
      console.warn(`[OptiNext Migration WARNING] Approved roster user not found in database: ${rosterEntry.email}`);
      continue;
    }

    // --- Company Membership Check ---
    const existingCompMem = await CompanyMembership.findOne({
      companyId: optinextCompany._id,
      userId: user._id
    });

    if (existingCompMem) {
      existingValidMemberships.push({
        type: 'CompanyMembership',
        userId: user._id,
        email: user.email,
        role: existingCompMem.role,
        isActive: existingCompMem.isActive,
        id: existingCompMem._id
      });
    } else {
      proposedCompanyMemberships.push({
        userId: user._id,
        email: user.email,
        companyId: optinextCompany._id,
        companyCode: optinextCompany.code,
        role: rosterEntry.expectedCompanyRole,
        action: 'CREATE'
      });

      if (!options.dryRun) {
        await CompanyMembership.create({
          companyId: optinextCompany._id,
          userId: user._id,
          role: rosterEntry.expectedCompanyRole,
          isActive: true,
          createdBy: anchorUser._id
        });
      }
    }

    // --- User Project Membership Check ---
    const existingProjMem = await UserProjectMembership.findOne({
      companyId: optinextCompany._id,
      projectId: finOpsProject._id,
      userId: user._id
    });

    if (existingProjMem) {
      // Check if membership is healthy or requires repair
      if (!existingProjMem.isActive) {
        proposedRepairs.push({
          type: 'UserProjectMembership_Inactive',
          membershipId: existingProjMem._id,
          userId: user._id,
          email: user.email,
          currentStatus: 'isActive: false',
          recommendedFix: 'Set isActive: true to restore administrative access',
          requiresManualApproval: true
        });
      } else {
        existingValidMemberships.push({
          type: 'UserProjectMembership',
          userId: user._id,
          email: user.email,
          role: existingProjMem.role,
          isActive: existingProjMem.isActive,
          id: existingProjMem._id
        });
      }
    } else {
      // Check if user is employee@bper.com and EMP-001 placeholder exists
      let matchedPlaceholder = null;
      if (user.employeeId) {
        matchedPlaceholder = await UserProjectMembership.findOne({
          companyId: optinextCompany._id,
          projectId: finOpsProject._id,
          employeeId: user.employeeId,
          userId: null
        });
      }

      if (matchedPlaceholder) {
        proposedRepairs.push({
          type: 'UserProjectMembership_UnlinkedPlaceholder',
          membershipId: matchedPlaceholder._id,
          employeeId: user.employeeId,
          userId: user._id,
          email: user.email,
          currentStatus: 'userId: null (Unlinked placeholder)',
          recommendedFix: `Link membership ${matchedPlaceholder._id} to user ${user.email} (${user._id})`,
          requiresManualApproval: true
        });
      } else {
        proposedProjectMemberships.push({
          userId: user._id,
          email: user.email,
          companyId: optinextCompany._id,
          projectId: finOpsProject._id,
          projectCode: finOpsProject.code,
          role: rosterEntry.expectedProjectRole,
          employeeId: user.employeeId || null,
          action: 'CREATE'
        });

        if (!options.dryRun) {
          await UserProjectMembership.create({
            companyId: optinextCompany._id,
            projectId: finOpsProject._id,
            userId: user._id,
            role: rosterEntry.expectedProjectRole,
            employeeId: user.employeeId || null,
            formAccessGranted: user.formAccessGranted !== false,
            isActive: true,
            createdBy: anchorUser._id
          });
        }
      }
    }
  }

  // Audit existing UPMs to identify test fixture memberships
  const allFinOpsProjMems = await UserProjectMembership.find({
    companyId: optinextCompany._id,
    projectId: finOpsProject._id
  }).populate('userId', 'email');

  const fixtureMembershipsInFinOps = [];
  for (const pm of allFinOpsProjMems) {
    const pmEmail = pm.userId ? pm.userId.email : null;
    const isApproved = APPROVED_OPTINEXT_ROSTER.some(r => pmEmail && r.email.toLowerCase() === pmEmail.toLowerCase());
    const isPlaceholder = pm.employeeId === 'EMP-001' && pm.userId === null;
    if (!isApproved && !isPlaceholder) {
      fixtureMembershipsInFinOps.push({
        membershipId: pm._id,
        email: pmEmail || 'NO_USER_LINK',
        role: pm.role,
        employeeId: pm.employeeId
      });
    }
  }

  const summary = {
    companyId: optinextCompany._id,
    companyCode: optinextCompany.code,
    companyName: optinextCompany.name,
    projectId: finOpsProject._id,
    projectCode: finOpsProject.code,
    projectName: finOpsProject.name,
    historicalData: {
      totalWDT: await WDTSubmission.countDocuments(),
      optinextWDT: optinextWDTCount + (options.dryRun ? 0 : migratedWDT),
      unassignedWDT: unassignedWDTCount,
      migratedWDT,
      totalPAM: await ProcessAnalysis.countDocuments(),
      optinextPAM: optinextPAMCount + (options.dryRun ? 0 : migratedPAM),
      unassignedPAM: unassignedPAMCount,
      migratedPAM
    },
    approvedRosterEvaluation: {
      approvedUsersCount: APPROVED_OPTINEXT_ROSTER.length,
      existingValidMembershipsCount: existingValidMemberships.length,
      proposedCompanyMembershipsCount: proposedCompanyMemberships.length,
      proposedProjectMembershipsCount: proposedProjectMemberships.length,
      proposedRepairsCount: proposedRepairs.length,
      excludedAccountsCount: excludedAccounts.length,
      testFixturesInFinOpsCount: fixtureMembershipsInFinOps.length
    },
    details: {
      proposedCompanyMemberships,
      proposedProjectMemberships,
      proposedRepairs,
      existingValidMemberships,
      excludedAccounts,
      fixtureMembershipsInFinOps
    },
    dryRun: options.dryRun
  };

  console.log(`\n=================== OPTINEXT MIGRATION SUMMARY ===================`);
  console.log(`Mode: ${options.dryRun ? 'DRY-RUN (No database writes)' : 'EXECUTE'}`);
  console.log(`WDT Submissions: ${summary.historicalData.optinextWDT} linked to OptiNext, ${summary.historicalData.unassignedWDT} unassigned.`);
  console.log(`PAM Records: ${summary.historicalData.optinextPAM} linked to OptiNext, ${summary.historicalData.unassignedPAM} unassigned.`);
  console.log(`Proposed New Company Memberships: ${proposedCompanyMemberships.length}`);
  proposedCompanyMemberships.forEach(m => console.log(`  + CompanyMembership: ${m.email} -> ${m.role}`));
  console.log(`Proposed New Project Memberships: ${proposedProjectMemberships.length}`);
  proposedProjectMemberships.forEach(m => console.log(`  + ProjectMembership: ${m.email} -> ${m.role}`));
  console.log(`Proposed Repairs (Requires Separate Admin Approval): ${proposedRepairs.length}`);
  proposedRepairs.forEach(r => console.log(`  ! Repair [${r.type}]: ${r.email || r.employeeId} - ${r.recommendedFix}`));
  console.log(`Excluded Foreign/SuperAdmin/Fixture Accounts: ${excludedAccounts.length}`);
  console.log(`==================================================================\n`);

  return summary;
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--execute');
  const allowExecution = process.argv.includes('--execute');
  const confirmRemoteProduction = process.argv.includes('--confirm-production');
  const confirmAdminTestIdentity = process.argv.includes('--confirm-admin-identity');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/bper_isolated_local_test';

  mongoose.connect(mongoUri).then(async (conn) => {
    try {
      await migrateOptiNextTenant(mongoose.connection, {
        dryRun: isDryRun,
        allowExecution,
        confirmRemoteProduction,
        confirmAdminTestIdentity
      });
      process.exit(0);
    } catch (err) {
      console.error('[OptiNext Migration Error]:', err.message || err);
      process.exit(1);
    }
  });
}

module.exports = {
  migrateOptiNextTenant,
  OPTINEXT_COMPANY_CONFIG,
  FIN_OPS_PROJECT_CONFIG,
  APPROVED_OPTINEXT_ROSTER
};
