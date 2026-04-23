const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'server', '.env') });

async function fixHours() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    const User = require('./server/models/User');
    
    const result = await User.updateMany(
      { $or: [{ maxMonthlyHours: { $exists: false } }, { maxMonthlyHours: { $ne: 160 } }] },
      { $set: { maxMonthlyHours: 160 } }
    );
    
    console.log(`Successfully fixed ${result.modifiedCount} users to 160h.`);
    process.exit(0);
  } catch (err) {
    console.error('Error fixing hours:', err);
    process.exit(1);
  }
}

fixHours();
