const mongoose = require('mongoose');
const Taxonomy = require('./models/Taxonomy');
const { buildTaxonomyFromHRActivities } = require('./utils/mockProcessData');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    // Test the updated HR builder
    console.log('Testing updated HR activities builder...\n');
    const hrRecords = buildTaxonomyFromHRActivities();
    
    console.log(`Generated ${hrRecords.length} HR records (should not include numerical processes 1-12)\n`);
    
    // Check if any numerical processes are in the generated records
    const numericalIds = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    const hasNumerical = hrRecords.some(rec => 
      numericalIds.includes(rec.majorProcess) || numericalIds.includes(rec.process)
    );
    
    if (hasNumerical) {
      console.log('⚠️  WARNING: Numerical processes still found in generated data!');
    } else {
      console.log('✓ No numerical processes in generated HR data\n');
    }
    
    // Sample of generated towers
    const towers = [...new Set(hrRecords.map(r => r.majorProcess))];
    console.log(`Towers: ${towers.slice(0, 8).join(', ')}${towers.length > 8 ? '...' : ''}`);
    console.log(`Total unique towers: ${towers.length}\n`);
    
    // Current database state
    const dbCount = await Taxonomy.countDocuments();
    console.log(`Current database records: ${dbCount}`);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
