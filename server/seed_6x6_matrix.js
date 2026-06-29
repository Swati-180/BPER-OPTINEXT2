const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ProcessAnalysis = require('./models/ProcessAnalysis');
require('dotenv').config();

const CRITERIA_ORDER = [
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
  'Skill'
];

function isNumericLabel(value) {
  if (typeof value !== 'string') return false;
  return /^\d+(\.\d+)*$/.test(value.trim());
}

function resolveProcessLabel(activity) {
  const name = (activity?.name || '').trim();
  const id = (activity?.id || '').trim();

  if (name && !isNumericLabel(name)) return name;
  if (id && !isNumericLabel(id)) return id;
  if (name) return name;
  if (id) return id;
  return 'Unknown';
}

async function seed6x6Data() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const filePath = path.join(__dirname, '..', '6x6_data (1).json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    console.log('=== 6x6 Matrix Data Seeding ===\n');

    let totalCreated = 0;
    let totalReplaced = 0;
    let totalSkipped = 0;

    for (const dept of data.departments) {
      const departmentId = dept.id;
      console.log(`Processing Department: ${departmentId}`);

      for (const process of dept.processes) {
        if (!process.activities || process.activities.length === 0) {
          continue;
        }

        for (const activity of process.activities) {
          const criteria = CRITERIA_ORDER.map(key => {
            const value = activity.parameters?.[key];
            return value || '-';
          });

          const processLabel = resolveProcessLabel(activity);
          if (isNumericLabel(processLabel)) {
            totalSkipped++;
            continue;
          }

          const record = {
            process: processLabel,
            department: departmentId,
            type: activity.type || 'General',
            criteria: criteria,
            consolidated: activity.consolidate || false
          };

          const existingRecord = await ProcessAnalysis.findOne({
            process: processLabel,
            department: departmentId
          });

          if (existingRecord) {
            await ProcessAnalysis.findByIdAndUpdate(existingRecord._id, record, { new: true });
            totalReplaced++;
          } else {
            await ProcessAnalysis.create(record);
            totalCreated++;
          }
        }
      }
    }

    console.log(`\n✓ Seeding completed!`);
    console.log(`  - Created: ${totalCreated} new records`);
    console.log(`  - Replaced: ${totalReplaced} existing records`);
    console.log(`  - Skipped numeric mock rows: ${totalSkipped}`);
    console.log(`  - Total processed: ${totalCreated + totalReplaced} records\n`);

    const summary = await ProcessAnalysis.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    console.log('Current database state by department:');
    summary.forEach(item => {
      console.log(`  ${item._id}: ${item.count} records`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

seed6x6Data();
