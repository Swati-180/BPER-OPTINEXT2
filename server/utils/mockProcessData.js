/**
 * Utility functions for processing mock data
 * Reads and transforms JSON files into MongoDB-compatible records
 */

const fs = require('fs');
const path = require('path');

function isNumericLabel(value) {
  if (typeof value !== 'string') return false;
  return /^\d+(\.\d+)*$/.test(value.trim());
}

function resolveLabel(item) {
  const name = (item?.name || '').trim();
  const id = (item?.id || '').trim();

  if (name && !isNumericLabel(name)) return name;
  if (id && !isNumericLabel(id)) return id;
  if (name) return name;
  if (id) return id;
  return 'Unknown';
}

/**
 * Read a JSON file from the project root
 */
function readJsonFile(filename) {
  try {
    const filePath = path.join(__dirname, '../../', filename);
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filename}:`, err.message);
    return null;
  }
}

/**
 * Build Taxonomy records from 6x6 data
 * Expects structure: { departments: [...] }
 */
function buildTaxonomyFromSixBySix() {
  const data = readJsonFile('6x6_data (1).json');
  if (!data || !data.departments) return [];

  const records = [];

  data.departments.forEach(dept => {
    const deptId = dept.id || dept.name;
    
    if (dept.processes && Array.isArray(dept.processes)) {
      dept.processes.forEach(process => {
        const record = {
          majorProcess: resolveLabel(process) || 'Unknown',
          process: resolveLabel(process) || 'Default',
          subProcesses: (process.activities || []).map(activity => resolveLabel(activity) || ''),
          department: deptId,
          tags: [],
          isActive: true,
          source: '6x6_data'
        };
        
        // Filter out empty subprocess names
        record.subProcesses = record.subProcesses.filter(s => s && s.trim());
        
        if (record.subProcesses.length > 0 || process.name) {
          records.push(record);
        }
      });
    }
  });

  return records;
}

/**
 * Build Taxonomy records from FA activities
 * Expects structure: { towers: [...] with processes and subProcesses }
 */
function buildTaxonomyFromFAActivities() {
  const data = readJsonFile('fa_activities (1).json');
  if (!data || !data.towers) return [];

  const records = [];

  data.towers.forEach(tower => {
    const towerName = tower.name || 'Unknown Tower';
    
    if (tower.processes && Array.isArray(tower.processes)) {
      tower.processes.forEach(process => {
        const processName = process.name || 'Default Process';
        const subProcesses = [];

        if (process.subProcesses && Array.isArray(process.subProcesses)) {
          process.subProcesses.forEach(subProc => {
            if (subProc && subProc.name) {
              subProcesses.push(subProc.name);
            }
          });
        }

        const record = {
          majorProcess: towerName,
          process: processName,
          subProcesses: subProcesses,
          department: 'Finance & Accounting',
          tags: [],
          isActive: true,
          source: 'fa_activities'
        };

        if (subProcesses.length > 0 || processName) {
          records.push(record);
        }
      });
    }
  });

  return records;
}

/**
 * Build Taxonomy records from HR activities
 * Similar structure to FA activities
 * Filters out numerical tower names (1-12) to avoid placeholder entries
 */
function buildTaxonomyFromHRActivities() {
  const data = readJsonFile('hr_activities (1).json');
  if (!data || !data.towers) return [];

  const records = [];
  
  // List of numerical identifiers to skip
  const numericalIds = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  data.towers.forEach(tower => {
    const towerName = tower.name || 'Unknown Tower';
    
    // Skip numerical tower names
    if (numericalIds.includes(towerName)) {
      return; // Skip this tower
    }
    
    if (tower.processes && Array.isArray(tower.processes)) {
      tower.processes.forEach(process => {
        const processName = process.name || 'Default Process';
        
        // Skip numerical process names
        if (numericalIds.includes(processName)) {
          return; // Skip this process
        }
        
        const subProcesses = [];

        if (process.subProcesses && Array.isArray(process.subProcesses)) {
          process.subProcesses.forEach(subProc => {
            if (subProc && subProc.name) {
              subProcesses.push(subProc.name);
            }
          });
        }

        const record = {
          majorProcess: towerName,
          process: processName,
          subProcesses: subProcesses,
          department: 'HR',
          tags: [],
          isActive: true,
          source: 'hr_activities'
        };

        if (subProcesses.length > 0 || processName) {
          records.push(record);
        }
      });
    }
  });

  return records;
}

/**
 * Build ProcessAnalysis records from all data sources
 */
function buildProcessAnalysisRecords() {
  const records = [];

  // From 6x6 data
  const sixBySix = readJsonFile('6x6_data (1).json');
  if (sixBySix && sixBySix.departments) {
    sixBySix.departments.forEach(dept => {
      if (dept.processes) {
        dept.processes.forEach(process => {
          if (process.activities) {
            process.activities.forEach(activity => {
              const resolvedActivityName = resolveLabel(activity);
              const resolvedProcessName = resolveLabel(process);
              const record = {
                processName: resolvedActivityName,
                activityName: resolvedActivityName,
                department: dept.id || dept.name,
                tower: resolvedProcessName,
                consolidate: activity.consolidate || false,
                automationPotential: 'Not Assessed',
                status: 'Active',
                source: '6x6_data'
              };
              records.push(record);
            });
          }
        });
      }
    });
  }

  // From FA activities
  const faActivities = readJsonFile('fa_activities (1).json');
  if (faActivities && faActivities.towers) {
    faActivities.towers.forEach(tower => {
      if (tower.processes) {
        tower.processes.forEach(process => {
          if (process.subProcesses) {
            process.subProcesses.forEach(subProc => {
              const record = {
                processName: process.name || 'Unknown',
                activityName: subProc.name || 'Unknown',
                department: 'Finance & Accounting',
                tower: tower.name || 'Unknown',
                consolidate: false,
                automationPotential: 'Not Assessed',
                status: 'Active',
                source: 'fa_activities'
              };
              records.push(record);
            });
          }
        });
      }
    });
  }

  // From HR activities
  const hrActivities = readJsonFile('hr_activities (1).json');
  if (hrActivities && hrActivities.towers) {
    hrActivities.towers.forEach(tower => {
      if (tower.processes) {
        tower.processes.forEach(process => {
          if (process.subProcesses) {
            process.subProcesses.forEach(subProc => {
              const record = {
                processName: process.name || 'Unknown',
                activityName: subProc.name || 'Unknown',
                department: 'HR',
                tower: tower.name || 'Unknown',
                consolidate: false,
                automationPotential: 'Not Assessed',
                status: 'Active',
                source: 'hr_activities'
              };
              records.push(record);
            });
          }
        });
      }
    });
  }

  return records;
}

module.exports = {
  readJsonFile,
  buildTaxonomyFromSixBySix,
  buildTaxonomyFromFAActivities,
  buildTaxonomyFromHRActivities,
  buildProcessAnalysisRecords
};
