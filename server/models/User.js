const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  employeeId: { type: String, unique: true, sparse: true },
  designation: { type: String, default: '' },
  band: { type: String, default: '' },
  client: { type: String, default: '' },
  location: { type: String, default: '' },
  supervisorName: { type: String, default: '' },
  supervisorTitle: { type: String, default: '' },
  department: { type: String, default: '' },
  role: {
    type: String,
    enum: ['admin', 'manager', 'employee', 'Admin', 'Manager', 'Employee'],
    default: 'employee',
    lowercase: true,
    trim: true,
    set: function(v) {
      if (typeof v !== 'string') return v;
      return v.toLowerCase().trim();
    }
  },
  organization: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null },
  maxMonthlyHours: { type: Number, default: 160, min: 1, max: 744 },
  // When false, employee is visible in 'Pending User Approvals' and cannot submit forms
  formAccessGranted: { type: Boolean, default: false }
}, { collection: 'users', timestamps: true });

userSchema.pre('validate', function(next) {
  if (this.designation) {
    const d = this.designation.toLowerCase();
    if (d.includes('finance') || d.includes('f&a') || d.includes('account')) {
      this.department = 'F&A';
    } else if (d.includes('hr') || d.includes('human resource')) {
      this.department = 'HR';
    } else if (d.includes('scm') || d.includes('supply chain')) {
      this.department = 'SCM';
    } else if (d.includes('logistic')) {
      this.department = 'Logistics';
    }
  }

  if (this.organization && !this.department) {
    this.department = this.organization;
  }

  if (this.role && typeof this.role === 'string') {
    this.role = this.role.toLowerCase().trim();
  }
  // Admins and managers always have form access granted automatically
  if (this.isNew && (this.role === 'admin' || this.role === 'manager')) {
    this.formAccessGranted = true;
  }
  next();
});

userSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update && update.designation) {
    const d = update.designation.toLowerCase();
    let newOrg;
    if (d.includes('finance') || d.includes('f&a') || d.includes('account')) {
      newOrg = 'F&A';
    } else if (d.includes('hr') || d.includes('human resource')) {
      newOrg = 'HR';
    } else if (d.includes('scm') || d.includes('supply chain')) {
      newOrg = 'SCM';
    } else if (d.includes('logistic')) {
      newOrg = 'Logistics';
    }

    if (newOrg) {
      // Use $set to ensure it overwrites correctly
      if (update.$set) {
        update.$set.department = newOrg;
      } else {
        update.department = newOrg;
      }
    }
  }
  next();
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
