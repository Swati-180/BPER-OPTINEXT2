const mongoose = require('mongoose');

const userProjectMembershipSchema = new mongoose.Schema({
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
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'Project reference is required'],
    index: true
  },
  role: {
    type: String,
    enum: ['project_admin', 'manager', 'employee'],
    required: [true, 'Project role is required']
  },
  employeeId: {
    type: String,
    default: null,
    trim: true,
    set: function(val) {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      return null;
    }
  },
  managerEmployeeId: {
    type: String,
    default: null,
    trim: true
  },
  formAccessGranted: {
    type: Boolean,
    default: true
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
  collection: 'userprojectmemberships'
});

userProjectMembershipSchema.index(
  { projectId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: 'idx_active_project_user_unique'
  }
);

userProjectMembershipSchema.index(
  { projectId: 1, employeeId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
      employeeId: { $type: 'string', $gt: '' }
    },
    name: 'idx_project_employeeId_partial_unique'
  }
);

userProjectMembershipSchema.index({ companyId: 1, projectId: 1 });
userProjectMembershipSchema.index({ projectId: 1, role: 1 });

module.exports = mongoose.model('UserProjectMembership', userProjectMembershipSchema);
