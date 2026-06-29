const fs = require('fs');

const data = JSON.parse(fs.readFileSync('6x6_data (1).json', 'utf8'));

const processIds = new Set();
const activityIds = new Set();
const duplicates = [];

data.departments.forEach(dept => {
  dept.processes.forEach(process => {
    if (processIds.has(process.id)) {
      duplicates.push(`Duplicate Process ID: ${process.id}`);
    }
    processIds.add(process.id);

    if (process.activities) {
      process.activities.forEach(activity => {
        if (activityIds.has(activity.id)) {
          duplicates.push(`Duplicate Activity ID: ${activity.id}`);
        }
        activityIds.add(activity.id);
      });
    }
  });
});

if (duplicates.length > 0) {
  console.log('Duplicates found:');
  console.log(duplicates.join('\n'));
} else {
  console.log('No duplicate IDs found.');
}
