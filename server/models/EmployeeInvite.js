const mongoose = require('mongoose');
const crypto = require('crypto');

const deliveryHistorySchema = new mongoose.Schema({
  channel: { type: String, enum: ['email', 'manual_copy', 'manual_share_confirm'], required: true },
  event: { type: String, enum: ['sent', 'failed', 'copied', 'confirmed_shared'], required: true },
  timestamp: { type: Date, default: Date.now },
  errorMessage: { type: String, default: '' },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

const lifecycleHistorySchema = new mongoose.Schema({
  tokenHash: { type: String, default: '' },
  deliveryStatus: { type: String, default: 'pending' },
  registrationStatus: { type: String, default: 'not_registered' },
  sentAt: { type: Date, default: null },
  linkCopiedAt: { type: Date, default: null },
  manuallySharedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  errorMessage: { type: String, default: '' },
  archivedAt: { type: Date, default: Date.now },
  reason: { type: String, default: 'resend' }
}, { _id: false });

const employeeInviteSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null,
    index: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    default: null,
    index: true
  },
  projectIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  }],
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  employeeId: { type: String, default: null, trim: true },
  role: {
    type: String,
    enum: ['company_admin', 'project_admin', 'manager', 'employee'],
    default: 'employee',
    index: true
  },
  department: { type: String, default: '' },

  // Secure token storage: only cryptographic tokenHash is stored
  tokenHash: { type: String, default: null, index: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 72 * 60 * 60 * 1000) }, // Default 72 hours

  // Email Ownership Verification for New User Registrations (Phase 2 & Security Gate)
  emailVerificationTokenHash: { type: String, default: null, index: true },
  emailVerificationExpiresAt: { type: Date, default: null },
  emailVerificationAttempts: { type: Number, default: 0 },
  emailVerificationLastSentAt: { type: Date, default: null },
  isEmailVerified: { type: Boolean, default: false },
  lockAcquiredAt: { type: Date, default: null },

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
    enum: ['not_registered', 'registered', 'expired', 'revoked', 'registration_failed'],
    default: 'not_registered'
  },
  registeredAt: { type: Date, default: null },
  registrationFailedAt: { type: Date, default: null },
  registrationFailureReason: { type: String, default: '' },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // 3. AUDIT TRAILS (Append-Only)
  deliveryHistory: [deliveryHistorySchema],
  lifecycleHistory: [lifecycleHistorySchema],

  // 4. BACKWARD COMPATIBILITY FIELD (Maintained via pre-save hook)
  status: {
    type: String,
    enum: ['pending', 'sent', 'registered', 'revoked', 'expired', 'failed'],
    default: 'pending'
  },

  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'employee_invites', timestamps: true });

// Pre-save hook: keeps legacy 'status' field strictly in sync with dimensions
employeeInviteSchema.pre('save', function (next) {
  if (this.registrationStatus === 'registered') {
    this.status = 'registered';
  } else if (this.registrationStatus === 'revoked') {
    this.status = 'revoked';
  } else if (this.registrationStatus === 'expired' || (this.expiresAt && new Date() > this.expiresAt)) {
    this.status = 'expired';
  } else if (this.deliveryStatus === 'delivery_failed') {
    this.status = 'failed';
  } else if (this.deliveryStatus === 'email_sent' || this.deliveryStatus === 'manually_shared' || this.deliveryStatus === 'link_copied') {
    this.status = 'sent';
  } else {
    this.status = 'pending';
  }
  next();
});

// Helper static to hash tokens
employeeInviteSchema.statics.hashToken = function (token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

module.exports = mongoose.model('EmployeeInvite', employeeInviteSchema);
