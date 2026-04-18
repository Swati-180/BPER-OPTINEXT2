const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://OptiNxt_db_user:bOmbXEllFiC2E7Px@optinxt.khgupmq.mongodb.net/BPER?retryWrites=true&w=majority&appName=optinxt';

async function verify() {
  await mongoose.connect(MONGO_URI);
  const WDTSubmission = mongoose.connection.db.collection('wdtsubmissions');
  
  const aggregatedProcesses = await WDTSubmission.aggregate([
    { $unwind: '$payload.rows' },
    { 
      $group: {
        _id: { 
          process: '$payload.rows.subProcess',
          department: '$employee.department',
          type: '$payload.rows.activityCategory'
        }
      }
    }
  ]).toArray();

  console.log('Total Unique Tasks found across all departments:', aggregatedProcesses.length);
  
  const deptsFound = [...new Set(aggregatedProcesses.map(p => p._id.department))];
  console.log('Departments with data:', deptsFound);

  process.exit(0);
}

verify().catch(console.error);
