const AdminWhitelist = require('../models/AdminWhitelist');

const getWhitelist = async (req, res) => {
  try {
    const list = await AdminWhitelist.find({}).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const addEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await AdminWhitelist.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'Email is already in the admin whitelist.' });
    }

    const entry = await AdminWhitelist.create({
      email: normalizedEmail,
      createdBy: req.user?.userId || null
    });

    res.status(201).json({ message: 'Email added to admin whitelist.', entry });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const removeEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await AdminWhitelist.findByIdAndDelete(id);
    if (!entry) return res.status(404).json({ message: 'Entry not found.' });

    res.json({ message: 'Email removed from admin whitelist.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getWhitelist, addEmail, removeEmail };
