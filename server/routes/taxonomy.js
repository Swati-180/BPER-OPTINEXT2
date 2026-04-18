const express = require('express');
const router = express.Router();
const Taxonomy = require('../models/Taxonomy');
const verifyToken = require('../middleware/verifyToken');
const { mapActivity, createTaxonomy } = require('../controllers/taxonomyController');

router.get('/processes', verifyToken, async (req, res) => {
  try {
    const { department } = req.query;
    const query = { isActive: true };
    
    if (department && department !== 'All Departments') {
      query.$or = [
        { department: department },
        { department: { $exists: false } },
        { department: null }
      ];
    }

    const data = await Taxonomy.find(query);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/map', verifyToken, mapActivity);
router.post('/create', verifyToken, createTaxonomy);

module.exports = router;
