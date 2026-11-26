const mongoose = require('mongoose');
const CompanyMembership = require('../models/CompanyMembership');
const UserProjectMembership = require('../models/UserProjectMembership');

/**
 * Validates that the authenticated actor has authority to manage the company.
 * - Super Admin has platform-wide authority over any company.
 * - Company Admin has authority strictly within their company where role === 'company_admin' and isActive === true.
 * - Project Admin, Manager, and Employee are strictly forbidden.
 */
async function requireCompanyAdmin(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    // Determine target companyId from params, body, or query
    const companyId = req.params.companyId || req.params.id || req.body.companyId || req.query.companyId;
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: 'A valid companyId is required.' });
    }

    let userRole = String(req.user.role || '').toLowerCase();
    const actorId = req.user.userId || req.user.id || req.user._id;

    if (!userRole && actorId) {
      const User = require('../models/User');
      const u = await User.findById(actorId).select('role');
      if (u) userRole = String(u.role || '').toLowerCase();
    }

    if (userRole === 'super_admin') {
      req.isSuperAdmin = true;
      return next();
    }
    const membership = await CompanyMembership.findOne({
      companyId,
      userId: actorId,
      role: 'company_admin',
      isActive: true
    });

    if (!membership) {
      return res.status(403).json({
        message: 'Forbidden: You do not have company administrator privileges for this company.'
      });
    }

    req.companyMembership = membership;
    next();
  } catch (err) {
    console.error('requireCompanyAdmin error:', err);
    return res.status(500).json({ message: 'Internal authorization error.', error: err.message });
  }
}

/**
 * Validates project creation authority under a company.
 * - Super Admin can create projects in any company.
 * - Company Admin can create projects in their company.
 * - Project Admin can ONLY create projects if CompanyMembership exists with canCreateProjects === true.
 * - Manager and Employee can NEVER create projects.
 */
async function requireProjectCreationPermission(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const userRole = String(req.user.role || '').toLowerCase();
    if (userRole === 'super_admin') {
      req.isSuperAdmin = true;
      return next();
    }

    const companyId = req.body.companyId || req.params.companyId;
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: 'A valid companyId is required to create a project.' });
    }

    const actorId = req.user.userId || req.user.id || req.user._id;
    const membership = await CompanyMembership.findOne({
      companyId,
      userId: actorId,
      isActive: true
    });

    if (!membership) {
      return res.status(403).json({
        message: 'Forbidden: You have no active membership in this company.'
      });
    }

    if (membership.role === 'company_admin') {
      req.companyMembership = membership;
      return next();
    }

    if (membership.role === 'project_admin' && membership.canCreateProjects === true) {
      req.companyMembership = membership;
      return next();
    }

    return res.status(403).json({
      message: 'Forbidden: You do not have project creation privileges in this company.'
    });
  } catch (err) {
    console.error('requireProjectCreationPermission error:', err);
    return res.status(500).json({ message: 'Internal authorization error.', error: err.message });
  }
}

/**
 * Validates project administration authority.
 * - Super Admin has platform-wide authority.
 * - Company Admin of the project's parent company has authority.
 * - Project Admin assigned to this project with role === 'project_admin' has authority.
 * - Manager and Employee are forbidden from project administration.
 */
async function requireProjectAdmin(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const projectId = req.params.projectId || req.params.id || req.body.projectId;
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'A valid projectId is required.' });
    }

    const userRole = String(req.user.role || '').toLowerCase();
    if (userRole === 'super_admin') {
      req.isSuperAdmin = true;
      return next();
    }

    const Project = require('../models/Project');
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    const actorId = req.user.userId || req.user.id || req.user._id;

    // Check if actor is Company Admin for this project's company
    const compMem = await CompanyMembership.findOne({
      companyId: project.companyId,
      userId: actorId,
      role: 'company_admin',
      isActive: true
    });

    if (compMem) {
      req.project = project;
      req.companyMembership = compMem;
      req.isCompanyAdmin = true;
      return next();
    }

    // Check if actor is Project Admin for this project
    const projMem = await UserProjectMembership.findOne({
      projectId,
      userId: actorId,
      role: 'project_admin',
      isActive: true
    });

    if (projMem) {
      req.project = project;
      req.projectMembership = projMem;
      req.isCompanyAdmin = false;
      return next();
    }

    return res.status(403).json({
      message: 'Forbidden: You do not have project administration privileges for this project.'
    });
  } catch (err) {
    console.error('requireProjectAdmin error:', err);
    return res.status(500).json({ message: 'Internal authorization error.', error: err.message });
  }
}

/**
 * Enforces that only Super Admin can invoke the endpoint.
 */
async function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  let userRole = String(req.user.role || '').toLowerCase();
  if (!userRole && req.user.userId) {
    const User = require('../models/User');
    const u = await User.findById(req.user.userId).select('role');
    if (u) userRole = String(u.role || '').toLowerCase();
  }
  if (userRole !== 'super_admin') {
    return res.status(403).json({ message: 'Forbidden: Super Admin privileges required.' });
  }
  next();
}

module.exports = {
  requireSuperAdmin,
  requireCompanyAdmin,
  requireProjectCreationPermission,
  requireProjectAdmin
};
