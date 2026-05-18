const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logAction } = require('../utils/auditLogger');

function isMissingValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'na' || normalized === 'n/a';
}

function toTitleCaseWords(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

function inferNameFromEmail(email) {
  const localPart = String(email || '').split('@')[0] || 'User';
  const spaced = localPart.replace(/[._-]+/g, ' ');
  return toTitleCaseWords(spaced) || 'User';
}

function inferBand(role) {
  return role === 'manager' || role === 'admin' ? 'M1' : 'B1';
}

function inferDesignation(role) {
  return role === 'manager' || role === 'admin' ? 'Manager' : 'Employee';
}

async function getNextBperEmployeeId() {
  const existing = await User.find({ employeeId: { $regex: /^BPER-\d+$/ } }, 'employeeId').lean();
  let max = 100;

  existing.forEach((item) => {
    const numericPart = Number(String(item.employeeId).split('-')[1]);
    if (Number.isFinite(numericPart) && numericPart > max) {
      max = numericPart;
    }
  });

  return `BPER-${String(max + 1).padStart(3, '0')}`;
}

const requestAccess = async (req, res) => {
  return res.status(410).json({ message: 'Request access flow is deprecated. Use /api/auth/signup.' });
};

const register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = 'manager',
      organization = '',
      employeeId,
      designation,
      band,
      client,
      location,
      supervisorName,
      supervisorTitle,
    } = req.body;
    
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

    let resolvedEmployeeId = typeof employeeId === 'string' ? employeeId.trim() : '';
    if (!isMissingValue(resolvedEmployeeId)) {
      const existingEmployeeId = await User.findOne({ employeeId: resolvedEmployeeId });
      if (existingEmployeeId) {
        return res.status(409).json({ message: 'Employee ID already in use.' });
      }
    } else {
      resolvedEmployeeId = await getNextBperEmployeeId();
    }

    const resolvedName = !isMissingValue(name) ? String(name).trim() : inferNameFromEmail(email);

    const user = await User.create({ 
      name: resolvedName,
      email: email.toLowerCase().trim(), 
      password, 
      role, 
      organization: organization.trim(),
      employeeId: resolvedEmployeeId,
      designation: !isMissingValue(designation) ? String(designation).trim() : inferDesignation(role),
      band: !isMissingValue(band) ? String(band).trim().toUpperCase() : inferBand(role),
      client: !isMissingValue(client) ? String(client).trim() : 'BU011',
      location: !isMissingValue(location) ? String(location).trim() : '',
      supervisorName: !isMissingValue(supervisorName) ? String(supervisorName).trim() : '',
      supervisorTitle: !isMissingValue(supervisorTitle) ? String(supervisorTitle).trim() : '',
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
        organization: user.organization,
        employeeId: user.employeeId,
        designation: user.designation,
        band: user.band,
        location: user.location,
        maxMonthlyHours: user.maxMonthlyHours
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
        organization: user.organization,
        employeeId: user.employeeId,
        designation: user.designation,
        band: user.band,
        location: user.location,
        maxMonthlyHours: user.maxMonthlyHours
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
      'maxMonthlyHours',
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
    const users = await User.find({}).sort({ createdAt: 1 });

    const existingBperIds = users
      .map((user) => user.employeeId)
      .filter((id) => /^BPER-\d+$/.test(String(id)))
      .map((id) => Number(String(id).split('-')[1]))
      .filter((num) => Number.isFinite(num));

    let nextBperId = (existingBperIds.length > 0 ? Math.max(...existingBperIds) : 100) + 1;

    for (const user of users) {
      let shouldSave = false;

      if (isMissingValue(user.name)) {
        user.name = inferNameFromEmail(user.email);
        shouldSave = true;
      }

      if (isMissingValue(user.employeeId)) {
        user.employeeId = `BPER-${String(nextBperId).padStart(3, '0')}`;
        nextBperId += 1;
        shouldSave = true;
      }

      if (isMissingValue(user.band)) {
        user.band = inferBand(user.role);
        shouldSave = true;
      }

      if (isMissingValue(user.designation)) {
        user.designation = inferDesignation(user.role);
        shouldSave = true;
      }

      if (isMissingValue(user.client)) {
        user.client = !isMissingValue(user.organization) ? String(user.organization).trim() : 'BU011';
        shouldSave = true;
      }

      if (shouldSave) {
        await user.save();
      }
    }

    const sanitizedUsers = users.map((user) => {
      const next = user.toObject();
      delete next.password;
      return next;
    });

    res.json(sanitizedUsers);
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
    } else if (action === 'grantFormAccess') {
      // Grant form submission access — bypasses submission window for new users
      await User.updateMany(query, { $set: { formAccessGranted: true } });
    } else if (action === 'revokeFormAccess') {
      await User.updateMany(query, { $set: { formAccessGranted: false } });
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

const uploadUsers = async (req, res) => {
  try {
    const { users } = req.body;
    if (!Array.isArray(users)) {
      return res.status(400).json({ message: 'Users array is required.' });
    }
    console.log("Incoming bulk upload users payload:", JSON.stringify(users, null, 2));
    
    let added = 0;
    let updated = 0;
    const errors = [];
    
    for (const [index, userData] of users.entries()) {
      try {
        if (!userData.email) {
          errors.push(`Row ${index + 1}: Email is required.`);
          continue;
        }
        
        const emailToSearch = userData.email.toLowerCase().trim();
        let user = await User.findOne({ email: emailToSearch });
        
        if (user) {
          // Update
          user.name = userData.name || user.name;
          user.organization = userData.organization || user.organization;
          user.designation = userData.designation || user.designation;
          user.location = userData.location || user.location;
          user.supervisorName = userData.supervisorName || user.supervisorName;
          await user.save();
          updated++;
        } else {
          // Create
          let newEmployeeId = userData.employeeId ? userData.employeeId.toString().trim() : null;
          if (!newEmployeeId) {
            newEmployeeId = await getNextBperEmployeeId();
          }
          
          let emailPrefix = userData.email.split('@')[0];
          let defaultPassword = userData.employeeId || (emailPrefix + "123");
          
          await User.create({
            name: userData.name || 'Unknown',
            email: userData.email.toLowerCase().trim(),
            employeeId: newEmployeeId,
            password: defaultPassword,
            role: 'employee',
            organization: userData.organization || '',
            designation: userData.designation || '',
            location: userData.location || '',
            supervisorName: userData.supervisorName || '',
            isActive: true
          });
          added++;
        }
      } catch (err) {
        console.error(`Error on row ${index + 1}:`, err);
        errors.push(`Row ${index + 1}: ${err.message}`);
      }
    }
    
    await logAction({
        req,
        action: 'USERS_BULK_UPLOADED',
        targetType: 'User',
        targetId: 'bulk',
        description: `Bulk uploaded users. Added: ${added}, Updated: ${updated}`,
        next: { added, updated, errorCount: errors.length }
    });
    
    return res.json({ 
      message: `Upload complete. Added: ${added}, Updated: ${updated}.`,
      added,
      updated,
      errors: errors.length > 0 ? errors : undefined
    });
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
  uploadUsers,
};
