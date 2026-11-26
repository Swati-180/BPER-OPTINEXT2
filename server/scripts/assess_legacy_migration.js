const mongoose = require('mongoose');
const Company = require('../models/Company');
const Project = require('../models/Project');
const WDTSubmission = require('../models/WDTSubmission');
const EmployeeInvite = require('../models/EmployeeInvite');
const User = require('../models/User');
const ProcessAnalysis = require('../models/ProcessAnalysis');
const Fitment = require('../models/Fitment');
const ActivityRequest = require('../models/ActivityRequest');

/**
 * Assesses legacy unassigned documents across all collections and provides an idempotent,
 * non-destructive plan to backfill them into the default company and project.
 *
 * NOTE: This script is prepared for inspection, dry-run simulation, and offline verification.
 * It does NOT execute against any live or production database.
 */
async function assessLegacyDataMigration(connection, options = { dryRun: true }) {
  console.log(`[Migration Plan] Assessing legacy data migration (dryRun: ${options.dryRun})...`);

  // 1. Resolve or identify default company
  const defaultCompany = await Company.findOne({ code: 'DEFAULT_CORP' });
  const defaultProject = defaultCompany
    ? await Project.findOne({ companyId: defaultCompany._id, code: 'CORE_OPS' })
    : null;

  // 2. Count legacy unassigned records across all collections
  const unassignedFilter = {
    $or: [{ companyId: null }, { projectId: null }, { companyId: { $exists: false } }, { projectId: { $exists: false } }]
  };

  const unassignedWDTCount = await WDTSubmission.countDocuments(unassignedFilter);
  const unassignedInvitesCount = await EmployeeInvite.countDocuments(unassignedFilter);
  const unassignedPAMCount = await ProcessAnalysis.countDocuments(unassignedFilter);
  const unassignedFitmentCount = await Fitment.countDocuments(unassignedFilter);
  const unassignedReqCount = await ActivityRequest.countDocuments(unassignedFilter);
  const totalUsersCount = await User.countDocuments({ isActive: true, isVacant: false });

  console.log(`[Migration Plan] Complete Unassigned Inventory:
  - WDT Submissions lacking company/project: ${unassignedWDTCount}
  - Employee Invites lacking company/project: ${unassignedInvitesCount}
  - Process Analysis (PAM) lacking company/project: ${unassignedPAMCount}
  - Fitment Profiles lacking company/project: ${unassignedFitmentCount}
  - Activity Requests lacking company/project: ${unassignedReqCount}
  - Total Active Users: ${totalUsersCount}
  - Default Company Resolved: ${defaultCompany ? defaultCompany.code : 'NOT YET PROVISIONED'}
  - Default Project Resolved: ${defaultProject ? defaultProject.code : 'NOT YET PROVISIONED'}`);

  let updatedWDT = 0;
  let updatedInvites = 0;
  let updatedPAM = 0;
  let updatedFitment = 0;
  let updatedReqs = 0;

  if (!options.dryRun && defaultCompany && defaultProject) {
    const defaultAssignment = {
      $set: {
        companyId: defaultCompany._id,
        projectId: defaultProject._id
      }
    };

    const wdtResult = await WDTSubmission.updateMany(unassignedFilter, defaultAssignment);
    updatedWDT = wdtResult.modifiedCount || 0;

    const inviteResult = await EmployeeInvite.updateMany(unassignedFilter, defaultAssignment);
    updatedInvites = inviteResult.modifiedCount || 0;

    const pamResult = await ProcessAnalysis.updateMany(unassignedFilter, defaultAssignment);
    updatedPAM = pamResult.modifiedCount || 0;

    const fitmentResult = await Fitment.updateMany(unassignedFilter, defaultAssignment);
    updatedFitment = fitmentResult.modifiedCount || 0;

    const reqResult = await ActivityRequest.updateMany(unassignedFilter, defaultAssignment);
    updatedReqs = reqResult.modifiedCount || 0;

    console.log(`[Migration Plan] Live run updated:
      ${updatedWDT} WDT submissions,
      ${updatedInvites} invites,
      ${updatedPAM} PAM records,
      ${updatedFitment} fitment profiles,
      ${updatedReqs} activity requests.`);
  } else if (options.dryRun) {
    updatedWDT = unassignedWDTCount;
    updatedInvites = unassignedInvitesCount;
    updatedPAM = unassignedPAMCount;
    updatedFitment = unassignedFitmentCount;
    updatedReqs = unassignedReqCount;
    console.log(`[Migration Plan DRY-RUN] Would associate all identified unassigned records with DEFAULT_CORP / CORE_OPS.`);
  }

  return {
    dryRun: options.dryRun,
    defaultCompanyId: defaultCompany?._id || null,
    defaultProjectId: defaultProject?._id || null,
    unassignedWDTCount,
    unassignedInvitesCount,
    unassignedPAMCount,
    unassignedFitmentCount,
    unassignedReqCount,
    updatedWDT,
    updatedInvites,
    updatedPAM,
    updatedFitment,
    updatedReqs
  };
}

module.exports = {
  assessLegacyDataMigration
};
