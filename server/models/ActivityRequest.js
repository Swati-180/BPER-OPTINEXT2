const mongoose = require('mongoose');

const activityRequestSchema = new mongoose.Schema({
  employee: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true },
    email: { type: String, required: true },
    department: { type: String, default: 'General' },
    designation: { type: String, default: '' },
    tower: { type: String, default: '' }
  },
  majorProcess: { type: String, required: true, trim: true },
  process: { type: String, required: true, trim: true },
  activityName: { type: String, required: true, trim: true },
  justification: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true
  },
  reviewedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String },
    email: { type: String }
  },
  reviewedAt: { type: Date },
  adminRemarks: { type: String, default: '' },
  rejectionReason: { type: String, default: '' }
}, {
  timestamps: true
});

module.exports = mongoose.model('ActivityRequest', activityRequestSchema);
