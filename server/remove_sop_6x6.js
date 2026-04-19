const mongoose = require('mongoose');
const ProcessAnalysis = require('./models/ProcessAnalysis');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const sopRegex = /^Standard Operating Procedure\s+\d+$/i;

    const before = await ProcessAnalysis.find({ process: { $regex: sopRegex } })
      .select({ _id: 0, process: 1, department: 1 })
      .lean();

    const result = await ProcessAnalysis.deleteMany({
      process: { $regex: sopRegex }
    });

    const afterCount = await ProcessAnalysis.countDocuments({
      process: { $regex: sopRegex }
    });

    console.log('Standard Operating Procedure cleanup:');
    console.log(`  Found before delete: ${before.length}`);
    console.log(`  Deleted: ${result.deletedCount}`);
    console.log(`  Remaining after delete: ${afterCount}`);

    if (before.length > 0) {
      console.log('  Removed entries:');
      before.slice(0, 20).forEach((row) => {
        console.log(`    - ${row.process} (${row.department})`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
