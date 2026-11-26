const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const AuditLog = require('../models/AuditLog');

const BOOTSTRAP_CONFIG_KEY = 'super_admin_bootstrap_state';

/**
 * Ensures the singleton SystemConfig bootstrap record exists.
 * Safe against race conditions and duplicate-key E11000 errors.
 */
async function ensureBootstrapStateInitialized() {
  const existing = await SystemConfig.findOne({ key: BOOTSTRAP_CONFIG_KEY });
  if (existing) return existing;

  try {
    return await SystemConfig.create({
      key: BOOTSTRAP_CONFIG_KEY,
      bootstrapCompleted: false,
      completedAt: null
    });
  } catch (err) {
    if (err.code === 11000) {
      const found = await SystemConfig.findOne({ key: BOOTSTRAP_CONFIG_KEY });
      if (found) return found;
    }
    throw err;
  }
}

/**
 * POST /api/auth/bootstrap-super-admin
 * One-time atomic Super Admin bootstrap.
 */
const bootstrapSuperAdmin = async (req, res) => {
  try {
    const { name, email, password, bootstrapKey } = req.body;

    // 1. Verify backend bootstrap secret exists in environment
    const configuredKey = process.env.SUPER_ADMIN_BOOTSTRAP_KEY;
    if (!configuredKey || !configuredKey.trim()) {
      return res.status(500).json({
        message: 'Super Admin bootstrap is not configured on this server.'
      });
    }

    // 2. Validate request payload
    if (!name || !email || !password || !bootstrapKey) {
      return res.status(400).json({
        message: 'Name, email, password, and bootstrapKey are required.'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    // 3. Constant-time cryptographic verification of bootstrap key using fixed-length SHA-256 digests
    if (typeof bootstrapKey !== 'string' || !bootstrapKey.trim()) {
      return res.status(401).json({ message: 'Invalid bootstrap key.' });
    }

    const keyBuf = crypto.createHash('sha256').update(bootstrapKey.trim()).digest();
    const configBuf = crypto.createHash('sha256').update(configuredKey.trim()).digest();

    if (!crypto.timingSafeEqual(keyBuf, configBuf)) {
      return res.status(401).json({ message: 'Invalid bootstrap key.' });
    }

    // 4. Ensure SystemConfig bootstrap state record exists
    await ensureBootstrapStateInitialized();

    // 5. Check if already completed (fast-path 410)
    const currentState = await SystemConfig.findOne({ key: BOOTSTRAP_CONFIG_KEY });
    if (currentState && currentState.bootstrapCompleted) {
      return res.status(410).json({
        message: 'Super Admin bootstrap has already been executed and is permanently closed.'
      });
    }

    // Also check if any super_admin already exists
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      if (currentState && !currentState.bootstrapCompleted) {
        await SystemConfig.updateOne(
          { key: BOOTSTRAP_CONFIG_KEY },
          { $set: { bootstrapCompleted: true, completedAt: new Date() } }
        );
      }
      return res.status(410).json({
        message: 'Super Admin bootstrap has already been executed and is permanently closed.'
      });
    }

    // 6. Atomic claim check using findOneAndUpdate
    // Only one concurrent request can successfully transition bootstrapCompleted from false to true
    const now = new Date();
    const claim = await SystemConfig.findOneAndUpdate(
      {
        key: BOOTSTRAP_CONFIG_KEY,
        bootstrapCompleted: false
      },
      {
        $set: {
          bootstrapCompleted: true,
          completedAt: now
        }
      },
      { new: true }
    );

    if (!claim) {
      return res.status(410).json({
        message: 'Super Admin bootstrap has already been claimed or executed.'
      });
    }

    // 7. Check if target user email already exists
    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (user) {
      // Elevate existing account to super_admin
      user.name = name.trim();
      user.password = hashedPassword;
      user.role = 'super_admin';
      user.isActive = true;
      user.formAccessGranted = true;
      await user.save();
    } else {
      user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: 'super_admin',
        designation: 'Super Administrator',
        band: 'EXEC',
        department: 'Executive Governance',
        isActive: true,
        formAccessGranted: true
      });
    }

    // 8. Record Immutable Audit Log
    try {
      await AuditLog.create({
        actor: {
          userId: user._id,
          name: user.name,
          email: user.email
        },
        action: 'SUPER_ADMIN_BOOTSTRAP',
        targetType: 'User',
        targetId: String(user._id),
        description: 'Initial Super Admin account provisioned via one-time bootstrap key.',
        metadata: {
          completedAt: now,
          ip: req.ip || req.connection?.remoteAddress
        }
      });
    } catch (auditErr) {
      console.warn('[Bootstrap] Audit log creation warning:', auditErr.message);
    }

    // 9. Respond with success (NEVER expose the bootstrap secret or internal keys)
    return res.status(201).json({
      message: 'Super Admin account successfully bootstrapped.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Super Admin Bootstrap Error:', error);
    return res.status(500).json({
      message: 'Internal server error during Super Admin bootstrap.',
      error: error.message
    });
  }
};

module.exports = {
  bootstrapSuperAdmin,
  BOOTSTRAP_CONFIG_KEY,
  ensureBootstrapStateInitialized
};
