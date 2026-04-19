const mongoose = require('mongoose');
const Taxonomy = require('./models/Taxonomy');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Check portal field values
    const counts = await Taxonomy.aggregate([
      { $group: { _id: '$portal', count: { $sum: 1 } } }
    ]);
    
    console.log('Portal field distribution:');
    counts.forEach(c => {
      console.log(`  '${c._id || 'null'}': ${c.count}`);
    });
    
    // Check a sample record
    const sample = await Taxonomy.findOne({}).lean();
    console.log('\nSample record:');
    console.log(JSON.stringify(sample, null, 2));
    
    // Check what the query would return for manager role
    console.log('\nTesting query for manager role:');
    const managerData = await Taxonomy.find({
      $or: [
        { portal: 'all' },
        { portal: 'manager' }
      ]
    }).limit(5).lean();
    
    console.log(`Query returned: ${managerData.length} records`);
    if(managerData.length > 0) {
      console.log('First record portal:', managerData[0].portal);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
