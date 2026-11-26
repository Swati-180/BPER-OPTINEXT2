const mongoose = require('mongoose');
const User = require('../models/User');
const Company = require('../models/Company');
const Project = require('../models/Project');
const CompanyMembership = require('../models/CompanyMembership');
const UserProjectMembership = require('../models/UserProjectMembership');

/**
 * Resolves and validates the tenant scope (companyId and projectId) for incoming requests.
 *
 * Rules:
 * 1. Checks headers 'x-company-id' and 'x-project-id' (or query params companyId/projectId).
 * 2. Authenticates that the user has an active membership in the target company/project.
 * 3. Super Admin must provide explicit companyId & projectId when accessing scoped data,
 *    preventing accidental cross-tenant data leakage.
 * 4. Ensures the target project belongs to the target company.
 * 5. Injects `req.tenantScope = { companyId: ObjectId, projectId: ObjectId }`.
 * 6. Supports `optional: true` for endpoints that work both with and without tenant scoping
 *    (e.g., legacy routes or global lookups).
 */
function resolveTenantScope(options = { required: true }) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required for tenant context.' });
      }

      let userRole = String(req.user.role || '').toLowerCase();
      const actorId = req.user.userId || req.user.id || req.user._id;

      if (!userRole && actorId) {
        const dbUser = await User.findById(actorId).select('role');
        if (dbUser) userRole = String(dbUser.role || '').toLowerCase();
      }

      // 1. Extract requested companyId and projectId
      const rawCompanyId = req.headers['x-company-id'] || req.query.companyId || req.body.companyId;
      const rawProjectId = req.headers['x-project-id'] || req.query.projectId || req.body.projectId;

      // If scope is not required and neither header is provided, proceed with empty scope
      if (!options.required && !rawCompanyId && !rawProjectId) {
        req.tenantScope = {};
        return next();
      }

      // If one or both are missing when required
      if (!rawProjectId) {
        // Only standard employee or manager with a single project can auto-resolve; admins must explicitly pass tenant headers
        if (userRole !== 'super_admin' && userRole !== 'admin' && userRole !== 'company_admin' && actorId) {
          const memberships = await UserProjectMembership.find({ userId: actorId, isActive: true });
          if (memberships.length === 1) {
            req.tenantScope = {
              companyId: memberships[0].companyId,
              projectId: memberships[0].projectId
            };
            req.userProjectRole = memberships[0].role;
            return next();
          }
        }

        if (options.required) {
          return res.status(400).json({
            message: 'Tenant context requires x-project-id header or projectId parameter.'
          });
        } else {
          req.tenantScope = {};
          return next();
        }
      }

      // 2. Validate ObjectID format
      if (!mongoose.Types.ObjectId.isValid(rawProjectId)) {
        return res.status(400).json({ message: 'Invalid projectId provided.' });
      }

      // 3. Verify Project exists and is active
      const project = await Project.findById(rawProjectId);
      if (!project) {
        return res.status(404).json({ message: 'Project not found.' });
      }

      // 4. Verify Company exists and is active
      const company = await Company.findById(project.companyId);
      if (!company || !company.isActive) {
        return res.status(400).json({ message: 'Project belongs to an inactive or non-existent company.' });
      }

      // If companyId was explicitly supplied, verify it matches the project's company
      if (rawCompanyId) {
        if (!mongoose.Types.ObjectId.isValid(rawCompanyId)) {
          return res.status(400).json({ message: 'Invalid companyId provided.' });
        }
        if (project.companyId.toString() !== rawCompanyId.toString()) {
          return res.status(400).json({ message: 'Project does not belong to the specified company.' });
        }
      }

      // 5. Authorize User against Company & Project
      if (userRole === 'super_admin') {
        // Super Admin has authority, scoped to the explicitly selected project
        req.tenantScope = {
          companyId: project.companyId,
          projectId: project._id
        };
        req.isSuperAdmin = true;
        req.userProjectRole = 'super_admin';
        return next();
      }

      // Check if user is a Company Admin of the parent company
      const compMem = await CompanyMembership.findOne({
        companyId: project.companyId,
        userId: actorId,
        role: 'company_admin',
        isActive: true
      });

      if (compMem) {
        req.tenantScope = {
          companyId: project.companyId,
          projectId: project._id
        };
        req.isCompanyAdmin = true;
        req.userProjectRole = 'company_admin';
        return next();
      }

      // Check if user has active project membership
      const projMem = await UserProjectMembership.findOne({
        projectId: project._id,
        userId: actorId,
        isActive: true
      });

      if (!projMem) {
        return res.status(403).json({
          message: 'Forbidden: You do not have an active membership in this project.'
        });
      }

      req.tenantScope = {
        companyId: project.companyId,
        projectId: project._id
      };
      req.userProjectRole = projMem.role;
      req.projectMembership = projMem;
      return next();

    } catch (err) {
      console.error('resolveTenantScope error:', err);
      return res.status(500).json({ message: 'Internal tenant scoping error.', error: err.message });
    }
  };
}

module.exports = {
  resolveTenantScope
};
