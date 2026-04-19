const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const Taxonomy = require('../models/Taxonomy');

// Helper: Check if user has permission to add custom activities
function canAddCustom(userRole) {
  return ['admin', 'manager'].includes(userRole);
}

/**
 * GET /api/activities/towers/:deptId
 * Returns towers for a department (lazy loading)
 */
router.get('/towers/:deptId', verifyToken, async (req, res) => {
  try {
    const { deptId } = req.params;
    
    // Query taxonomy to get unique towers in this department
    let query = {};
    if (deptId !== 'All') {
      query.department = deptId || { $exists: false };
    }
    
    const data = await Taxonomy.find(query);
    
    // Extract unique majorProcess as towers
    const towers = [...new Set(data.map(item => item.majorProcess))].map(tower => ({
      name: tower,
      processCount: data.filter(item => item.majorProcess === tower).length
    }));

    res.json(towers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/activities/processes/:towerId
 * Returns processes under a tower (lazy loading)
 */
router.get('/processes/:towerId', verifyToken, async (req, res) => {
  try {
    const { towerId } = req.params;
    
    // Query taxonomy to get processes under this tower
    const data = await Taxonomy.find({ 
      majorProcess: towerId
    });
    
    // Extract unique processes
    const processes = [...new Set(data.map(item => item.process))].map(proc => ({
      name: proc,
      activityCount: data.find(item => item.process === proc)?.subProcesses?.length || 0
    }));

    res.json(processes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/activities/list/:processId
 * Returns all activities/sub-processes under a process
 * Query: ?tower=towerName&process=processName
 */
router.get('/list', verifyToken, async (req, res) => {
  try {
    const { tower, process } = req.query;
    
    if (!tower || !process) {
      return res.status(400).json({ message: 'tower and process query params required' });
    }

    const data = await Taxonomy.findOne({
      majorProcess: tower,
      process: process
    });

    if (!data) {
      return res.json([]);
    }

    const activities = (data.subProcesses || []).map(name => ({
      _id: `${data._id}-${name}`,
      name: name,
      isCustom: false,
      automationPotential: 'Not Assessed',
      addedBy: null
    }));

    res.json(activities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/activities/search
 * Full-text search for activities with full path
 * Query: ?q=searchterm&deptId=optional
 */
router.get('/search', verifyToken, async (req, res) => {
  try {
    const { q, deptId } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.json([]);
    }

    const query = {
      $or: [
        { majorProcess: { $regex: q, $options: 'i' } },
        { process: { $regex: q, $options: 'i' } },
        { subProcesses: { $regex: q, $options: 'i' } }
      ]
    };

    if (deptId && deptId !== 'All') {
      query.department = deptId;
    }

    const results = await Taxonomy.find(query);

    // Flatten results to show each activity separately
    const activities = [];
    results.forEach(item => {
      (item.subProcesses || []).forEach(subProc => {
        if (subProc.toLowerCase().includes(q.toLowerCase())) {
          activities.push({
            _id: `${item._id}-${subProc}`,
            name: subProc,
            department: { name: item.department || 'All' },
            tower: { name: item.majorProcess },
            process: { name: item.process },
            isCustom: false,
            automationPotential: 'Not Assessed'
          });
        }
      });
    });

    res.json(activities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/activities/custom
 * Create a new custom activity
 */
router.post('/custom', verifyToken, async (req, res) => {
  try {
    // Check permissions
    if (!canAddCustom(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions to add custom activities' });
    }

    const { 
      departmentId, 
      towerId, 
      processId, 
      name, 
      description, 
      automationPotential, 
      notes 
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Activity name is required' });
    }
    if (!towerId || !processId) {
      return res.status(400).json({ message: 'Tower and process are required' });
    }

    // Find the taxonomy entry
    let taxEntry = await Taxonomy.findOne({
      majorProcess: towerId,
      process: processId
    });

    if (!taxEntry) {
      // Create new entry if it doesn't exist
      taxEntry = new Taxonomy({
        majorProcess: towerId,
        process: processId,
        department: departmentId,
        subProcesses: []
      });
    }

    // Add custom activity
    const customActivity = {
      name: name.trim(),
      description: description || '',
      automationPotential: automationPotential || 'Not Assessed',
      notes: notes || '',
      isCustom: true,
      addedBy: req.user.id,
      addedByName: req.user.name,
      createdAt: new Date()
    };

    if (!taxEntry.subProcesses) {
      taxEntry.subProcesses = [];
    }

    // Add to subProcesses array
    taxEntry.subProcesses.push(name.trim());

    // If not already saved, save it
    if (!taxEntry._id) {
      await taxEntry.save();
    } else {
      await Taxonomy.updateOne(
        { _id: taxEntry._id },
        { $push: { subProcesses: name.trim() } }
      );
    }

    res.status(201).json({
      message: 'Process added successfully',
      activity: customActivity
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/activities/tower/custom
 * Create a new custom tower
 */
router.post('/tower/custom', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can create towers' });
    }

    const { departmentId, name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Tower name is required' });
    }

    // Check if tower already exists
    const exists = await Taxonomy.findOne({ majorProcess: name.trim() });
    
    if (exists) {
      return res.status(400).json({ message: 'Tower already exists' });
    }

    // Create a placeholder taxonomy entry for this tower
    const newTower = new Taxonomy({
      majorProcess: name.trim(),
      process: 'Default Process',
      department: departmentId,
      subProcesses: [],
      isActive: true
    });

    await newTower.save();

    res.status(201).json({
      message: 'Tower created successfully',
      tower: {
        name: name.trim(),
        processCount: 0
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/activities/process/custom
 * Create a new custom process
 */
router.post('/process/custom', verifyToken, async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { towerId, departmentId, name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Process name is required' });
    }
    if (!towerId) {
      return res.status(400).json({ message: 'Tower is required' });
    }

    // Check if process already exists under this tower
    const exists = await Taxonomy.findOne({
      majorProcess: towerId,
      process: name.trim()
    });

    if (exists) {
      return res.status(400).json({ message: 'Process already exists under this tower' });
    }

    // Create new process entry
    const newProcess = new Taxonomy({
      majorProcess: towerId,
      process: name.trim(),
      department: departmentId,
      subProcesses: [],
      isActive: true
    });

    await newProcess.save();

    res.status(201).json({
      message: 'Process created successfully',
      process: {
        name: name.trim(),
        activityCount: 0
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
