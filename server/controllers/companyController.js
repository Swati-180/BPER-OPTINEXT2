const mongoose = require('mongoose');
const Company = require('../models/Company');
const Project = require('../models/Project');
const CompanyMembership = require('../models/CompanyMembership');
const UserProjectMembership = require('../models/UserProjectMembership');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

/**
 * POST /api/companies
 * Create a new company tenant. (Super Admin only)
 */
const createCompany = async (req, res) => {
  try {
    const { name, code, description, domain } = req.body;

    if (!name || !code) {
      return res.status(400).json({ message: 'Company Name and Code are required.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanName = String(name).trim();

    // Check unique code
    const existing = await Company.findOne({ code: cleanCode });
    if (existing) {
      return res.status(409).json({ message: `A company with code "${cleanCode}" already exists.` });
    }

    const actorId = req.user.userId || req.user.id || req.user._id;

    const company = await Company.create({
      name: cleanName,
      code: cleanCode,
      description: description ? String(description).trim() : '',
      domain: domain ? String(domain).trim().toLowerCase() : '',
      isActive: true,
      createdBy: actorId
    });

    return res.status(201).json({
      message: 'Company created successfully.',
      company
    });
  } catch (error) {
    console.error('createCompany error:', error);
    return res.status(500).json({ message: 'Failed to create company.', error: error.message });
  }
};

/**
 * GET /api/companies
 * List companies with optional search, status filtering, and pagination.
 */
const listCompanies = async (req, res) => {
  try {
    const userRole = String(req.user.role || '').toLowerCase();
    const actorId = req.user.userId || req.user.id || req.user._id;

    const { search, status, page, limit, includeArchived } = req.query;

    let baseFilter = {};

    // By default, ordinary business views strictly exclude archived companies
    if (includeArchived === 'true' && userRole === 'super_admin') {
      if (status === 'archived') {
        baseFilter.$or = [{ status: 'archived' }, { isArchivedDemo: true }, { isActive: false }];
      }
    } else {
      baseFilter.status = { $ne: 'archived' };
      baseFilter.isArchivedDemo = { $ne: true };
      baseFilter.isActive = true;
    }

    if (userRole !== 'super_admin') {
      // Company Admin: only companies with active membership
      const memberships = await CompanyMembership.find({
        userId: actorId,
        role: 'company_admin',
        isActive: true,
        isArchivedDemo: { $ne: true }
      }).select('companyId');

      const companyIds = memberships.map(m => m.companyId);
      baseFilter._id = { $in: companyIds };
    }

    if (search && search.trim()) {
      const q = search.trim();
      const regex = new RegExp(q, 'i');
      baseFilter.$or = [
        { name: regex },
        { code: regex },
        { domain: regex },
        { description: regex }
      ];
    }

    const total = await Company.countDocuments(baseFilter);

    let query = Company.find(baseFilter).sort({ createdAt: -1 });

    if (page && limit) {
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.max(1, parseInt(limit, 10));
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const companies = await query;

    return res.json({
      companies,
      total,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : total
    });
  } catch (error) {
    console.error('listCompanies error:', error);
    return res.status(500).json({ message: 'Failed to list companies.', error: error.message });
  }
};

/**
 * GET /api/companies/:id
 * Get company details.
 */
const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid company ID.' });
    }

    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ message: 'Company not found.' });
    }

    const userRole = String(req.user.role || '').toLowerCase();
    const { includeArchived } = req.query;
    if ((company.status === 'archived' || company.isArchivedDemo || !company.isActive) && !(userRole === 'super_admin' && includeArchived === 'true')) {
      return res.status(404).json({ message: 'Company is archived and not accessible in active views.' });
    }

    return res.json({ company });
  } catch (error) {
    console.error('getCompanyById error:', error);
    return res.status(500).json({ message: 'Failed to retrieve company.', error: error.message });
  }
};

/**
 * PATCH /api/companies/:id
 * Update company details (name, description, domain).
 */
const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, domain } = req.body;

    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ message: 'Company not found.' });
    }

    const userRole = String(req.user.role || '').toLowerCase();
    const { includeArchived } = req.query;
    if ((company.status === 'archived' || company.isArchivedDemo || !company.isActive) && !(userRole === 'super_admin' && includeArchived === 'true')) {
      return res.status(404).json({ message: 'Company is archived and not accessible in active views.' });
    }

    if (name) company.name = name.trim();
    if (description !== undefined) company.description = description.trim();
    if (domain !== undefined) company.domain = domain.trim().toLowerCase();
    await company.save();

    return res.json({ message: 'Company updated successfully.', company });
  } catch (error) {
    console.error('updateCompany error:', error);
    return res.status(500).json({ message: 'Failed to update company.', error: error.message });
  }
};

/**
 * PATCH /api/companies/:id/status
 * Activate or deactivate company. (Super Admin only)
 */
const setCompanyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive boolean flag is required.' });
    }

    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ message: 'Company not found.' });
    }

    const userRole = String(req.user.role || '').toLowerCase();
    const { includeArchived } = req.query;
    if ((company.status === 'archived' || company.isArchivedDemo || !company.isActive) && !(userRole === 'super_admin' && includeArchived === 'true')) {
      return res.status(404).json({ message: 'Company is archived and not accessible in active views.' });
    }

    company.isActive = isActive;
    await company.save();

    return res.json({
      message: `Company ${isActive ? 'activated' : 'deactivated'} successfully.`,
      company
    });
  } catch (error) {
    console.error('setCompanyStatus error:', error);
    return res.status(500).json({ message: 'Failed to set company status.', error: error.message });
  }
};

/**
 * POST /api/companies/:id/administrators
 * Assign a company administrator or update project creation permissions.
 */
const assignCompanyAdmin = async (req, res) => {
  try {
    const { id: companyId } = req.params;
    const { userId, email, name, role = 'company_admin', canCreateProjects = true } = req.body;

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found.' });
    }

    let targetUser = null;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      targetUser = await User.findById(userId);
    } else if (email) {
      const cleanEmail = String(email).trim().toLowerCase();
      targetUser = await User.findOne({ email: cleanEmail });
      if (!targetUser) {
        // Create user placeholder account for this administrator
        targetUser = await User.create({
          name: name ? String(name).trim() : cleanEmail.split('@')[0],
          email: cleanEmail,
          password: 'BperTempPassword' + Math.random().toString(36).slice(-6) + '!',
          role: 'admin',
          isActive: true
        });
      }
    }

    if (!targetUser) {
      return res.status(400).json({ message: 'A valid userId or email is required.' });
    }

    if (!['company_admin', 'project_admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid company membership role.' });
    }

    const actorId = req.user.userId || req.user.id || req.user._id;

    // Check existing active membership
    let membership = await CompanyMembership.findOne({ companyId, userId: targetUser._id });
    if (membership) {
      membership.role = role;
      membership.canCreateProjects = canCreateProjects;
      membership.isActive = true;
      membership.deactivatedAt = null;
      membership.deactivatedBy = null;
      await membership.save();
    } else {
      membership = await CompanyMembership.create({
        companyId,
        userId: targetUser._id,
        role,
        canCreateProjects,
        isActive: true,
        createdBy: actorId
      });
    }

    return res.status(200).json({
      message: 'Company administrator assigned successfully.',
      membership
    });
  } catch (error) {
    console.error('assignCompanyAdmin error:', error);
    return res.status(500).json({ message: 'Failed to assign company administrator.', error: error.message });
  }
};

/**
 * GET /api/companies/:id/administrators
 * List administrators for a company.
 */
const listCompanyAdmins = async (req, res) => {
  try {
    const { id: companyId } = req.params;
    const { includeInactive } = req.query;

    const filter = { companyId };
    if (!includeInactive) {
      filter.isActive = true;
    }

    const memberships = await CompanyMembership.find(filter)
      .populate('userId', 'name email designation role isActive')
      .sort({ createdAt: -1 });

    return res.json({ administrators: memberships });
  } catch (error) {
    console.error('listCompanyAdmins error:', error);
    return res.status(500).json({ message: 'Failed to list company administrators.', error: error.message });
  }
};

/**
 * PATCH /api/companies/:companyId/administrators/:adminId/status
 * Deactivate or reactivate an administrator's company membership without deleting their account.
 */
const setCompanyAdminStatus = async (req, res) => {
  try {
    const { companyId, adminId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive boolean flag is required.' });
    }

    const actorId = req.user.userId || req.user.id || req.user._id;

    let membership = null;
    if (mongoose.Types.ObjectId.isValid(adminId)) {
      membership = await CompanyMembership.findOne({
        _id: adminId,
        companyId
      });
    }

    if (!membership && mongoose.Types.ObjectId.isValid(adminId)) {
      membership = await CompanyMembership.findOne({
        userId: adminId,
        companyId
      });
    }

    if (!membership) {
      return res.status(404).json({ message: 'Company administrator membership not found.' });
    }

    const updateDoc = {
      isActive,
      ...(isActive
        ? { reactivatedAt: new Date(), reactivatedBy: actorId }
        : { deactivatedAt: new Date(), deactivatedBy: actorId })
    };
    if (!membership.createdBy) {
      updateDoc.createdBy = actorId;
    }

    const updatedMembership = await CompanyMembership.findByIdAndUpdate(
      membership._id,
      { $set: updateDoc },
      { new: true }
    );

    return res.json({
      message: `Administrator membership ${isActive ? 'reactivated' : 'deactivated'} successfully.`,
      membership: updatedMembership
    });
  } catch (error) {
    console.error('setCompanyAdminStatus error:', error);
    return res.status(500).json({ message: 'Failed to update administrator status.', error: error.message });
  }
};

/**
 * POST /api/companies/:companyId/administrators/:adminId/replace
 * Replace an existing administrator with a new administrator under the exact company.
 */
const replaceCompanyAdmin = async (req, res) => {
  try {
    const { companyId, adminId } = req.params;
    const { newAdminEmail, newAdminName, canCreateProjects = true } = req.body;

    if (!newAdminEmail) {
      return res.status(400).json({ message: 'New administrator email is required.' });
    }

    const actorId = req.user.userId || req.user.id || req.user._id;

    // Find and deactivate old membership
    let oldMembership = await CompanyMembership.findOne({ _id: adminId, companyId });
    if (!oldMembership && mongoose.Types.ObjectId.isValid(adminId)) {
      oldMembership = await CompanyMembership.findOne({ userId: adminId, companyId });
    }

    if (oldMembership) {
      const oldUpdate = {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: actorId
      };
      if (!oldMembership.createdBy) oldUpdate.createdBy = actorId;
      await CompanyMembership.findByIdAndUpdate(oldMembership._id, { $set: oldUpdate });
    }

    // Find or create new target user
    const cleanEmail = String(newAdminEmail).trim().toLowerCase();
    let newTargetUser = await User.findOne({ email: cleanEmail });
    if (!newTargetUser) {
      newTargetUser = await User.create({
        name: newAdminName ? String(newAdminName).trim() : cleanEmail.split('@')[0],
        email: cleanEmail,
        password: 'BperTempPassword' + Math.random().toString(36).slice(-6) + '!',
        role: 'admin',
        isActive: true
      });
    }

    // Assign new membership
    let newMembership = await CompanyMembership.findOne({ companyId, userId: newTargetUser._id });
    if (newMembership) {
      const targetUpdate = {
        role: 'company_admin',
        canCreateProjects,
        isActive: true,
        deactivatedAt: null,
        deactivatedBy: null
      };
      if (!newMembership.createdBy) targetUpdate.createdBy = actorId;
      newMembership = await CompanyMembership.findByIdAndUpdate(
        newMembership._id,
        { $set: targetUpdate },
        { new: true }
      );
    } else {
      newMembership = await CompanyMembership.create({
        companyId,
        userId: newTargetUser._id,
        role: 'company_admin',
        canCreateProjects,
        isActive: true,
        createdBy: actorId
      });
    }

    return res.json({
      message: `Administrator replaced successfully with ${cleanEmail}.`,
      membership: newMembership
    });
  } catch (error) {
    console.error('replaceCompanyAdmin error:', error);
    return res.status(500).json({ message: 'Failed to replace company administrator.', error: error.message });
  }
};

/**
 * GET /api/companies/stats/overview
 * Overview metrics for Super Admin Dashboard
 */
const getGovernanceStats = async (req, res) => {
  try {
    const [
      activeCompaniesCount,
      archivedCompaniesCount,
      activeProjectsCount,
      archivedProjectsCount,
      totalAdmins,
      totalManagers,
      totalEmployees,
      projectCountsByCompany,
      adminCountsByCompany
    ] = await Promise.all([
      Company.countDocuments({ status: { $ne: 'archived' }, isActive: true }),
      Company.countDocuments({ $or: [{ status: 'archived' }, { isActive: false }, { isArchivedDemo: true }] }),
      Project.countDocuments({ status: { $ne: 'archived' }, isArchivedDemo: { $ne: true } }),
      Project.countDocuments({ $or: [{ status: 'archived' }, { isArchivedDemo: true }] }),
      CompanyMembership.countDocuments({ role: 'company_admin', isActive: true, isArchivedDemo: { $ne: true } }),
      UserProjectMembership.countDocuments({ role: 'manager', isActive: true, isArchivedDemo: { $ne: true } }),
      UserProjectMembership.countDocuments({ role: 'employee', isActive: true, isArchivedDemo: { $ne: true } }),
      Project.aggregate([
        { $match: { status: { $ne: 'archived' }, isArchivedDemo: { $ne: true } } },
        { $group: { _id: '$companyId', count: { $sum: 1 } } }
      ]),
      CompanyMembership.aggregate([
        { $match: { role: 'company_admin', isActive: true, isArchivedDemo: { $ne: true } } },
        { $group: { _id: '$companyId', count: { $sum: 1 } } }
      ])
    ]);

    const projectCountsMap = {};
    projectCountsByCompany.forEach(item => {
      if (item._id) projectCountsMap[item._id.toString()] = item.count;
    });

    const adminCountsMap = {};
    adminCountsByCompany.forEach(item => {
      if (item._id) adminCountsMap[item._id.toString()] = item.count;
    });

    return res.json({
      // Enterprise primary counts represent ACTIVE non-archived entities
      totalCompanies: activeCompaniesCount,
      activeCompanies: activeCompaniesCount,
      inactiveCompanies: archivedCompaniesCount,
      archivedCompanies: archivedCompaniesCount,
      totalProjects: activeProjectsCount,
      activeProjects: activeProjectsCount,
      archivedProjects: archivedProjectsCount,
      totalAdmins,
      totalManagers,
      totalEmployees,
      totalWorkforce: totalManagers + totalEmployees,
      projectCountsMap,
      adminCountsMap
    });
  } catch (error) {
    console.error('getGovernanceStats error:', error);
    return res.status(500).json({ message: 'Failed to retrieve governance stats', error: error.message });
  }
};

module.exports = {
  createCompany,
  listCompanies,
  getCompanyById,
  updateCompany,
  setCompanyStatus,
  assignCompanyAdmin,
  listCompanyAdmins,
  setCompanyAdminStatus,
  replaceCompanyAdmin,
  getGovernanceStats
};
