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
  role: {
    type: String,
    enum: ['admin', 'manager', 'employee'],
    default: 'employee'
  },
  organization: { type: String, default: '' },
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
