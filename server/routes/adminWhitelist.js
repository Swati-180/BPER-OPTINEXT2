const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const requireRoles = require('../middleware/roleAccess');
const { getWhitelist, addEmail, removeEmail } = require('../controllers/adminWhitelistController');

router.use(verifyToken, requireRoles(['admin']));

router.get('/', getWhitelist);
router.post('/', addEmail);
router.delete('/:id', removeEmail);

module.exports = router;
