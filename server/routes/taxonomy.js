const express = require('express');
const router = express.Router();
const Taxonomy = require('../models/Taxonomy');
const verifyToken = require('../middleware/verifyToken');
const { mapActivity } = require('../controllers/taxonomyController');

router.get('/processes', verifyToken, async (req, res) => {
  try {
    const data = await Taxonomy.find({ isActive: true });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/map', verifyToken, mapActivity);

module.exports = router;
