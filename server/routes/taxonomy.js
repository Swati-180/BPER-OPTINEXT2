const express = require('express');
const router = express.Router();
const Taxonomy = require('../models/Taxonomy');
const verifyToken = require('../middleware/verifyToken');
const { mapActivity, createTaxonomy, updateTaxonomy, deleteTaxonomy, getMajorProcesses, getProcessesByMajor, getSubProcessesByProcess } = require('../controllers/taxonomyController');

// Hierarchical query routes (for Process Selection step)
router.get('/major-processes', verifyToken, getMajorProcesses);
router.get('/processes-by-major', verifyToken, getProcessesByMajor);
router.get('/subprocesses-by-process', verifyToken, getSubProcessesByProcess);
router.get('/all-subprocesses-with-parents', verifyToken, require('../controllers/taxonomyController').getAllSubProcessesWithParents);

// Helper to classify towers when department is missing/unspecified
function isHRTower(majorProcess) {
  if (!majorProcess) return false;
  const m = String(majorProcess).toLowerCase();
  return /human|hr\b|talent|recruit|people|employee|performance|records management|workforce|onboard/i.test(m);
}

function normalizeDepartmentName(dept, towerName) {
  if (dept && dept !== 'All' && dept !== 'All Departments') {
    const d = String(dept).trim().toLowerCase();
    if (d === 'hr' || d.includes('human resource')) return 'HR';
    if (d.includes('fin') || d.includes('account') || d.includes('f&a')) return 'Finance & Accounting';
    return dept;
  }
  return isHRTower(towerName) ? 'HR' : 'Finance & Accounting';
}

router.get('/processes', verifyToken, async (req, res) => {
  try {
    const { department } = req.query;
    let query = { isActive: true };
    
    const isHR = department && /^(hr|human\s*resources)$/i.test(department.trim());
    const isFinance = department && /^(finance|finance & accounting|finance & accounts|f&a)/i.test(department.trim());

    if (isHR) {
      query.$or = [
        { department: { $in: ['HR', 'Human Resources'] } },
        { department: { $regex: /^hr|^human\s*resources/i } },
        {
          department: { $in: [null, '', undefined] },
          majorProcess: { $regex: /human|hr\b|talent|recruit|people|employee|performance|records management|workforce|onboard/i }
        }
      ];
    } else if (isFinance) {
      query.$or = [
        { department: { $in: ['Finance & Accounting', 'F&A', 'Finance', 'Finance & Accounts'] } },
        { department: { $regex: /^fin|account|f&a/i } },
        {
          department: { $in: [null, '', undefined] },
          majorProcess: { $not: { $regex: /human|hr\b|talent|recruit|people|employee|performance|records management|workforce|onboard/i } }
        }
      ];
    } else if (department && department !== 'All' && department !== 'All Departments') {
      query.department = department;
    }

    const data = await Taxonomy.find(query).lean();

    // Normalize department property on each returned document
    const normalizedData = data.map((item) => {
      const canonicalDept = isHR
        ? 'HR'
        : isFinance
        ? 'Finance & Accounting'
        : normalizeDepartmentName(item.department, item.majorProcess);

      return {
        ...item,
        department: canonicalDept
      };
    });

    res.json(normalizedData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/map', verifyToken, mapActivity);
router.post('/create', verifyToken, createTaxonomy);
router.put('/:id', verifyToken, updateTaxonomy);
router.delete('/:id', verifyToken, deleteTaxonomy);

module.exports = router;
