const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  code: {
    type: String,
    required: [true, 'Company code is required'],
    unique: true,
    trim: true,
    uppercase: true,
    minlength: 2,
    maxlength: 20
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true
  }
}, {
  timestamps: true,
  collection: 'companies'
});

companySchema.index({ code: 1 }, { unique: true });
companySchema.index({ isActive: 1 });

module.exports = mongoose.model('Company', companySchema);
