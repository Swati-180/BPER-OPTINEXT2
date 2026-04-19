const mongoose = require('mongoose');

const wdtSubmissionSchema = new mongoose.Schema({
  referenceId: { type: String, required: true, unique: true },
  submittedAt: { type: Date, default: Date.now },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
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
      timePerTransactionMinutes: Number,
      timeTakenHoursPerMonth: Number,
      fte: Number,
      processShare: Number,
      applicationsUsed: String,
      comments: String,
      isAiMapped: Boolean,
      aiConfidence: Number,
      originalCustomInput: String
    }]
  },
  totalHours: { type: Number },
  utilization: { type: Number },
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

wdtSubmissionSchema.pre('save', function(next) {
  const STANDARD_HOURS = 160;
  let totalHours = 0;

  // 1. Calculate Per-Row Metrics (Hours, FTE)
  this.payload.rows.forEach(row => {
    // Total Hours = (Monthly Volume * Time per Transaction) / 60
    if (row.volumesMonthly && row.timePerTransactionMinutes) {
      row.timeTakenHoursPerMonth = (row.volumesMonthly * row.timePerTransactionMinutes) / 60;
    }
    
    // FTE = Activity Hours / Standard Hours
    row.fte = (row.timeTakenHoursPerMonth || 0) / STANDARD_HOURS;
    totalHours += (row.timeTakenHoursPerMonth || 0);
  });

  // 2. Calculate Aggregate Metrics (Total Hours, Utilization)
  this.totalHours = totalHours;
  this.utilization = totalHours / STANDARD_HOURS;

  // 3. Calculate Process Share % = (Activity Hours / Total Logged Hours) * 100
  this.payload.rows.forEach(row => {
    if (totalHours > 0) {
      row.processShare = ( (row.timeTakenHoursPerMonth || 0) / totalHours ) * 100;
    } else {
      row.processShare = 0;
    }
  });

  next();
});

module.exports = mongoose.model('WDTSubmission', wdtSubmissionSchema);
