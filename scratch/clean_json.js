const fs = require('fs');

const data = JSON.parse(fs.readFileSync('6x6_data (1).json', 'utf8'));

function isNumericLabel(value) {
  if (typeof value !== 'string') return false;
  return /^\d+(\.\d+)*$/.test(value.trim());
}

data.departments.forEach(dept => {
  const deptName = dept.name || dept.id;
  const usedProcessIds = new Set();
  const usedActivityIds = new Set();

  dept.processes.forEach(process => {
    // 1. Check for swap in Process
    if (isNumericLabel(process.name) && !isNumericLabel(process.id)) {
      const temp = process.id;
      process.id = process.name;
      process.name = temp;
    }

    // 2. Fix duplicate process IDs
    let pId = process.id;
    let counter = 1;
    while (usedProcessIds.has(pId)) {
      pId = `${process.id}_dup${counter}`;
      counter++;
    }
    process.id = pId;
    usedProcessIds.add(process.id);

    if (process.activities) {
      process.activities.forEach(activity => {
        // 1. Check for swap in Activity
        if (isNumericLabel(activity.name) && !isNumericLabel(activity.id)) {
          const temp = activity.id;
          activity.id = activity.name;
          activity.name = temp;
        }

        // 2. Fix duplicate activity IDs
        let aId = activity.id;
        let aCounter = 1;
        while (usedActivityIds.has(aId)) {
          aId = `${activity.id}_dup${aCounter}`;
          aCounter++;
        }
        activity.id = aId;
        usedActivityIds.add(activity.id);
      });
    }
  });
});

fs.writeFileSync('6x6_data (1).json', JSON.stringify(data, null, 2), 'utf8');
console.log('Successfully cleaned up 6x6_data (1).json');
