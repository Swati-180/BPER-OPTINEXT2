const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/User');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({});
  let i = 0;
  for (const user of users) {
    user.client = undefined; // clear client
    
    // Assign either HR or F&A if not already HR/F&A
    const org = user.organization?.trim();
    if (org !== 'HR' && org !== 'F&A') {
      user.organization = (i % 2 === 0) ? 'F&A' : 'HR';
      i++;
    }
    await user.save();
  }
  console.log('Updated users');
  process.exit(0);
}
run().catch(console.error);
