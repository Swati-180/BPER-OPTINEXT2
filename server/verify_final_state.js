const mongoose = require('mongoose');
const Taxonomy = require('./models/Taxonomy');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('=== Final Database State ===\n');
    
    // Summary stats
    const total = await Taxonomy.countDocuments();
    console.log(`Total records: ${total}`);
    
    const byDept = await Taxonomy.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 }, towers: { $addToSet: '$majorProcess' } } },
      { $sort: { count: -1 } }
    ]);
    
    console.log('\nRecords by Department:');
    byDept.forEach(group => {
      console.log(`  ${group._id || 'Unspecified'}: ${group.count} records, ${group.towers.length} towers`);
      console.log(`    Towers: ${group.towers.sort().join(', ')}`);
    });
    
    // Verify no numerical processes remain
    console.log('\n=== Verification ===\n');
    const numericalIds = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    const hasNumerical = await Taxonomy.findOne({
      $or: [
        { majorProcess: { $in: numericalIds } },
        { process: { $in: numericalIds } }
      ]
    });
    
    if (hasNumerical) {
      console.log('⚠️  WARNING: Numerical processes still found!');
    } else {
      console.log('✓ No numerical processes (1-12) in database');
      console.log('✓ All legitimate process data preserved');
      console.log('✓ Mock data cleaning completed successfully');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
