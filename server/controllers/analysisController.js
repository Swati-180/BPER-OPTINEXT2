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

  let consolidated = record.consolidated;
  if (consolidated === undefined) {
    let hasException = false;
    const criteria = Array.isArray(record.criteria) ? record.criteria : [];
    if (criteria.length >= 12) {
      const proximity = criteria[9];
      const sensitivity = criteria[6];
      const controls = criteria[8];
      const regulatory = criteria[10];
      const skill = criteria[11];
      if (proximity === 'H' && (sensitivity === 'H' || controls === 'H' || regulatory === 'H' || skill === 'H')) {
        hasException = true;
      }
    }
    consolidated = hasException ? false : (score >= 7);
  }

  return {
    ...record,
    score,
    consolidated
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
    const VALID_DEPARTMENTS = ['Finance & Accounting', 'HR', 'Logistics', 'SCM'];
    let matchStage = {};
    if (department && department !== 'All Departments') {
       matchStage = { 'employee.department': department };
    } else {
       matchStage = { 'employee.department': { $in: VALID_DEPARTMENTS } };
    }
    
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
                 { $eq: ['$status', 'Approved'] }, 
                 { $convert: { input: '$payload.rows.timeTakenHoursPerMonth', to: 'double', onError: 0, onNull: 0 } }, 
                 0
               ] 
             } 
           }
         }
       }
    ]);
    
    // 2. Synchronize newly aggregated processes into ProcessAnalysis using batching (O(1) lookups)
    const existingProcesses = await ProcessAnalysis.find({
      department: matchStage['employee.department']
    }).select('process').lean();
    
    const existingProcessSet = new Set(existingProcesses.map(p => p.process));
    const newProcessDocs = [];

    for (const item of aggregatedProcesses) {
      const processName = item._id?.process;
      const deptName = item._id?.department || 'Finance & Accounting';

      if (!processName || !processName.trim()) continue;
      if (isMockStandardOperatingProcedure(processName)) continue;

      if (!existingProcessSet.has(processName)) {
        newProcessDocs.push({
          process: processName,
          department: deptName,
          type: item._id.type || 'core',
          criteria: Array.from({ length: 12 }, () => '-'),
          score: 0,
          consolidated: false
        });
        existingProcessSet.add(processName);
      }
    }

    if (newProcessDocs.length > 0) {
      console.log(`[6x6 Report] Inserting ${newProcessDocs.length} new processes into ProcessAnalysis via insertMany...`);
      await ProcessAnalysis.insertMany(newProcessDocs, { ordered: false }).catch(err => {
        // Ignore duplicate key races if any
        if (err.code !== 11000) console.warn('[6x6 Report] insertMany warning:', err.message);
      });
    }

    // 3. Query with strict matching
    let query = {};
    if (department && department !== 'All Departments') {
       query.department = department;
    } else {
       // Return all authoritative departments
       query.department = { $in: VALID_DEPARTMENTS };
    }

    const data = await ProcessAnalysis.find(query).sort({ department: 1, type: 1 }).lean();
    const taxonomyData = await Taxonomy.find({}).lean();

    // Build O(1) index for Taxonomy lookup
    const subProcessToTax = new Map();
    const processToTax = new Map();
    const majorToTax = new Map();

    for (const t of taxonomyData) {
      if (Array.isArray(t.subProcesses)) {
        for (const sp of t.subProcesses) {
          if (!subProcessToTax.has(sp) || t.department === query.department) {
            subProcessToTax.set(sp, t);
          }
        }
      }
      if (!processToTax.has(t.process) || t.department === query.department) {
        processToTax.set(t.process, t);
      }
      if (!majorToTax.has(t.majorProcess) || t.department === query.department) {
        majorToTax.set(t.majorProcess, t);
      }
    }

    // Map aggregated processes for FTE lookup
    const fteLookup = {};
    aggregatedProcesses.forEach(item => {
      const key = `${item._id.department || 'General'}::${item._id.process}`;
      fteLookup[key] = (item.totalHours || 0) / 160;
    });

    const enrichedData = data.map(record => {
      const normalized = normalizeAnalysisRecord(record);
      
      // O(1) taxonomy resolution
      const tax = subProcessToTax.get(normalized.process) ||
                  processToTax.get(normalized.process) ||
                  majorToTax.get(normalized.process);

      const key = `${normalized.department}::${normalized.process}`;
      const fte = fteLookup[key] || 0;

      let subProcessGroup = tax && tax.process ? tax.process : 'Unknown';
      if (subProcessGroup.startsWith('Payroll - ')) {
        subProcessGroup = subProcessGroup.replace('Payroll - ', '');
      }

      // Compute display activity name: strip subProcessGroup if process starts with it
      let displayProcess = normalized.process;
      const subPrefix = `${subProcessGroup} - `;
      if (displayProcess.startsWith(subPrefix)) {
        displayProcess = displayProcess.replace(subPrefix, '');
      }

      return {
        ...normalized,
        tower: tax ? tax.majorProcess : 'Unknown',
        subProcessGroup,
        displayProcess,
        fte: Number(fte.toFixed(2))
      };
    });

    console.log(`[6x6 Report] Successfully enriched and returning ${enrichedData.length} records.`);
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
