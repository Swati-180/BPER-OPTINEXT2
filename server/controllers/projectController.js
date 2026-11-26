const mongoose = require('mongoose');
const Project = require('../models/Project');
const Company = require('../models/Company');
const UserProjectMembership = require('../models/UserProjectMembership');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

/**
 * POST /api/projects
 * Create a new project under a company.
 * Requires Super Admin, Company Admin, or Project Admin with canCreateProjects: true.
 */
const createProject = async (req, res) => {
  try {
    const { companyId, name, code, department, description } = req.body;

    if (!companyId || !name || !code || !department) {
      return res.status(400).json({
        message: 'companyId, name, code, and department are required.'
      });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Target company not found.' });
    }

    if (!company.isActive) {
      return res.status(400).json({ message: 'Cannot create project under an inactive company.' });
    }

    const normalizedCode = code.trim().toUpperCase();
    const existing = await Project.findOne({ companyId, code: normalizedCode });
    if (existing) {
      return res.status(409).json({
        message: `Project with code '${normalizedCode}' already exists under this company.`
      });
    }

    const actorId = req.user.userId || req.user.id || req.user._id;

    const project = await Project.create({
      companyId,
      name: name.trim(),
      code: normalizedCode,
      department: department.trim(),
      description: description ? description.trim() : '',
      status: 'active',
      createdBy: actorId
    });

    // Super Admin is a global platform identity and must never be assigned as an operational project member
    const actorRole = String(req.user.role || '').toLowerCase();
    if (actorRole !== 'super_admin') {
      await UserProjectMembership.create({
        companyId,
        projectId: project._id,
        userId: actorId,
        role: 'project_admin',
        formAccessGranted: true,
        isActive: true,
        createdBy: actorId
      });
    }

    try {
      await AuditLog.create({
        actor: {
          userId: actorId,
          name: req.user.name || 'User',
          email: req.user.email || 'user@bper.local'
        },
        action: 'PROJECT_CREATED',
        targetType: 'Project',
        targetId: String(project._id),
        description: `Project ${project.name} (${project.code}) created under company ${company.name}.`
      });
    } catch (auditErr) {
      console.warn('[Audit Warning]:', auditErr.message);
    }

    return res.status(201).json({
      message: 'Project created successfully.',
      project
    });
  } catch (error) {
    console.error('createProject error:', error);
    return res.status(500).json({ message: 'Failed to create project.', error: error.message });
  }
};

/**
 * GET /api/companies/:companyId/projects
 * List all projects belonging to a company.
 * Super Admin or Company Admin gets all projects.
 * Project Admin/Manager/Employee gets only projects they have membership in.
 */
const listCompanyProjects = async (req, res) => {
  try {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: 'Invalid company ID.' });
    }

    const userRole = String(req.user.role || '').toLowerCase();
    const actorId = req.user.userId || req.user.id || req.user._id;

    const { includeArchived } = req.query;
    const baseProjectFilter = { companyId };
    if (!(includeArchived === 'true' && userRole === 'super_admin')) {
      baseProjectFilter.status = { $ne: 'archived' };
      baseProjectFilter.isArchivedDemo = { $ne: true };
    }

    if (userRole === 'super_admin' || req.companyMembership?.role === 'company_admin') {
      const projects = await Project.find(baseProjectFilter).sort({ createdAt: -1 });
      return res.json({ projects });
    }

    // Filter to only projects where user has active membership
    const memberships = await UserProjectMembership.find({
      companyId,
      userId: actorId,
      isActive: true,
      isArchivedDemo: { $ne: true }
    }).select('projectId role');

    const projectIds = memberships.map(m => m.projectId);
    baseProjectFilter._id = { $in: projectIds };
    const projects = await Project.find(baseProjectFilter).sort({ createdAt: -1 });

    return res.json({ projects });
  } catch (error) {
    console.error('listCompanyProjects error:', error);
    return res.status(500).json({ message: 'Failed to list projects.', error: error.message });
  }
};

/**
 * GET /api/projects/:id
 * Retrieve project details.
 */
const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid project ID.' });
    }

    const project = await Project.findById(id).populate('companyId', 'name code isActive status isArchivedDemo');
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    const userRole = String(req.user.role || '').toLowerCase();
    const { includeArchived } = req.query;
    if ((project.status === 'archived' || project.isArchivedDemo) && !(userRole === 'super_admin' && includeArchived === 'true')) {
      return res.status(404).json({ message: 'Project is archived and not accessible in active views.' });
    }

    return res.json({ project });
  } catch (error) {
    console.error('getProjectById error:', error);
    return res.status(500).json({ message: 'Failed to retrieve project.', error: error.message });
  }
};

/**
 * PATCH /api/projects/:id
 * Update project details (name, department, description).
 */
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, department, description } = req.body;

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // Verify parent company is active
    const company = await Company.findById(project.companyId);
    if (!company || !company.isActive) {
      return res.status(400).json({ message: 'Cannot modify project under an inactive or nonexistent company.' });
    }

    if (name) project.name = name.trim();
    if (department) project.department = department.trim();
    if (description !== undefined) project.description = description.trim();
    await project.save();

    return res.json({ message: 'Project updated successfully.', project });
  } catch (error) {
    console.error('updateProject error:', error);
    return res.status(500).json({ message: 'Failed to update project.', error: error.message });
  }
};

/**
 * PATCH /api/projects/:id/archive
 * Archive or restore a project.
 */
const setProjectStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'archived', 'draft'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be active, archived, or draft.' });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // Verify parent company is active
    const company = await Company.findById(project.companyId);
    if (!company || !company.isActive) {
      return res.status(400).json({ message: 'Cannot modify project status under an inactive or nonexistent company.' });
    }

    project.status = status;
    await project.save();

    return res.json({
      message: `Project status set to ${status}.`,
      project
    });
  } catch (error) {
    console.error('setProjectStatus error:', error);
    return res.status(500).json({ message: 'Failed to set project status.', error: error.message });
  }
};

/**
 * POST /api/projects/:id/administrators
 * Assign or update a project administrator or member.
 */
const assignProjectAdmin = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { userId, role = 'project_admin' } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'A valid userId is required.' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // Verify parent company is active
    const company = await Company.findById(project.companyId);
    if (!company || !company.isActive) {
      return res.status(400).json({ message: 'Cannot assign project members under an inactive or nonexistent company.' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found.' });
    }

    if (!['project_admin', 'manager', 'employee'].includes(role)) {
      return res.status(400).json({ message: 'Invalid project role.' });
    }

    // Privilege escalation prevention:
    // Only Super Admin or authorized Company Admin can assign 'project_admin' role.
    // Project Admins may assign managers and employees only.
    const isSuperAdmin = req.isSuperAdmin === true || String(req.user.role || '').toLowerCase() === 'super_admin';
    const isCompanyAdmin = req.isCompanyAdmin === true;

    if (role === 'project_admin' && !isSuperAdmin && !isCompanyAdmin) {
      return res.status(403).json({
        message: 'Forbidden: Only Super Admin or Company Admin can assign the project_admin role.'
      });
    }

    const actorId = req.user.userId || req.user.id || req.user._id;

    let membership = await UserProjectMembership.findOne({ projectId, userId });
    if (membership) {
      membership.role = role;
      membership.isActive = true;
      membership.deactivatedAt = null;
      membership.deactivatedBy = null;
      await membership.save();
    } else {
      membership = await UserProjectMembership.create({
        companyId: project.companyId,
        projectId,
        userId,
        role,
        formAccessGranted: true,
        isActive: true,
        createdBy: actorId
      });
    }

    return res.status(200).json({
      message: 'Project administrator/member assigned successfully.',
      membership
    });
  } catch (error) {
    console.error('assignProjectAdmin error:', error);
    return res.status(500).json({ message: 'Failed to assign project administrator.', error: error.message });
  }
};

/**
 * GET /api/projects/:id/members
 * List project members.
 */
const listProjectMembers = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const memberships = await UserProjectMembership.find({ projectId, isActive: true })
      .populate('userId', 'name email designation role department employeeId')
      .sort({ createdAt: -1 });

    return res.json({ members: memberships });
  } catch (error) {
    console.error('listProjectMembers error:', error);
    return res.status(500).json({ message: 'Failed to list project members.', error: error.message });
  }
};

/**
 * GET /api/projects/my
 * List all projects the authenticated user is authorized to access across companies.
 * - super_admin: all active projects across all companies.
 * - company_admin: all active projects under their active companies.
 * - project_admin / manager / employee: active projects with active UserProjectMembership.
 */
const listMyAuthorizedProjects = async (req, res) => {
  try {
    const userRole = String(req.user.role || '').toLowerCase();
    const actorId = req.user.userId || req.user.id || req.user._id;

    if (userRole === 'super_admin') {
      const projects = await Project.find({ status: { $ne: 'archived' } })
        .populate('companyId', 'name code isActive')
        .sort({ createdAt: -1 });
      return res.json({ projects });
    }

    const CompanyMembership = require('../models/CompanyMembership');
    // Check if user is company_admin in any companies
    const companyMemberships = await CompanyMembership.find({
      userId: actorId,
      role: 'company_admin',
      isActive: true
    }).select('companyId');

    const adminCompanyIds = companyMemberships.map(m => m.companyId);

    // Also find explicit project memberships
    const projectMemberships = await UserProjectMembership.find({
      userId: actorId,
      isActive: true
    }).select('projectId role');

    const explicitProjectIds = projectMemberships.map(m => m.projectId);

    // Query projects: either under administered companies OR explicitly assigned
    const projects = await Project.find({
      $or: [
        { companyId: { $in: adminCompanyIds }, status: { $ne: 'archived' } },
        { _id: { $in: explicitProjectIds }, status: { $ne: 'archived' } }
      ]
    })
      .populate('companyId', 'name code isActive')
      .sort({ createdAt: -1 });

    // Filter out projects belonging to inactive companies
    const validProjects = projects.filter(p => p.companyId && p.companyId.isActive);

    return res.json({ projects: validProjects });
  } catch (error) {
    console.error('listMyAuthorizedProjects error:', error);
    return res.status(500).json({ message: 'Failed to list authorized projects.', error: error.message });
  }
};

/**
 * DELETE /api/projects/:id/members/:userId
 * Revoke project membership for a user without deleting their user account.
 */
const revokeProjectMember = async (req, res) => {
  try {
    const { id: projectId, userId } = req.params;
    const actorId = req.user.userId || req.user.id || req.user._id;

    const membership = await UserProjectMembership.findOne({ projectId, userId });
    if (!membership) {
      return res.status(404).json({ message: 'Project membership not found.' });
    }

    const updateFields = {
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedBy: actorId
    };
    if (!membership.createdBy) {
      updateFields.createdBy = actorId;
    }

    const updatedMembership = await UserProjectMembership.findByIdAndUpdate(
      membership._id,
      { $set: updateFields },
      { new: true }
    );

    return res.json({
      message: 'Project membership revoked successfully.',
      membership: updatedMembership
    });
  } catch (error) {
    console.error('revokeProjectMember error:', error);
    return res.status(500).json({ message: 'Failed to revoke project membership.', error: error.message });
  }
};

module.exports = {
  createProject,
  listCompanyProjects,
  listMyAuthorizedProjects,
  getProjectById,
  updateProject,
  setProjectStatus,
  assignProjectAdmin,
  listProjectMembers,
  revokeProjectMember
};
