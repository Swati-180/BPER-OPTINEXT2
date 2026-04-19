const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ProcessAnalysis = require('./models/ProcessAnalysis');
require('dotenv').config();

// Order of criteria based on 6x6 matrix columns
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

    // Read 6x6 data
    const filePath = path.join(__dirname, '..', '6x6_data (1).json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    console.log('=== 6x6 Matrix Data Seeding ===\n');

    let totalCreated = 0;
    let totalReplaced = 0;
    let totalSkipped = 0;

    // Process each department
    for (const dept of data.departments) {
      const departmentName = dept.name;
      console.log(`Processing Department: ${departmentName}`);

      // Process each process in the department
      for (const process of dept.processes) {
        if (!process.activities || process.activities.length === 0) {
          continue;
        }

        // Process each activity
        for (const activity of process.activities) {
          // Build criteria array from parameters in order
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
            department: departmentName,
            type: activity.type || 'General',
            criteria: criteria,
            consolidated: activity.consolidate || false
          };

          // Try to find and replace, otherwise create
          const existingRecord = await ProcessAnalysis.findOne({
            process: processLabel,
            department: departmentName
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

    // Show summary
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
