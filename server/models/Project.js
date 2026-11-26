const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company reference is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  code: {
    type: String,
    required: [true, 'Project code is required'],
    trim: true,
    uppercase: true,
    minlength: 2,
    maxlength: 20
  },
  department: {
    type: String,
    required: [true, 'Primary department is required'],
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'draft'],
    default: 'active',
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
  collection: 'projects'
});

projectSchema.index({ companyId: 1, code: 1 }, { unique: true });
projectSchema.index({ companyId: 1, status: 1 });

module.exports = mongoose.model('Project', projectSchema);
