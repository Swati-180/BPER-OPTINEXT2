const mongoose = require('mongoose');
const ProcessAnalysis = require('./models/ProcessAnalysis');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const numericRegex = /^\d+(\.\d+)*$/;

    const beforeCount = await ProcessAnalysis.countDocuments({
      process: { $regex: numericRegex }
    });

    const removeResult = await ProcessAnalysis.deleteMany({
      process: { $regex: numericRegex }
    });

    const remainingNumeric = await ProcessAnalysis.countDocuments({
      process: { $regex: numericRegex }
    });

    console.log('6x6 numeric cleanup summary:');
    console.log(`  Found before cleanup: ${beforeCount}`);
    console.log(`  Deleted: ${removeResult.deletedCount}`);
    console.log(`  Remaining numeric rows: ${remainingNumeric}`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
