const fs = require('fs');
const path = require('path');

const CRITERIA_KEYS = [
  'Multiple Locns',
  'Routine',
  'Volumes',
  'Manpower',
  'SOPs',
  'ERP / Technology',
  'Sensitivity',
  'Criticality',
  'Controls',
  'Proximity',
  'Regulatory',
  'Skill',
];

function readJsonFile(relativePath) {
  const filePath = path.resolve(__dirname, '..', '..', relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function computeScore(criteria = []) {
  if (!Array.isArray(criteria) || criteria.length === 0) return 0;

  const performanceScore = criteria.slice(0, 6).filter((value) => value === 'H').length;
  const characteristicScore = criteria.slice(6, 12).filter((value) => value === 'L').length;

  return performanceScore + characteristicScore;
}

function buildTaxonomyRecords(sourcePath) {
  const source = readJsonFile(sourcePath);

  return (source.towers || []).flatMap((tower) =>
    (tower.processes || []).map((process) => ({
      majorProcess: String(tower.name || '').trim(),
      process: String(process.name || '').trim(),
      subProcesses: (process.subProcesses || [])
        .map((subProcess) => (typeof subProcess === 'string' ? subProcess : subProcess?.name))
        .filter(Boolean),
      tags: [],
      department: source.department,
      isActive: true,
    }))
  );
}

function buildProcessAnalysisRecords(sourcePath) {
  const source = readJsonFile(sourcePath);

  return (source.departments || []).flatMap((department) =>
    (department.processes || []).flatMap((processGroup) =>
      (processGroup.activities || [])
        .filter((activity) => activity && activity.name)
        .map((activity) => {
          const criteria = CRITERIA_KEYS.map((key) => {
            const value = activity.parameters?.[key];
            return typeof value === 'string' && value.length > 0 ? value : '-';
          });
          const score = typeof activity.score === 'number' && Number.isFinite(activity.score)
            ? activity.score
            : computeScore(criteria);

          return {
            process: activity.name,
            department: department.id,
            type: activity.type || 'Core',
            criteria,
            score,
            consolidated: typeof activity.consolidate === 'boolean' ? activity.consolidate : score >= 7,
          };
        })
    )
  );
}

function getMockTaxonomyRecords() {
  return [
    ...buildTaxonomyRecords('hr_activities (1).json'),
    ...buildTaxonomyRecords('fa_activities (1).json'),
  ];
}

function getMockProcessAnalysisRecords() {
  return buildProcessAnalysisRecords('6x6_data (1).json');
}

module.exports = {
  getMockTaxonomyRecords,
  getMockProcessAnalysisRecords,
};