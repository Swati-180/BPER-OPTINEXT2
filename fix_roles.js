const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'server', '.env') });

async function fixRoles() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    const User = require('./server/models/User');
    
    const users = await User.find({ role: { $exists: true } });
    let fixedCount = 0;
    
    for (const user of users) {
      if (user.role && user.role !== user.role.toLowerCase()) {
        user.role = user.role.toLowerCase();
        // Skip validation for this fix to avoid enum errors during the fix itself if they are already broken
        await User.updateOne({ _id: user._id }, { $set: { role: user.role } });
        fixedCount++;
      }
    }
    
    console.log(`Successfully fixed ${fixedCount} users.`);
    process.exit(0);
  } catch (err) {
    console.error('Error fixing roles:', err);
    process.exit(1);
  }
}

fixRoles();
