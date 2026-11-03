const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const deliveryHistorySchema = new mongoose.Schema({
  channel: { type: String, enum: ['email', 'manual_copy', 'manual_share_confirm'], required: true },
  event: { type: String, enum: ['sent', 'failed', 'copied', 'confirmed_shared'], required: true },
  timestamp: { type: Date, default: Date.now },
  errorMessage: { type: String, default: '' },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

const lifecycleHistorySchema = new mongoose.Schema({
  token: { type: String, required: true },
  deliveryStatus: { type: String, required: true },
  registrationStatus: { type: String, required: true },
  sentAt: { type: Date, default: null },
  linkCopiedAt: { type: Date, default: null },
  manuallySharedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
  errorMessage: { type: String, default: '' },
  archivedAt: { type: Date, default: Date.now },
  reason: { type: String, default: 'resend' }
}, { _id: false });

const employeeInviteSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  employeeId: { type: String, default: null, trim: true },
  inviteToken: { type: String, unique: true, default: () => uuidv4() },
  inviteLink: { type: String, default: '' },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },

  // 1. DELIVERY DIMENSION
  deliveryStatus: {
    type: String,
    enum: ['pending', 'email_sent', 'link_copied', 'manually_shared', 'delivery_failed', 'unknown'],
    default: 'pending'
  },
  sentAt: { type: Date, default: null },
  linkCopiedAt: { type: Date, default: null },
  manuallySharedAt: { type: Date, default: null },
  copyCount: { type: Number, default: 0 },
  errorMessage: { type: String, default: '' },

  // 2. REGISTRATION DIMENSION
  registrationStatus: {
    type: String,
    enum: ['not_registered', 'registered', 'expired', 'registration_failed'],
    default: 'not_registered'
  },
  registeredAt: { type: Date, default: null },
  registrationFailedAt: { type: Date, default: null },
  registrationFailureReason: { type: String, default: '' },

  // 3. AUDIT TRAILS (Append-Only)
  deliveryHistory: [deliveryHistorySchema],
  lifecycleHistory: [lifecycleHistorySchema],

  // 4. BACKWARD COMPATIBILITY FIELD (Maintained via pre-save hook)
  status: {
    type: String,
    enum: ['pending', 'sent', 'registered', 'failed'],
    default: 'pending'
  },

  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'employee_invites', timestamps: true });

// Pre-save hook: keeps legacy 'status' field strictly in sync with dimensions
employeeInviteSchema.pre('save', function (next) {
  if (this.registrationStatus === 'registered') {
    this.status = 'registered';
  } else if (this.deliveryStatus === 'delivery_failed') {
    this.status = 'failed';
  } else if (this.deliveryStatus === 'email_sent' || this.deliveryStatus === 'manually_shared') {
    this.status = 'sent';
  } else {
    this.status = 'pending';
  }
  next();
});

module.exports = mongoose.model('EmployeeInvite', employeeInviteSchema);
