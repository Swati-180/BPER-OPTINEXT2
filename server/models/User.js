const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'tower_lead', 'supervisor', 'employee'],
    default: 'employee'
  },
  userType: {
    type: String,
    enum: ['manager', 'employee'],
    default: 'manager'
  },
  organization: { type: String, default: '' },
  requestedRole: {
    type: String,
    enum: ['admin', 'tower_lead', 'supervisor', 'employee'],
    default: 'employee'
  },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null }
}, { collection: 'users', timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
