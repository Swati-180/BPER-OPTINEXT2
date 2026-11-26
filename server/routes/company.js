const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const {
  requireSuperAdmin,
  requireCompanyAdmin
} = require('../middleware/tenantAuth');
const {
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
} = require('../controllers/companyController');
const { listCompanyProjects } = require('../controllers/projectController');

// Super Admin Governance Stats Overview
router.get('/stats/overview', verifyToken, requireSuperAdmin, getGovernanceStats);

// Super Admin creates company
router.post('/', verifyToken, requireSuperAdmin, createCompany);

// List companies (Super Admin gets all, Company Admin gets their companies)
router.get('/', verifyToken, listCompanies);

// Get company details
router.get('/:id', verifyToken, requireCompanyAdmin, getCompanyById);

// Update company details
router.patch('/:id', verifyToken, requireCompanyAdmin, updateCompany);

// Activate/Deactivate company (Super Admin only)
router.patch('/:id/status', verifyToken, requireSuperAdmin, setCompanyStatus);

// Assign company administrators
router.post('/:id/administrators', verifyToken, requireCompanyAdmin, assignCompanyAdmin);

// List company administrators
router.get('/:id/administrators', verifyToken, requireCompanyAdmin, listCompanyAdmins);

// Deactivate or reactivate company administrator membership
router.patch('/:companyId/administrators/:adminId/status', verifyToken, requireCompanyAdmin, setCompanyAdminStatus);

// Replace company administrator
router.post('/:companyId/administrators/:adminId/replace', verifyToken, requireCompanyAdmin, replaceCompanyAdmin);

// List projects under a company
router.get('/:companyId/projects', verifyToken, requireCompanyAdmin, listCompanyProjects);

module.exports = router;
