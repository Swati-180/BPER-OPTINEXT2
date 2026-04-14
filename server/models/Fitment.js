const mongoose = require('mongoose');

const fitmentSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true },
  parameters: [{
    parameter: { type: String, required: true },
    response: { type: String, default: '' },
    score: { type: Number, default: 0 },
    weight: { type: Number, default: 0 }
  }],
  weightedScore: { type: Number, default: 0 },
  fitmentLabel: { type: String, enum: ['FIT', 'TRAIN TO FIT', 'UNFIT'], default: 'UNFIT' },
  lastEvaluatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Auto-calculate weighted score before saving
fitmentSchema.pre('save', function(next) {
  if (this.parameters && this.parameters.length > 0) {
    const total = this.parameters.reduce((sum, item) => {
      // Basic weighted scoring logic from frontend
      return sum + (item.score / 5) * item.weight;
    }, 0);
    this.weightedScore = Number(total.toFixed(1));
    
    if (this.weightedScore >= 80) this.fitmentLabel = 'FIT';
    else if (this.weightedScore >= 65) this.fitmentLabel = 'TRAIN TO FIT';
    else this.fitmentLabel = 'UNFIT';
  }
  next();
});

module.exports = mongoose.model('Fitment', fitmentSchema);
