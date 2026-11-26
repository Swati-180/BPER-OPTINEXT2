const express = require('express');
const router = express.Router();
const { getFitmentByEmployee, upsertFitment } = require('../controllers/fitmentController');
const verifyToken = require('../middleware/verifyToken');
const { resolveTenantScope } = require('../middleware/tenantContext');

router.get('/:employeeId', verifyToken, resolveTenantScope({ required: true }), getFitmentByEmployee);
router.post('/', verifyToken, resolveTenantScope({ required: true }), upsertFitment);

module.exports = router;
