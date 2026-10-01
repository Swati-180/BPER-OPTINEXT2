const express = require('express');
const router = express.Router();
const {
	register,
	requestAccess,
	login,
	getMe,
	updateMe,
	changeMyPassword,
	getAllUsers,
	updateUser,
	resetUserPassword,
	bulkUpdateUsers,
	uploadUsers,
} = require('../controllers/authController');
const verifyToken = require('../middleware/verifyToken');
const requireRoles = require('../middleware/roleAccess');

router.post('/signup', register);
router.post('/register', register);
router.post('/request-access', requestAccess);
router.post('/login', login);
router.get('/me', verifyToken, getMe);
router.patch('/me', verifyToken, updateMe);
router.post('/me/change-password', verifyToken, changeMyPassword);
router.get('/users', verifyToken, requireRoles(['manager', 'admin']), getAllUsers);
router.patch('/users/bulk', verifyToken, requireRoles(['manager', 'admin']), bulkUpdateUsers);
router.post('/users/upload', verifyToken, requireRoles(['manager', 'admin']), uploadUsers);
router.patch('/users/:id', verifyToken, requireRoles(['manager', 'admin']), updateUser);
router.post('/users/:id/reset-password', verifyToken, requireRoles(['manager', 'admin']), resetUserPassword);

module.exports = router;
