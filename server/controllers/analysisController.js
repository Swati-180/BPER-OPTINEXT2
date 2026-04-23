const ProcessAnalysis = require('../models/ProcessAnalysis');
const WDTSubmission = require('../models/WDTSubmission');
const Taxonomy = require('../models/Taxonomy');

function computeScore(criteria = []) {
  if (!criteria || criteria.length === 0) return 0;
  
  // PRD: Group 1 (Performance - first 6) looking for 'H'
  const performanceScore = criteria.slice(0, 6).filter(val => val === 'H').length;
  
  // PRD: Group 2 (Characteristics - next 6) looking for 'L'
  const characteristicScore = criteria.slice(6, 12).filter(val => val === 'L').length;
  
  return performanceScore + characteristicScore;
}

function normalizeAnalysisRecord(record) {
  const score = typeof record.score === 'number' && Number.isFinite(record.score)
    ? record.score
    : computeScore(Array.isArray(record.criteria) ? record.criteria : []);

  return {
    ...record,
    score,
    consolidated: typeof record.consolidated === 'boolean' ? record.consolidated : score >= 7,
  };
}

function isMockStandardOperatingProcedure(processName = '') {
  return /^Standard Operating Procedure\s+\d+$/i.test(String(processName).trim());
}

const getSixBySixData = async (req, res) => {
  try {
    const { department } = req.query;
    console.log(`[6x6 Report] Fetching data for department: "${department}"`);
    
    // 1. Sync new processes from WDT submissions
    const matchStage = department && department !== 'All Departments' ? { 'employee.department': department } : {};
    
    const aggregatedProcesses = await WDTSubmission.aggregate([
       { $match: matchStage },
       { $unwind: '$payload.rows' },
       { 
         $group: {
           _id: { 
             process: '$payload.rows.subProcess',
             department: '$employee.department',
             type: '$payload.rows.activityCategory'
           },
           totalHours: { 
             $sum: { 
               $cond: [
                 { $eq: ['$status', 'approved'] }, 
                 { $convert: { input: '$payload.rows.monthlyHours', to: 'double', onError: 0, onNull: 0 } }, 
                 0
               ] 
             } 
           }
         }
       }
    ]);
    
    // 2. Insert stubs with random values for testing if not exists
    const criteriaOptions = ['H', 'M', 'L', '-'];
    
    for (const item of aggregatedProcesses) {
      const processName = item._id.process;
      const deptName = item._id.department || 'General';
      
      if (!processName) continue;
      if (isMockStandardOperatingProcedure(processName)) continue;
      
      const exists = await ProcessAnalysis.findOne({
        process: processName,
        department: deptName
      });
      
      if (!exists) {
        // Create with random criteria for now as requested
        const randomCriteria = Array.from({ length: 12 }, () => 
          criteriaOptions[Math.floor(Math.random() * criteriaOptions.length)]
        );
        
        await ProcessAnalysis.create({
          process: processName,
          department: deptName,
          type: item._id.type || 'core',
          criteria: randomCriteria,
          score: 0, // calc automatically by pre-save
          consolidated: false
        });
      }
    }
    
    // 3. Query with strict matching
    let query = {};
    if (department && department !== 'All Departments') {
       query.department = department;
    }
    
    const data = await ProcessAnalysis.find(query).sort({ department: 1, type: 1 }).lean();
    const taxonomyData = await Taxonomy.find({}).lean();
    
    // Map aggregated processes for FTE lookup
    const fteLookup = {};
    aggregatedProcesses.forEach(item => {
      const key = `${item._id.department || 'General'}::${item._id.process}`;
      fteLookup[key] = (item.totalHours || 0) / 160;
    });
    
    const enrichedData = data.map(record => {
      const normalized = normalizeAnalysisRecord(record);
      // Find tower
      const tax = taxonomyData.find(t => 
        (t.subProcesses && t.subProcesses.includes(normalized.process)) || 
        t.process === normalized.process ||
        t.majorProcess === normalized.process
      );
      
      const key = `${normalized.department}::${normalized.process}`;
      const fte = fteLookup[key] || 0;

      return {
        ...normalized,
        tower: tax ? tax.majorProcess : 'Unknown',
        fte: Number(fte.toFixed(2))
      };
    });

    res.json(enrichedData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createProcessRecord = async (req, res) => {
  try {
    const payload = normalizeAnalysisRecord(req.body);
    const record = await ProcessAnalysis.create(payload);
    res.status(201).json(normalizeAnalysisRecord(record.toObject()));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const bulkUpdateProcessRecords = async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ message: 'rows must be an array' });

    // Iterate safely to ensure the 'pre' save hooks apply securely computing the score natively 
    const results = [];
    for (const row of rows) {
      const record = await ProcessAnalysis.findById(row._id);
      if (record) {
         record.criteria = row.criteria;
         record.consolidated = row.consolidated;
         await record.save(); // pre-save hook handles calculating .score correctly!
         results.push(record);
      }
    }
    
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getSixBySixData, createProcessRecord, bulkUpdateProcessRecords };
