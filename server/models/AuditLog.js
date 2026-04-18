const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    email: { type: String, required: true }
  },
  action: { 
    type: String, 
    required: true,
    enum: [
      'TAXONOMY_SAVED', 
      'TAXONOMY_DELETED', 
      'SUBMISSION_REVIEWED', 
      'USER_ACTIVATED', 
      'USER_DEACTIVATED',
      'USER_ROLE_CHANGED',
      'FORM_WINDOW_OVERRIDE'
    ]
  },
  targetType: { 
    type: String, 
    required: true,
    enum: ['Taxonomy', 'WDTSubmission', 'User', 'SystemConfig']
  },
  targetId: { type: String, required: true },
  description: { type: String },
  metadata: {
    previousValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String }
  }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
