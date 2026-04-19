const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    email: { type: String, required: true }
  },
  action: { 
    type: String, 
    required: true
  },
  targetType: { 
    type: String, 
    required: true
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
