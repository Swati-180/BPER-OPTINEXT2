const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'server', '.env') });

async function fixSubmissions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    const WDTSubmission = require('./server/models/WDTSubmission');
    const User = require('./server/models/User');
    
    const subs = await WDTSubmission.find({});
    console.log(`Checking ${subs.length} submissions...`);
    
    let modifiedCount = 0;
    for (const sub of subs) {
      if (sub.employee && sub.employee.email) {
        const lowerEmail = sub.employee.email.toLowerCase();
        if (sub.employee.email !== lowerEmail) {
          sub.employee.email = lowerEmail;
          await sub.save();
          modifiedCount++;
        }
      }
    }
    
    console.log(`Successfully fixed ${modifiedCount} submissions to lowercase emails.`);
    process.exit(0);
  } catch (err) {
    console.error('Error fixing submissions:', err);
    process.exit(1);
  }
}

fixSubmissions();
