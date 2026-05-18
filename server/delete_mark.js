require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function deleteMarkFinch() {
  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI);
    
    const result = await User.deleteOne({ email: 'mark@employee.com' });
    console.log(`Deleted ${result.deletedCount} user(s).`);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

deleteMarkFinch();
