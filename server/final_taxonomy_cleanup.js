const mongoose = require('mongoose');
const Taxonomy = require('./models/Taxonomy');
require('dotenv').config();

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all numeric-like records
    // We target records where majorProcess or process is just a number or decimal
    const numericRegex = /^[0-9.]+$/;
    
    const records = await Taxonomy.find({
      $or: [
        { majorProcess: numericRegex },
        { process: numericRegex }
      ]
    }).lean();

    console.log(`Found ${records.length} numeric records to remove.`);
    
    if (records.length > 0) {
      const result = await Taxonomy.deleteMany({
        _id: { $in: records.map(r => r._id) }
      });
      console.log(`Successfully deleted ${result.deletedCount} records.`);
    }

    console.log('Cleanup finished.');
    process.exit(0);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

cleanup();
