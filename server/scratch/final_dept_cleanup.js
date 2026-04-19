const mongoose = require('mongoose');
const MONGO_URI = 'mongodb+srv://OptiNxt_db_user:bOmbXEllFiC2E7Px@optinxt.khgupmq.mongodb.net/BPER?retryWrites=true&w=majority&appName=optinxt';

async function finalCleanup() {
  await mongoose.connect(MONGO_URI);
  
  // 1. Fix users with no department
  await mongoose.connection.db.collection('users').updateMany(
    { department: { $exists: false } },
    { $set: { department: 'General' } }
  );

  // 2. Fix submissions with no department
  await mongoose.connection.db.collection('wdtsubmissions').updateMany(
    { 'employee.department': { $exists: false } },
    { $set: { 'employee.department': 'General' } }
  );

  // 3. One more pass on the redistribution to ensure diversity
  const employees = await mongoose.connection.db.collection('users').find({ role: 'employee' }).toArray();
  const depts = ['F&A', 'HR', 'Logistics', 'SCM'];
  
  for (let i = 0; i < employees.length; i++) {
    const dept = depts[i % depts.length];
    const email = employees[i].email;
    
    console.log(`Setting ${email} to ${dept}`);
    await mongoose.connection.db.collection('users').updateOne({ email }, { $set: { department: dept } });
    await mongoose.connection.db.collection('wdtsubmissions').updateMany({ 'employee.email': email }, { $set: { 'employee.department': dept } });
  }

  // Clear 6x6 stubs again to force fresh sync from WDT records
  await mongoose.connection.db.collection('processanalyses').deleteMany({});

  console.log('Final cleanup and redistribution complete.');
  process.exit(0);
}

finalCleanup().catch(console.error);
