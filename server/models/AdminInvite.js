const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const adminInviteSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  inviteToken: { type: String, unique: true, default: () => uuidv4() },
  role: { type: String, enum: ['admin'], default: 'admin' },
  status: {
    type: String,
    enum: ['pending', 'sent', 'registered', 'failed', 'cancelled'],
    default: 'pending'
  },
  sentAt: { type: Date, default: null },
  registeredAt: { type: Date, default: null },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  inviteLink: { type: String, default: '' },
  errorMessage: { type: String, default: '' }
}, { collection: 'admin_invites', timestamps: true });

module.exports = mongoose.model('AdminInvite', adminInviteSchema);
