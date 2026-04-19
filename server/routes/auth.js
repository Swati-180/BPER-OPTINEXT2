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
} = require('../controllers/authController');
const verifyToken = require('../middleware/verifyToken');

router.post('/signup', register);
router.post('/register', register);
router.post('/request-access', requestAccess);
router.post('/login', login);
router.get('/me', verifyToken, getMe);
router.patch('/me', verifyToken, updateMe);
router.post('/me/change-password', verifyToken, changeMyPassword);
router.get('/users', verifyToken, getAllUsers);
router.patch('/users/:id', verifyToken, updateUser);
router.post('/users/:id/reset-password', verifyToken, resetUserPassword);
router.patch('/users/bulk', verifyToken, bulkUpdateUsers);

module.exports = router;
