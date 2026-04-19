const mongoose = require('mongoose');
const Taxonomy = require('./models/Taxonomy');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get counts by department
    const depts = await Taxonomy.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 }, towers: { $addToSet: '$majorProcess' } } },
      { $sort: { _id: 1 } }
    ]);
    
    console.log('\n=== Taxonomy Records by Department ===');
    depts.forEach(d => {
      console.log(`${d._id || 'Unspecified'}: ${d.count} records, ${d.towers.length} towers`);
    });
    
    // Get HR data details
    const hrData = await Taxonomy.find({ department: 'HR' }).lean();
    console.log(`\n=== HR Data ===`);
    console.log(`Total records: ${hrData.length}`);
    const hrTowers = [...new Set(hrData.map(x => x.majorProcess))];
    console.log(`Towers: ${hrTowers.slice(0, 5).join(', ')}...`);
    
    // Get FA data details
    const faData = await Taxonomy.find({ department: 'Finance & Accounting' }).lean();
    console.log(`\n=== Finance & Accounting Data ===`);
    console.log(`Total records: ${faData.length}`);
    const faTowers = [...new Set(faData.map(x => x.majorProcess))];
    console.log(`Towers: ${faTowers.slice(0, 5).join(', ')}...`);
    
    // Test API response format
    console.log(`\n=== Sample HR Tower (API format) ===`);
    const hrTowersSample = [...new Set(hrData.map(item => item.majorProcess))].map(tower => ({
      name: tower,
      processCount: hrData.filter(item => item.majorProcess === tower).length
    }));
    console.log(JSON.stringify(hrTowersSample.slice(0, 3), null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
