const express = require('express');
const router = express.Router();
const { getFitmentByEmployee, upsertFitment } = require('../controllers/fitmentController');
const verifyToken = require('../middleware/verifyToken');

router.get('/:employeeId', verifyToken, getFitmentByEmployee);
router.post('/', verifyToken, upsertFitment);

module.exports = router;
