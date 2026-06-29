const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function createManager() {
  await mongoose.connect(process.env.MONGODB_URI);
  const existing = await User.findOne({ email: 'manager@bper.com' });
  if (!existing) {
    await User.create({
      name: 'QG Manager',
      email: 'manager@bper.com',
      password: 'Manager@123',
      role: 'manager',
      employeeId: 'BPER-999',
      designation: 'Manager',
      organization: 'BPER',
      isActive: true
    });
    console.log('Manager created');
  } else {
    console.log('Manager exists');
  }
  process.exit(0);
}

createManager();
