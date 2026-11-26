const mongoose = require('mongoose');

const companyMembershipSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company reference is required'],
    index: true
  },
  role: {
    type: String,
    enum: ['company_admin', 'project_admin', 'member'],
    required: [true, 'Company role is required']
  },
  canCreateProjects: {
    type: Boolean,
    default: false,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true
  },
  deactivatedAt: {
    type: Date,
    default: null
  },
  deactivatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reactivatedAt: {
    type: Date,
    default: null
  },
  reactivatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  collection: 'companymemberships'
});

companyMembershipSchema.index(
  { companyId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: 'idx_active_company_membership_unique'
  }
);

companyMembershipSchema.index({ userId: 1, isActive: 1 });
companyMembershipSchema.index({ companyId: 1, role: 1 });
companyMembershipSchema.index({ companyId: 1, canCreateProjects: 1 });

module.exports = mongoose.model('CompanyMembership', companyMembershipSchema);
