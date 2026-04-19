const mongoose = require('mongoose');
const Taxonomy = require('./models/Taxonomy');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    // Find all numerical tower/process names
    console.log('=== Records to be removed ===\n');
    
    const numericalRecords = await Taxonomy.find({
      $or: [
        { majorProcess: { $in: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] } },
        { process: { $in: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] } }
      ]
    }).lean();
    
    console.log(`Found ${numericalRecords.length} records with numerical processes\n`);
    
    // Group by department
    const byDept = {};
    numericalRecords.forEach(rec => {
      if (!byDept[rec.department]) byDept[rec.department] = [];
      byDept[rec.department].push({ tower: rec.majorProcess, process: rec.process });
    });
    
    Object.keys(byDept).forEach(dept => {
      console.log(`${dept || 'Unspecified'}:`);
      byDept[dept].forEach(item => {
        console.log(`  - Tower: "${item.tower}", Process: "${item.process}"`);
      });
      console.log();
    });
    
    // Show what will remain
    console.log('=== Records that will remain ===\n');
    
    const remainingRecords = await Taxonomy.find({
      $nor: [
        { majorProcess: { $in: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] } },
        { process: { $in: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] } }
      ]
    }).lean();
    
    const remainByDept = {};
    remainingRecords.forEach(rec => {
      if (!remainByDept[rec.department]) {
        remainByDept[rec.department] = { towers: new Set(), count: 0 };
      }
      remainByDept[rec.department].towers.add(rec.majorProcess);
      remainByDept[rec.department].count++;
    });
    
    Object.keys(remainByDept).forEach(dept => {
      console.log(`${dept || 'Unspecified'}: ${remainByDept[dept].count} records`);
      console.log(`  Towers: ${Array.from(remainByDept[dept].towers).slice(0, 5).join(', ')}${remainByDept[dept].towers.size > 5 ? '...' : ''}`);
      console.log();
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
