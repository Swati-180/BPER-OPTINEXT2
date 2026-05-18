require('dotenv').config();
const mongoose = require('mongoose');

async function debug() {
  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI);
    const dbInstance = connection.connection.client.db('BPER');
    const users = await dbInstance.collection('users').find({}).toArray();
    
    console.log(`Total users in BPER: ${users.length}`);
    for (let u of users) {
      console.log(`- ${u.email} | ${u.employeeId} | ${u.name}`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debug();
