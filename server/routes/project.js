const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const {
  requireProjectCreationPermission,
  requireProjectAdmin
} = require('../middleware/tenantAuth');
const {
  createProject,
  listMyAuthorizedProjects,
  getProjectById,
  updateProject,
  setProjectStatus,
  assignProjectAdmin,
  listProjectMembers,
  revokeProjectMember
} = require('../controllers/projectController');

// List authorized projects for current user (Company Admin, Manager, etc.)
router.get('/my', verifyToken, listMyAuthorizedProjects);

// Create project under a company (enforces canCreateProjects permission)
router.post('/', verifyToken, requireProjectCreationPermission, createProject);

// Get project details
router.get('/:id', verifyToken, requireProjectAdmin, getProjectById);

// Update project
router.patch('/:id', verifyToken, requireProjectAdmin, updateProject);

// Archive or restore project
router.patch('/:id/archive', verifyToken, requireProjectAdmin, setProjectStatus);

// Assign project administrator or member
router.post('/:id/administrators', verifyToken, requireProjectAdmin, assignProjectAdmin);

// List project members
router.get('/:id/members', verifyToken, requireProjectAdmin, listProjectMembers);

// Revoke project membership for a user
router.delete('/:id/members/:userId', verifyToken, requireProjectAdmin, revokeProjectMember);

module.exports = router;
