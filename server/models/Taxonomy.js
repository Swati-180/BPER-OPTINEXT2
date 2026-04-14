const mongoose = require('mongoose');

const taxonomySchema = new mongoose.Schema({
  majorProcess: { type: String, required: true },
  process: { type: String, required: true },
  subProcesses: [{ type: String }],
  department: { type: String }, // Optional: only show for specific depts
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Ensure unique combination of majorProcess and process
taxonomySchema.index({ majorProcess: 1, process: 1 }, { unique: true });

module.exports = mongoose.model('Taxonomy', taxonomySchema);
