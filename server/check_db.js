const mongoose = require('mongoose');
const User = require('./models/User');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({});
  console.log('Total users in DB:', users.length);
  users.forEach(u => {
    console.log(`- ${u.email} (${u.role})`);
  });
  process.exit(0);
}
check();
