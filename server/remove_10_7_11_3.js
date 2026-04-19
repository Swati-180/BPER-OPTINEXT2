const mongoose = require('mongoose');
const Taxonomy = require('./models/Taxonomy');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    // Find records with 10.7 and 11.3
    console.log('=== Records to be removed ===\n');
    
    const recordsToRemove = await Taxonomy.find({
      majorProcess: { $in: ['10.7', '11.3'] }
    }).lean();
    
    console.log(`Found ${recordsToRemove.length} records:\n`);
    recordsToRemove.forEach(rec => {
      console.log(`  - Tower: "${rec.majorProcess}", Process: "${rec.process}", Dept: ${rec.department}`);
    });
    
    console.log('\n=== Proceeding with deletion ===\n');
    
    // Remove them
    const result = await Taxonomy.deleteMany({
      majorProcess: { $in: ['10.7', '11.3'] }
    });
    
    console.log(`✓ Deleted ${result.deletedCount} records\n`);
    
    // Show remaining HR data
    const remainingHR = await Taxonomy.aggregate([
      { $match: { department: 'HR' } },
      { $group: { _id: '$majorProcess', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    console.log('Remaining HR towers:');
    remainingHR.forEach(tower => {
      console.log(`  ${tower._id}: ${tower.count} records`);
    });
    
    console.log('\n✓ Removal completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
