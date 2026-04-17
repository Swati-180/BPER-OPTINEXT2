const mongoose = require('mongoose');

function computeScore(criteria = []) {
  if (!criteria || criteria.length === 0) return 0;
  
  // PRD: Group 1 (Performance - first 6) looking for 'H'
  const performanceScore = criteria.slice(0, 6).filter(val => val === 'H').length;
  
  // PRD: Group 2 (Characteristics - next 6) looking for 'L'
  const characteristicScore = criteria.slice(6, 12).filter(val => val === 'L').length;
  
  return performanceScore + characteristicScore;
}

const processAnalysisSchema = new mongoose.Schema({
  process: { type: String, required: true },
  department: { type: String, required: true },
  type: { type: String, required: true },
  criteria: [{ type: String, enum: ['H', 'M', 'L', '-'] }],
  score: { type: Number },
  consolidated: { type: Boolean, default: false },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

function applyComputedFields(record) {
  if (!record) return;
  if (Array.isArray(record.criteria) && record.criteria.length > 0) {
    record.score = computeScore(record.criteria);
  }
  // PRD: Score >= 7 is flagging as Consolidatable
  record.consolidated = Number(record.score || 0) >= 7;
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
