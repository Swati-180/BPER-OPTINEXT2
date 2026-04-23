const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'server', '.env') });

async function repairSubmissions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    const WDTSubmission = require('./server/models/WDTSubmission');
    const User = require('./server/models/User');
    
    const subs = await WDTSubmission.find({});
    console.log(`Analyzing ${subs.length} submissions for ID mismatches...`);
    
    let emailFixed = 0;
    let idFixed = 0;
    
    for (const sub of subs) {
      if (!sub.employee || !sub.employee.email) continue;
      
      const lowerEmail = sub.employee.email.toLowerCase();
      let changed = false;
      
      if (sub.employee.email !== lowerEmail) {
        sub.employee.email = lowerEmail;
        changed = true;
        emailFixed++;
      }
      
      // Find the user with this email to get their current canonical ID
      const user = await User.findOne({ email: lowerEmail });
      if (user && user.employeeId && sub.employee.employeeId !== user.employeeId) {
        console.log(`Fixing ID for ${lowerEmail}: ${sub.employee.employeeId} -> ${user.employeeId}`);
        sub.employee.employeeId = user.employeeId;
        changed = true;
        idFixed++;
      }
      
      if (changed) {
        await sub.save();
      }
    }
    
    console.log(`Repaired ${emailFixed} emails and ${idFixed} employee IDs.`);
    process.exit(0);
  } catch (err) {
    console.error('Error repairing submissions:', err);
    process.exit(1);
  }
}

repairSubmissions();
