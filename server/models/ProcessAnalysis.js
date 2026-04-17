const mongoose = require('mongoose');

function computeScore(criteria = []) {
  return criteria.reduce((total, value) => {
    if (value === 'H') return total + 1;
    if (value === 'M') return total + 0.5;
    return total;
  }, 0);
}

const processAnalysisSchema = new mongoose.Schema({
  process: { type: String, required: true },
  department: { type: String, required: true },
  type: { type: String, required: true },
  criteria: [{ type: String, enum: ['H', 'M', 'L'] }],
  score: { type: Number },
  consolidated: { type: Boolean, default: false },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

function applyComputedFields(record) {
  if (!record) return;
  if (Array.isArray(record.criteria) && record.criteria.length > 0) {
    record.score = computeScore(record.criteria);
  }
  if (typeof record.consolidated !== 'boolean') {
    record.consolidated = Number(record.score || 0) >= 8;
  }
}

// Auto-calculate score if missing
processAnalysisSchema.pre('save', function(next) {
  applyComputedFields(this);
  next();
});

processAnalysisSchema.pre('insertMany', function(next, docs) {
  (docs || []).forEach((doc) => applyComputedFields(doc));
  next();
});

module.exports = mongoose.model('ProcessAnalysis', processAnalysisSchema);
