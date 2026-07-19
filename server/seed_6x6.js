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
    let created = 0;
    let updated = 0;

    if (data.departments && Array.isArray(data.departments)) {
      for (const dept of data.departments) {
        if (dept.processes && Array.isArray(dept.processes)) {
          for (const proc of dept.processes) {
            if (proc.activities && Array.isArray(proc.activities)) {
              for (const act of proc.activities) {
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

                const record = {
                  process: act.name,
                  department: dept.id,
                  type: (act.type || 'general').toLowerCase(),
                  criteria: criteria,
                  score: act.score,
                  consolidated: !!act.consolidate
                };

                const existing = await ProcessAnalysis.findOne({
                  process: act.name,
                  department: dept.id
                });

                if (existing) {
                  await ProcessAnalysis.findByIdAndUpdate(existing._id, record, { new: true });
                  updated++;
                } else {
                  await ProcessAnalysis.create(record);
                  created++;
                }

                records.push(record);
              }
            }
          }
        }
      }
    }

    console.log(`Seeding completed: ${created} created, ${updated} updated.`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
