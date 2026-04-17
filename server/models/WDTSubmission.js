const mongoose = require('mongoose');

const wdtSubmissionSchema = new mongoose.Schema({
  referenceId: { type: String, required: true, unique: true },
  submittedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['Under Review', 'Approved', 'Changes Requested'], default: 'Under Review' },
  employee: {
    employeeId: String,
    name: String,
    email: String,
    department: String,
    designation: String,
    tower: String,
    grade: String,
    organization: String,
    location: String
  },
  payload: {
    rows: [{
      activityCategory: String,
      majorProcess: String,
      process: String,
      subProcess: String,
      frequency: String,
      volumesMonthly: Number,
      timeTakenHoursPerMonth: Number,
      applicationsUsed: String,
      comments: String,
      isAiMapped: Boolean,
      aiConfidence: Number,
      originalCustomInput: String
    }]
  },
  totalHours: { type: Number },
  coreCount: { type: Number },
  supportCount: { type: Number },
  pendingFrom: { type: String },
  reviewHistory: [{
    reviewedAt: Date,
    managerName: String,
    status: String,
    comment: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('WDTSubmission', wdtSubmissionSchema);
