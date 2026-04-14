const express = require('express');
const router = express.Router();
const Taxonomy = require('../models/Taxonomy');
const verifyToken = require('../middleware/verifyToken');

router.get('/processes', verifyToken, async (req, res) => {
  try {
    const data = await Taxonomy.find({ isActive: true });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
