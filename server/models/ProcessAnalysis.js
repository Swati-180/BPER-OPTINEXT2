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
  consolidated: { type: Boolean },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Prevent duplicate process entries per department
processAnalysisSchema.index({ process: 1, department: 1 }, { unique: true });

function applyComputedFields(record) {
  if (!record) return;
  const criteria = Array.isArray(record.criteria) ? record.criteria : [];
  if (criteria.length > 0) {
    record.score = computeScore(criteria);
  }

  // PRD & Business Rules: If all criteria are '-', process is Pending Assessment
  const isAllPending = criteria.length === 0 || criteria.every(c => c === '-');
  if (isAllPending) {
    record.consolidated = null;
    return;
  }

  if (record.consolidated === null) {
    return; // Explicitly set to null (unassessed/N/A)
  }

  // Check exception rules (TC1-TC4)
  // Index: 6:Sensitivity, 8:Controls, 9:Proximity, 10:Regulatory, 11:Skill
  let hasException = false;
  if (criteria.length >= 12) {
    const proximity = criteria[9];
    const sensitivity = criteria[6];
    const controls = criteria[8];
    const regulatory = criteria[10];
    const skill = criteria[11];
    
    if (proximity === 'H' && (sensitivity === 'H' || controls === 'H' || regulatory === 'H' || skill === 'H')) {
      hasException = true;
    }
  }

  if (hasException) {
    record.consolidated = false;
  } else {
    // PRD: Score >= 7 is flagging as Consolidatable
    record.consolidated = Number(record.score || 0) >= 7;
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
