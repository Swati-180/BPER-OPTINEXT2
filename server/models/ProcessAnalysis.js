const mongoose = require('mongoose');

const processAnalysisSchema = new mongoose.Schema({
  process: { type: String, required: true },
  department: { type: String, required: true },
  type: { type: String, required: true },
  criteria: [{ type: String, enum: ['H', 'M', 'L'] }],
  score: { type: Number },
  consolidated: { type: Boolean, default: false },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Auto-calculate score if missing
processAnalysisSchema.pre('save', function(next) {
  if (this.criteria && this.criteria.length > 0) {
    // Basic scoring logic: H=2, M=1, L=0
    let total = 0;
    this.criteria.forEach(val => {
      if (val === 'H') total += 1;
      // You can implement your specific 6x6 score logic here
    });
    this.score = total;
  }
  next();
});

module.exports = mongoose.model('ProcessAnalysis', processAnalysisSchema);
