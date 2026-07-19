const fs = require('fs');

const data = JSON.parse(fs.readFileSync('6x6_data (1).json', 'utf8'));

const duplicates = [];

data.departments.forEach(dept => {
  const deptName = dept.name || dept.id;
  const processIds = new Set();
  const activityIds = new Set();
  
  dept.processes.forEach(process => {
    if (processIds.has(process.id)) {
      duplicates.push(`Dept ${deptName}: Duplicate Process ID: ${process.id}`);
    }
    processIds.add(process.id);

    if (process.activities) {
      process.activities.forEach(activity => {
        if (activityIds.has(activity.id)) {
          duplicates.push(`Dept ${deptName}: Duplicate Activity ID: ${activity.id}`);
        }
        activityIds.add(activity.id);
      });
    }
  });
});

if (duplicates.length > 0) {
  console.log('Duplicates found within same department:');
  console.log(duplicates.join('\n'));
} else {
  console.log('No duplicate IDs found within the same department.');
}
