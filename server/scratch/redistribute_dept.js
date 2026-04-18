const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://OptiNxt_db_user:bOmbXEllFiC2E7Px@optinxt.khgupmq.mongodb.net/BPER?retryWrites=true&w=majority&appName=optinxt';

async function redistribute() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const deptMap = {
    'Emily@Employee.com': 'SCM',
    'David@Employee.com': 'Logistics',
    'Sarah@Employee.com': 'HR',
    'Michael@Employee.com': 'F&A',
    'Robert@Employee.com': 'SCM',
    'employee@bper.com': 'F&A'
  };

  for (const [email, dept] of Object.entries(deptMap)) {
    console.log(`Updating ${email} to ${dept}...`);
    // Update User
    await mongoose.connection.db.collection('users').updateOne(
      { email },
      { $set: { department: dept } }
    );
    // Update Submissions
    await mongoose.connection.db.collection('wdtsubmissions').updateMany(
      { 'employee.email': email },
      { $set: { 'employee.department': dept } }
    );
  }

  // Clear ProcessAnalysis to force a clean sync
  await mongoose.connection.db.collection('processanalyses').deleteMany({});
  console.log('Cleared ProcessAnalysis stubs.');

  console.log('Redistribution complete.');
  process.exit(0);
}

redistribute().catch(err => {
  console.error(err);
  process.exit(1);
});
