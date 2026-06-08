const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const employeeInviteSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  inviteToken: { type: String, unique: true, default: () => uuidv4() },
  status: {
    type: String,
    enum: ['pending', 'sent', 'registered', 'failed'],
    default: 'pending'
  },
  sentAt: { type: Date, default: null },
  registeredAt: { type: Date, default: null },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days
  inviteLink: { type: String, default: '' },
  errorMessage: { type: String, default: '' }
}, { collection: 'employee_invites', timestamps: true });

module.exports = mongoose.model('EmployeeInvite', employeeInviteSchema);
