const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

const logAction = async ({ req, action, targetType, targetId, description, prev, next }) => {
  try {
    let actorUser = null;
    if (req.user) {
      const mongoose = require('mongoose');
      const actorId = req.user.userId || req.user.id;
      if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
        try {
          actorUser = await User.findById(actorId).select('name email').lean();
        } catch (e) {
          actorUser = null;
        }
      }
      // If not found in DB or in mock environment, fallback to token details
      if (!actorUser && (req.user.name || req.user.email)) {
        actorUser = {
          _id: actorId,
          name: req.user.name || req.user.email,
          email: req.user.email
        };
      }
    }

    if (!actorUser) {
      console.warn('Audit: Action attempted without identifiable actor');
      return { success: false, reason: 'unidentifiable_actor' };
    }

    const doc = await AuditLog.create({
      actor: {
        userId: actorUser._id,
        name: actorUser.name,
        email: actorUser.email
      },
      action,
      targetType,
      targetId: String(targetId),
      description,
      metadata: {
        previousValue: prev,
        newValue: next,
        ip: req.ip
      }
    });

    return { success: true, id: doc._id };
  } catch (err) {
    console.error('Audit Logging Failed:', err.message);
    return { success: false, error: err };
  }
};

module.exports = { logAction };
