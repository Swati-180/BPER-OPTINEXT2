const jwt = require('jsonwebtoken');
const User = require('../models/User');
const WDTSubmission = require('../models/WDTSubmission');
const AdminWhitelist = require('../models/AdminWhitelist');
const { logAction } = require('../utils/auditLogger');
const { invalidateFitmentSummaryCache } = require('./reportsController');
const { getEffectiveStandardMonthlyHours } = require('../services/assumptionsService');

// Verified synthetic/automated test accounts excluded from operational workforce listings and counts
// Note: Administrative accounts like BPER-000 (Admin) and BPER-999 (Manager) remain visible as genuine login accounts.
const EXCLUDED_WORKFORCE_IDS = Object.freeze([
  'TEST-BPER-9001'
]);

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

    invalidateFitmentSummaryCache();
    
    const standardMonthlyHours = await getEffectiveStandardMonthlyHours();
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
        maxMonthlyHours: user.hasCustomMaxHours ? user.maxMonthlyHours : standardMonthlyHours,
        hasCustomMaxHours: Boolean(user.hasCustomMaxHours),
        effectiveMaxMonthlyHours: user.hasCustomMaxHours ? user.maxMonthlyHours : standardMonthlyHours
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

    const standardMonthlyHours = await getEffectiveStandardMonthlyHours();
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
        maxMonthlyHours: user.hasCustomMaxHours ? user.maxMonthlyHours : standardMonthlyHours,
        hasCustomMaxHours: Boolean(user.hasCustomMaxHours),
        effectiveMaxMonthlyHours: user.hasCustomMaxHours ? user.maxMonthlyHours : standardMonthlyHours
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
    const standardMonthlyHours = await getEffectiveStandardMonthlyHours();
    const userObj = user.toObject();
    const hasExplicitOverride = Boolean(
      userObj.hasCustomMaxHours &&
      Number.isFinite(userObj.maxMonthlyHours) &&
      userObj.maxMonthlyHours > 0
    );
    userObj.effectiveMaxMonthlyHours = hasExplicitOverride ? userObj.maxMonthlyHours : standardMonthlyHours;
    userObj.standardMonthlyHours = standardMonthlyHours;
    if (!hasExplicitOverride) {
      userObj.maxMonthlyHours = standardMonthlyHours;
    }
    res.json(userObj);
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
    invalidateFitmentSummaryCache();

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

    // Fetch all active User collection records (excluding confirmed test accounts)
    const allDbUsers = await User.find({ employeeId: { $nin: EXCLUDED_WORKFORCE_IDS } }).sort({ createdAt: -1 });

    const existingBperIds = allDbUsers
      .map((user) => user.employeeId)
      .filter((id) => /^BPER-\d+$/.test(String(id)))
      .map((id) => Number(String(id).split('-')[1]))
      .filter((num) => Number.isFinite(num));

    let nextBperId = (existingBperIds.length > 0 ? Math.max(...existingBperIds) : 100) + 1;

    for (const user of allDbUsers) {
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

    const standardMonthlyHours = await getEffectiveStandardMonthlyHours();

    // Map existing DB users into sanitized presentation records
    const sanitizedDbUsers = allDbUsers.map((user) => {
      const hasPassword = Boolean(user.password && user.password.length > 0);
      const next = user.toObject();
      delete next.password;
      next.hasPassword = hasPassword;

      const hasExplicitOverride = Boolean(
        next.hasCustomMaxHours &&
        Number.isFinite(next.maxMonthlyHours) &&
        next.maxMonthlyHours > 0
      );
      next.hasCustomMaxHours = hasExplicitOverride;
      next.effectiveMaxMonthlyHours = hasExplicitOverride ? next.maxMonthlyHours : standardMonthlyHours;
      if (!hasExplicitOverride) {
        next.maxMonthlyHours = standardMonthlyHours;
      }

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

    // Known identifiers from existing DB users (for strict deduplication by ID and email)
    const existingEmpIdSet = new Set(sanitizedDbUsers.map(u => String(u.employeeId || '').trim()).filter(Boolean));
    const existingEmailSet = new Set(sanitizedDbUsers.map(u => String(u.email || '').toLowerCase().trim()).filter(Boolean));

    // Dynamic WDT Participant Ingestion:
    // Seamlessly supplement any operational workforce records present in WDT submissions that are missing from User collection
    // High-performance projection: retrieve only employee subdocument fields, excluding large payloads/activity arrays
    const wdtSubmissions = await WDTSubmission.find(
      {},
      {
        'employee.employeeId': 1,
        'employee.name': 1,
        'employee.email': 1,
        'employee.department': 1,
        'employee.designation': 1,
        'employee.grade': 1,
        'employee.organization': 1,
        'employee.location': 1,
        'employee.supervisorName': 1,
        'employee.supervisorTitle': 1,
        'employee.isVacant': 1,
        submittedAt: 1
      }
    )
      .sort({ submittedAt: -1 })
      .lean();

    const supplementalRoster = [];
    const seenWdtEmpIds = new Set();

    for (const s of wdtSubmissions) {
      const empId = String(s.employee?.employeeId || '').trim();
      const email = String(s.employee?.email || '').toLowerCase().trim();

      if (!empId || seenWdtEmpIds.has(empId) || EXCLUDED_WORKFORCE_IDS.includes(empId)) continue;
      seenWdtEmpIds.add(empId);

      // Deduplicate: If this employeeId or email already exists in User collection, preserve the User collection record
      if (existingEmpIdSet.has(empId) || (email && existingEmailSet.has(email))) {
        continue;
      }

      const rawName = String(s.employee?.name || '').trim();
      const isVac = rawName.toLowerCase() === 'vacant' || s.employee?.isVacant === true;

      // For vacancies, do not display synthetic demo emails; present as empty string ("No Web Login")
      const resolvedEmail = isVac ? '' : (s.employee?.email || '');

      supplementalRoster.push({
        _id: `roster-${empId}`,
        employeeId: empId,
        name: isVac ? `Vacant Position (${empId})` : (rawName || 'Unknown Staff'),
        email: resolvedEmail,
        department: s.employee?.department || 'Finance & Accounting',
        designation: s.employee?.designation || (isVac ? 'Budgeted Vacant Position' : 'Operational Staff'),
        band: s.employee?.grade || 'L1',
        client: s.employee?.organization || 'BU011',
        location: s.employee?.location || '',
        supervisorName: s.employee?.supervisorName || '',
        supervisorTitle: s.employee?.supervisorTitle || '',
        employeeType: 'Full-time',
        role: isVac ? 'position' : 'employee',
        status: isVac ? 'Inactive' : 'Active',
        recordCategory: isVac ? 'position' : 'operational_staff',
        isRosterOnly: true,
        isVacant: isVac,
        isArchivedDemo: false,
        hasPassword: false,
        maxMonthlyHours: standardMonthlyHours,
        hasCustomMaxHours: false,
        effectiveMaxMonthlyHours: standardMonthlyHours,
        source: 'wdt_participants'
      });
    }

    // Unified full workforce list (User DB accounts + non-colliding WDT participants)
    const combinedWorkforce = [...sanitizedDbUsers, ...supplementalRoster];

    // Compute authoritative reconciled counts across the entire operational workforce:
    // - Operational Staff: genuine non-vacant operational profiles in scope (248)
    // - Vacant Positions: genuine planned vacancy positions in scope (78)
    // - Login Accounts: verified system user accounts with login credentials (9 accounts: Admin, Manager, Employees)
    const operationalStaffRecords = combinedWorkforce.filter(u => u.recordCategory === 'operational_staff');
    const loginAccountsRecords = combinedWorkforce.filter(u => u.recordCategory === 'login_account');
    const vacanciesRecords = combinedWorkforce.filter(u => u.recordCategory === 'position');
    const archivedDemosRecords = combinedWorkforce.filter(u => u.recordCategory === 'archived_demo');

    const finalCounts = {
      total: combinedWorkforce.length,
      operationalStaff: operationalStaffRecords.length,
      loginAccounts: loginAccountsRecords.length,
      vacancies: vacanciesRecords.length,
      archivedDemos: archivedDemosRecords.length
    };

    // Filter combined workforce according to query parameters
    let filteredResults = combinedWorkforce;

    const requestedCategory = recordType || req.query.recordCategory;
    if (requestedCategory === 'login_accounts' || requestedCategory === 'login_account') {
      filteredResults = loginAccountsRecords;
    } else if (requestedCategory === 'operational_staff' || requestedCategory === 'roster_only') {
      filteredResults = operationalStaffRecords;
    } else if (requestedCategory === 'vacancies' || requestedCategory === 'position') {
      filteredResults = vacanciesRecords;
    } else if (requestedCategory === 'archived_demos' || requestedCategory === 'archived_demo') {
      filteredResults = archivedDemosRecords;
    }

    if (role && role !== 'All') {
      const normRole = role.toLowerCase().trim();
      filteredResults = filteredResults.filter(r => String(r.role).toLowerCase().trim() === normRole);
    }

    if (department && department !== 'All') {
      filteredResults = filteredResults.filter(r => r.department === department);
    }

    if (status && status !== 'All') {
      filteredResults = filteredResults.filter(r => r.status === status);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredResults = filteredResults.filter(r =>
        String(r.name || '').toLowerCase().includes(q) ||
        String(r.employeeId || '').toLowerCase().includes(q) ||
        String(r.email || '').toLowerCase().includes(q) ||
        String(r.designation || '').toLowerCase().includes(q) ||
        String(r.supervisorName || '').toLowerCase().includes(q) ||
        String(r.department || '').toLowerCase().includes(q)
      );
    }

    res.json({
      users: filteredResults,
      counts: finalCounts
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
      // Non-admins cannot alter employee monthly hour limits or overrides
      delete updateData.maxMonthlyHours;
      delete updateData.hasCustomMaxHours;
    } else {
      // Admin update of monthly hours and override flag
      if (updateData.hasCustomMaxHours !== undefined) {
        updateData.hasCustomMaxHours = Boolean(updateData.hasCustomMaxHours);
      }
      if (updateData.maxMonthlyHours !== undefined) {
        if (updateData.maxMonthlyHours === null || updateData.maxMonthlyHours === '' || updateData.maxMonthlyHours === 0) {
          // Clearing custom limit returns to organization baseline
          updateData.hasCustomMaxHours = false;
        } else {
          const val = Number(updateData.maxMonthlyHours);
          if (Number.isFinite(val) && val >= 1 && val <= 744) {
            updateData.maxMonthlyHours = val;
            if (updateData.hasCustomMaxHours === undefined) {
              updateData.hasCustomMaxHours = true;
            }
          } else {
            return res.status(400).json({ message: 'maxMonthlyHours must be a finite number between 1 and 744.' });
          }
        }
      }
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    invalidateFitmentSummaryCache();
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

    invalidateFitmentSummaryCache();
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

    let added = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    // Intra-file duplicate tracking sets
    const seenEmailsInFile = new Set();
    const seenEmpIdsInFile = new Set();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const [index, userData] of users.entries()) {
      const rowNum = index + 1;
      try {
        if (!userData || typeof userData !== 'object') {
          skipped++;
          continue;
        }

        const rawName = userData.name != null ? String(userData.name).trim() : '';
        const rawEmail = userData.email != null ? String(userData.email).trim().toLowerCase() : '';
        const rawEmpId = userData.employeeId != null ? String(userData.employeeId).trim() : '';

        // If row is completely empty (no name, email, employee ID, or profile fields)
        const hasAnyField = Boolean(
          rawName || rawEmail || rawEmpId ||
          userData.organization || userData.designation ||
          userData.location || userData.supervisorName
        );
        if (!hasAnyField) {
          skipped++;
          continue;
        }

        // Validate required fields
        if (!rawName) {
          failed++;
          errors.push(`Row ${rowNum}: Name is required.`);
          continue;
        }

        if (!rawEmail) {
          failed++;
          errors.push(`Row ${rowNum}: Email is required.`);
          continue;
        }

        if (!emailRegex.test(rawEmail)) {
          failed++;
          errors.push(`Row ${rowNum}: Invalid email format "${rawEmail}".`);
          continue;
        }

        // Intra-file duplicate detection
        if (seenEmailsInFile.has(rawEmail)) {
          failed++;
          errors.push(`Row ${rowNum}: Duplicate email "${rawEmail}" within upload file.`);
          continue;
        }

        if (rawEmpId && seenEmpIdsInFile.has(rawEmpId)) {
          failed++;
          errors.push(`Row ${rowNum}: Duplicate employee ID "${rawEmpId}" within upload file.`);
          continue;
        }

        seenEmailsInFile.add(rawEmail);
        if (rawEmpId) {
          seenEmpIdsInFile.add(rawEmpId);
        }

        // Dual database resolution
        const userByEmail = await User.findOne({ email: rawEmail });
        const userByEmpId = rawEmpId ? await User.findOne({ employeeId: rawEmpId }) : null;

        // Case 1: Conflict - Employee ID and Email resolve to two distinct users
        if (userByEmail && userByEmpId && !userByEmail._id.equals(userByEmpId._id)) {
          failed++;
          errors.push(
            `Row ${rowNum}: Identifier conflict - Employee ID "${rawEmpId}" belongs to "${userByEmpId.name}", but email "${rawEmail}" belongs to "${userByEmail.name}". Cannot merge distinct records.`
          );
          continue;
        }

        const matchedUser = userByEmail || userByEmpId;

        // Protect vacant positions from modification or conversion
        if (matchedUser && (matchedUser.isVacant || matchedUser.role === 'position')) {
          failed++;
          errors.push(
            `Row ${rowNum}: Employee ID "${rawEmpId || matchedUser.employeeId}" is a vacant position and cannot be modified via bulk user upload.`
          );
          continue;
        }

        // Protect archived demo accounts from modification or reactivation
        if (matchedUser && (matchedUser.isArchivedDemo || matchedUser.role === 'archived_demo')) {
          failed++;
          errors.push(
            `Row ${rowNum}: Employee ID "${rawEmpId || matchedUser.employeeId}" is an archived demo account and cannot be modified via bulk user upload.`
          );
          continue;
        }

        // Case 2: Exact match - Both identifiers resolve to the same user
        if (userByEmail && userByEmpId && userByEmail._id.equals(userByEmpId._id)) {
          userByEmail.name = rawName || userByEmail.name;
          if (userData.organization) userByEmail.organization = userData.organization;
          if (userData.designation) userByEmail.designation = userData.designation;
          if (userData.location) userByEmail.location = userData.location;
          if (userData.supervisorName) userByEmail.supervisorName = userData.supervisorName;
          await userByEmail.save();
          updated++;
          continue;
        }

        // Case 3: Matched by employee ID (email newly provided / linking roster staff)
        if (userByEmpId && !userByEmail) {
          // If existing user already has a different registered email, reject to prevent account hijacking
          if (userByEmpId.email && userByEmpId.email.toLowerCase() !== rawEmail) {
            failed++;
            errors.push(
              `Row ${rowNum}: Employee ID "${rawEmpId}" is already registered to "${userByEmpId.email}". Reassignment to "${rawEmail}" is not permitted.`
            );
            continue;
          }

          // Link newly provided email and update profile data
          userByEmpId.email = rawEmail;
          userByEmpId.name = rawName || userByEmpId.name;
          if (userData.organization) userByEmpId.organization = userData.organization;
          if (userData.designation) userByEmpId.designation = userData.designation;
          if (userData.location) userByEmpId.location = userData.location;
          if (userData.supervisorName) userByEmpId.supervisorName = userData.supervisorName;
          // NOTE: Secure account provisioning: do NOT assign predictable default passwords
          // or prematurely clear isRosterOnly. Employees must establish passwords via the established invite flow.
          await userByEmpId.save();
          updated++;
          continue;
        }

        // Case 4: Matched by email (employee ID provided or already existing)
        if (userByEmail && !userByEmpId) {
          // If upload provides an employee ID and existing user already has a different employee ID
          if (rawEmpId && userByEmail.employeeId && userByEmail.employeeId !== rawEmpId) {
            failed++;
            errors.push(
              `Row ${rowNum}: User "${rawEmail}" already has employee ID "${userByEmail.employeeId}". Cannot reassign to "${rawEmpId}".`
            );
            continue;
          }

          if (rawEmpId && !userByEmail.employeeId) {
            userByEmail.employeeId = rawEmpId;
          }
          userByEmail.name = rawName || userByEmail.name;
          if (userData.organization) userByEmail.organization = userData.organization;
          if (userData.designation) userByEmail.designation = userData.designation;
          if (userData.location) userByEmail.location = userData.location;
          if (userData.supervisorName) userByEmail.supervisorName = userData.supervisorName;
          await userByEmail.save();
          updated++;
          continue;
        }

        // Case 5: Neither exists -> Create new employee roster record
        let newEmployeeId = rawEmpId;
        if (!newEmployeeId) {
          newEmployeeId = await getNextBperEmployeeId();
        }

        await User.create({
          name: rawName,
          email: rawEmail,
          employeeId: newEmployeeId,
          role: 'employee',
          organization: userData.organization || '',
          designation: userData.designation || '',
          location: userData.location || '',
          supervisorName: userData.supervisorName || '',
          isActive: true,
          isRosterOnly: true,
          isVacant: false,
          isArchivedDemo: false,
          formAccessGranted: false
        });
        added++;

      } catch (err) {
        console.error(`Error on row ${rowNum}:`, err);
        failed++;
        errors.push(`Row ${rowNum}: ${err.message}`);
      }
    }

    await logAction({
      req,
      action: 'USERS_BULK_UPLOADED',
      targetType: 'User',
      targetId: 'bulk',
      description: `Bulk uploaded users. Added: ${added}, Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`,
      next: { added, updated, skipped, failed, errorCount: errors.length }
    });

    invalidateFitmentSummaryCache();
    return res.json({ 
      message: `Upload complete. Added: ${added}, Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}.`,
      added,
      updated,
      skipped,
      failed,
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
