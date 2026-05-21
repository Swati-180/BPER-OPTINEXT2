const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/User');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({});
  for (const user of users) {
    const currentOrg = user.organization?.trim();
    if (currentOrg === 'F&A' || currentOrg === 'HR') {
      user.department = currentOrg;
    } else {
      user.department = user.department || 'F&A'; 
    }
    
    user.organization = 'QGGlobal';
    user.client = 'US-Client';
    
    await user.save();
  }
  console.log('Migrated user organization/client/department fields.');
  process.exit(0);
}

run().catch(console.error);
