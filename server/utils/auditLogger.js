const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

const logAction = async ({ req, action, targetType, targetId, description, prev, next }) => {
  try {
    // If we have a user in req (from verifyToken)
    let actorUser = null;
    if (req.user) {
      actorUser = await User.findById(req.user.userId || req.user.id);
    }

    if (!actorUser) {
        console.warn('Audit: Action attempted without identifiable actor');
        return;
    }

    await AuditLog.create({
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
  } catch (err) {
    console.error('Audit Logging Failed:', err);
  }
};

module.exports = { logAction };
