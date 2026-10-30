const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const requireRoles = require('../middleware/roleAccess');
const { getAssumptions, updateAssumptions } = require('../controllers/configController');

// GET /api/config/assumptions: Available to Admins and Managers for dashboard/report consumption
router.get('/assumptions', verifyToken, requireRoles(['admin', 'manager']), getAssumptions);

// PUT /api/config/assumptions: Restricted strictly to Administrators
router.put('/assumptions', verifyToken, requireRoles(['admin']), updateAssumptions);

module.exports = router;
