const fs = require('fs');

const data = JSON.parse(fs.readFileSync('6x6_data (1).json', 'utf8'));

let matchCount = 0;
let mismatchCount = 0;
let consolidateMismatchCount = 0;
const mismatches = [];

data.departments.forEach(dept => {
  dept.processes.forEach(process => {
    if (process.activities) {
      process.activities.forEach(activity => {
        if (!activity.parameters) return;

        const keys = Object.keys(activity.parameters);
        const values = Object.values(activity.parameters);
        
        if (values.length !== 12) {
          console.log(`Warning: ${activity.id} has ${values.length} parameters`);
        }

        const perfScore = values.slice(0, 6).filter(val => val === 'H').length;
        const charScore = values.slice(6, 12).filter(val => val === 'L').length;
        const computedScore = perfScore + charScore;

        if (computedScore !== activity.score) {
          mismatchCount++;
          mismatches.push({
            id: activity.id,
            name: activity.name,
            expected: activity.score,
            computed: computedScore,
            values: values.join(',')
          });
        } else {
          matchCount++;
        }
        
        const expectedConsolidate = computedScore >= 7;
        if (expectedConsolidate !== activity.consolidate) {
           consolidateMismatchCount++;
        }
      });
    }
  });
});

console.log(`Matched: ${matchCount}`);
console.log(`Mismatched: ${mismatchCount}`);
console.log(`Consolidate Mismatched: ${consolidateMismatchCount}`);
if (mismatchCount > 0) {
  console.log(JSON.stringify(mismatches.slice(0, 10), null, 2));
}
