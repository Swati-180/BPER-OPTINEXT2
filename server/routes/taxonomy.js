const express = require('express');
const router = express.Router();
const Taxonomy = require('../models/Taxonomy');
const verifyToken = require('../middleware/verifyToken');
const { mapActivity, createTaxonomy, updateTaxonomy, deleteTaxonomy, getMajorProcesses, getProcessesByMajor, getSubProcessesByProcess } = require('../controllers/taxonomyController');

// Hierarchical query routes (for Process Selection step)
router.get('/major-processes', verifyToken, getMajorProcesses);
router.get('/processes-by-major', verifyToken, getProcessesByMajor);
router.get('/subprocesses-by-process', verifyToken, getSubProcessesByProcess);

router.get('/processes', verifyToken, async (req, res) => {
  try {
    const { department } = req.query;
    let query = { isActive: true };
    
    if (department && department !== 'All Departments') {
      query.$or = [
        { department: department },
        { department: { $exists: false } },
        { department: null }
      ];
    }

    let data = await Taxonomy.find(query);

    // Fallback: If no processes found for this specific department, return all active processes
    if (department && department !== 'All Departments') {
      const specificCount = await Taxonomy.countDocuments({ department, isActive: true });
      if (specificCount === 0) {
        data = await Taxonomy.find({ isActive: true });
      }
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/map', verifyToken, mapActivity);
router.post('/create', verifyToken, createTaxonomy);
router.put('/:id', verifyToken, updateTaxonomy);
router.delete('/:id', verifyToken, deleteTaxonomy);

module.exports = router;
