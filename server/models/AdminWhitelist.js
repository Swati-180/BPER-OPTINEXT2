const mongoose = require('mongoose');

const adminWhitelistSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'admin_whitelist', timestamps: true });

module.exports = mongoose.model('AdminWhitelist', adminWhitelistSchema);
