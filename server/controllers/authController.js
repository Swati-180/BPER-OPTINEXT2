const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logAction } = require('../utils/auditLogger');

const requestAccess = async (req, res) => {
  return res.status(410).json({ message: 'Request access flow is deprecated. Use /api/auth/signup.' });
};

const register = async (req, res) => {
  try {
    const { name, email, password, role = 'manager', organization = '' } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    const validRoles = ['manager', 'employee'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Choose from: ${validRoles.join(', ')}` });
    }

    if (role === 'employee' && !organization.trim()) {
      return res.status(400).json({ message: 'Organization is required for employee signup.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ message: 'Email already registered.' });

    const user = await User.create({ 
      name: name.trim(), 
      email: email.toLowerCase().trim(), 
      password, 
      role, 
      organization: organization.trim(),
      isActive: true
    });
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ 
      message: 'User created successfully.', 
      token,
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization: user.organization
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) return res.status(401).json({ message: 'Invalid credentials.' });
    if (user.isActive === false) return res.status(403).json({ message: 'Account pending approval.' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials.' });

    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization: user.organization
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const allowedFields = [
      'name',
      'designation',
      'location',
      'organization',
      'supervisorName',
      'supervisorTitle',
      'client',
      'band',
    ];

    const previous = {};
    const nextValues = {};

    for (const field of allowedFields) {
      if (!(field in req.body)) continue;

      const value = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      previous[field] = user[field] || '';
      user[field] = value;
      nextValues[field] = value;
    }

    if (typeof req.body.name === 'string' && !req.body.name.trim()) {
      return res.status(400).json({ message: 'Name cannot be empty.' });
    }

    await user.save();

    await logAction({
      req,
      action: 'PROFILE_UPDATED',
      targetType: 'User',
      targetId: user._id,
      description: `User profile updated: ${Object.keys(nextValues).join(', ') || 'no fields'}`,
      prev: previous,
      next: nextValues,
    });

    return res.json({
      message: 'Profile updated successfully.',
      user: await User.findById(user._id).select('-password'),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    await user.save();

    await logAction({
      req,
      action: 'PASSWORD_CHANGED',
      targetType: 'User',
      targetId: user._id,
      description: 'User changed own password.',
    });

    return res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    return res.json({ message: 'User updated.', user });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { tempPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    user.password = tempPassword;
    await user.save();
    return res.json({ message: 'Password reset successful.' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const bulkUpdateUsers = async (req, res) => {
  try {
    const { userIds, action, role } = req.body;
    const query = { _id: { $in: userIds } };
    if (action === 'deactivate') {
      await User.updateMany(query, { $set: { isActive: false, status: 'deactivated' } });
    } else if (action === 'activate') {
      await User.updateMany(query, { $set: { isActive: true, status: 'active' } });
    } else if (action === 'change_role') {
      await User.updateMany(query, { $set: { role } });
    }

    // AUDIT LOG
    await logAction({
        req,
        action: action === 'deactivate' ? 'USER_DEACTIVATED' : action === 'activate' ? 'USER_ACTIVATED' : 'USER_ROLE_CHANGED',
        targetType: 'User',
        targetId: userIds.join(','),
        description: `Bulk ${action} for ${userIds.length} users. ${role ? 'New role: ' + role : ''}`,
        next: { userIds, action, role }
    });

    return res.json({ message: 'Bulk update successful.' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
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
};
