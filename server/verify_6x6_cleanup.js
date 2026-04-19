const mongoose = require('mongoose');
const ProcessAnalysis = require('./models/ProcessAnalysis');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const numericRegex = /^\d+(\.\d+)*$/;

    const numericTotal = await ProcessAnalysis.countDocuments({
      process: { $regex: numericRegex }
    });

    const numericHr = await ProcessAnalysis.countDocuments({
      department: 'HR',
      process: { $regex: numericRegex }
    });

    const hrSample = await ProcessAnalysis.find({ department: 'HR' })
      .sort({ process: 1 })
      .limit(15)
      .select({ _id: 0, process: 1, department: 1 })
      .lean();

    console.log('6x6 cleanup verification:');
    console.log(`  Numeric rows total: ${numericTotal}`);
    console.log(`  Numeric rows in HR: ${numericHr}`);
    console.log('  Sample HR rows:');
    hrSample.forEach((row) => {
      console.log(`    - ${row.process}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
