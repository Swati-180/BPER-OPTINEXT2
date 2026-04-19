const mongoose = require('mongoose');
const Taxonomy = require('./models/Taxonomy');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    // Remove numerical processes 1-12
    console.log('Removing numerical processes (1-12)...');
    
    const result = await Taxonomy.deleteMany({
      $or: [
        { majorProcess: { $in: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] } },
        { process: { $in: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] } }
      ]
    });
    
    console.log(`✓ Deleted ${result.deletedCount} records\n`);
    
    // Show remaining summary
    const remaining = await Taxonomy.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 }, towers: { $addToSet: '$majorProcess' } } },
      { $sort: { _id: 1 } }
    ]);
    
    console.log('Remaining records by department:');
    remaining.forEach(group => {
      console.log(`  ${group._id || 'Unspecified'}: ${group.count} records, ${group.towers.length} towers`);
    });
    
    console.log('\n✓ Cleanup completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
