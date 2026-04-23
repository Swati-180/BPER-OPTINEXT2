const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ProcessAnalysis = require('./models/ProcessAnalysis');

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bper');
    console.log('Connected.');

    const dataPath = path.join(__dirname, '..', '6x6_data (1).json');
    if (!fs.existsSync(dataPath)) {
      console.error('Data file not found at:', dataPath);
      process.exit(1);
    }

    const raw = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(raw);

    const records = [];
    
    if (data.departments && Array.isArray(data.departments)) {
      data.departments.forEach(dept => {
        if (dept.processes && Array.isArray(dept.processes)) {
          dept.processes.forEach(proc => {
            if (proc.activities && Array.isArray(proc.activities)) {
              proc.activities.forEach(act => {
                const criteriaMap = act.parameters || {};
                const criteria = [
                  criteriaMap['Multiple Locns'] || '-',
                  criteriaMap['Routine'] || '-',
                  criteriaMap['Volumes'] || '-',
                  criteriaMap['Manpower'] || '-',
                  criteriaMap['SOPs'] || '-',
                  criteriaMap['ERP / Technology'] || '-',
                  criteriaMap['Sensitivity'] || '-',
                  criteriaMap['Criticality'] || '-',
                  criteriaMap['Controls'] || '-',
                  criteriaMap['Proximity'] || '-',
                  criteriaMap['Regulatory'] || '-',
                  criteriaMap['Skill'] || '-'
                ];

                records.push({
                  process: act.name,
                  department: dept.id, // e.g. "F&A"
                  type: (act.type || 'core').toLowerCase(),
                  criteria: criteria,
                  score: act.score,
                  consolidated: !!act.consolidate
                });
              });
            }
          });
        }
      });
    }

    console.log(`Parsed ${records.length} records. Cleaning up existing data...`);
    // Optional: Delete existing or only upsert
    // For now, let's just clear and re-insert to ensure it matches the JSON
    await ProcessAnalysis.deleteMany({});
    
    console.log('Inserting records...');
    const result = await ProcessAnalysis.insertMany(records);
    console.log(`Successfully seeded ${result.length} records.`);

    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
