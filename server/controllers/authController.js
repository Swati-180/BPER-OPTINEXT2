const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminWhitelist = require('../models/AdminWhitelist');
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
      organization = '',
      employeeId,
      designation,
      band,
      client,
      location,
      supervisorName,
      supervisorTitle,
      department,
    } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // Check whitelist for admin role assignment
    const whitelistedAdmin = await AdminWhitelist.findOne({ email: email.toLowerCase().trim() });
    
    // Employees are strictly invite-only
    if (req.body.role === 'employee') {
      return res.status(403).json({ message: 'Employee accounts are strictly created via email invitations.' });
    }

    // Assign role based on final requirements:
    // Whitelisted -> admin. Non-whitelisted -> manager.
    const role = whitelistedAdmin ? 'admin' : 'manager';
    const formAccessGranted = true;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
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
      client: !isMissingValue(client) ? String(client).trim() : 'US-Client',
      location: !isMissingValue(location) ? String(location).trim() : '',
      supervisorName: !isMissingValue(supervisorName) ? String(supervisorName).trim() : '',
      supervisorTitle: !isMissingValue(supervisorTitle) ? String(supervisorTitle).trim() : '',
      department: !isMissingValue(department) ? String(department).trim() : '',
      isActive: true,
      formAccessGranted
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
        department: user.department || user.organization,
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
    if (user.isRosterOnly || user.isVacant || user.role === 'position' || !user.password) {
      return res.status(401).json({ message: 'Account is not configured for web login. Please request an invitation.' });
    }

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
        department: user.department || user.organization,
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
      'department',
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
    const { recordType, role, department, status, search } = req.query;

    const baseQuery = {};

    // Record Type Filter:
    // 'all' | 'login_accounts' | 'operational_staff' | 'vacancies' | 'archived_demos'
    if (recordType === 'login_accounts') {
      baseQuery.isRosterOnly = { $ne: true };
      baseQuery.isVacant = { $ne: true };
      baseQuery.role = { $nin: ['position', 'archived_demo'] };
      baseQuery.password = { $exists: true, $ne: '' };
    } else if (recordType === 'operational_staff') {
      baseQuery.role = 'employee';
      baseQuery.isVacant = { $ne: true };
      baseQuery.isArchivedDemo = { $ne: true };
    } else if (recordType === 'vacancies') {
      baseQuery.$or = [{ role: 'position' }, { isVacant: true }];
    } else if (recordType === 'archived_demos') {
      baseQuery.$or = [{ isArchivedDemo: true }, { role: 'archived_demo' }];
    }

    if (role && role !== 'All') {
      baseQuery.role = role.toLowerCase().trim();
    }

    if (department && department !== 'All') {
      baseQuery.department = department;
    }

    if (status && status !== 'All') {
      baseQuery.isActive = status === 'Active';
    }

    if (search && search.trim()) {
      const q = search.trim();
      const regex = new RegExp(q, 'i');
      baseQuery.$or = [
        { name: regex },
        { employeeId: regex },
        { email: regex },
        { designation: regex },
        { supervisorName: regex }
      ];
    }

    const users = await User.find(baseQuery).sort({ createdAt: -1 });

    const existingBperIds = users
      .map((user) => user.employeeId)
      .filter((id) => /^BPER-\d+$/.test(String(id)))
      .map((id) => Number(String(id).split('-')[1]))
      .filter((num) => Number.isFinite(num));

    let nextBperId = (existingBperIds.length > 0 ? Math.max(...existingBperIds) : 100) + 1;

    for (const user of users) {
      // Do not mutate or auto-assign BPER IDs to roster-only records, vacancies, or archived demo accounts
      if (user.isRosterOnly || user.isVacant || user.role === 'position' || user.isArchivedDemo) {
        continue;
      }

      let shouldSave = false;

      if (isMissingValue(user.name) && user.email) {
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

    // Compute workforce breakdown summary for tabs and metrics
    const [
      totalCount,
      loginAccountsCount,
      operationalStaffCount,
      vacanciesCount,
      archivedDemosCount
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({
        isRosterOnly: { $ne: true },
        isVacant: { $ne: true },
        role: { $nin: ['position', 'archived_demo'] },
        password: { $exists: true, $ne: '' }
      }),
      User.countDocuments({ role: 'employee', isVacant: { $ne: true }, isArchivedDemo: { $ne: true } }),
      User.countDocuments({ $or: [{ role: 'position' }, { isVacant: true }] }),
      User.countDocuments({ $or: [{ isArchivedDemo: true }, { role: 'archived_demo' }] })
    ]);

    const sanitizedUsers = users.map((user) => {
      const hasPassword = Boolean(user.password && user.password.length > 0);
      const next = user.toObject();
      delete next.password;
      next.hasPassword = hasPassword;

      // Explicitly classify record category
      if (next.isArchivedDemo || next.role === 'archived_demo') {
        next.recordCategory = 'archived_demo';
      } else if (next.isVacant || next.role === 'position') {
        next.recordCategory = 'position';
      } else if (next.isRosterOnly || !hasPassword) {
        next.recordCategory = 'roster_only';
      } else {
        next.recordCategory = 'login_account';
      }
      return next;
    });

    res.json({
      users: sanitizedUsers,
      counts: {
        total: totalCount,
        loginAccounts: loginAccountsCount,
        operationalStaff: operationalStaffCount,
        vacancies: vacanciesCount,
        archivedDemos: archivedDemosCount
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) return res.status(404).json({ message: 'User not found.' });

    const updateData = { ...req.body };

    // Prevent turning a vacant position or archived demo record into an active operational employee or granting login
    if (existingUser.isVacant || existingUser.role === 'position') {
      if (updateData.role && updateData.role !== 'position') {
        return res.status(400).json({ message: 'Vacant positions cannot be converted directly into user accounts. Please invite the employee.' });
      }
      delete updateData.password;
      delete updateData.isVacant;
    }

    if (existingUser.isArchivedDemo) {
      if (updateData.isActive === true) {
        return res.status(400).json({ message: 'Archived demo accounts cannot be reactivated as active workforce.' });
      }
    }
    
    // Explicitly reject if a non-admin tries to alter the role
    if (updateData.role && updateData.role !== existingUser.role && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can change user roles.' });
    }

    if (req.user.role !== 'admin') {
      delete updateData.role;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
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
    
    if (action === 'change_role' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can change user roles.' });
    }

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
