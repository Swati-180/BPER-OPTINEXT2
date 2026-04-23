const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Submission = require('./models/WDTSubmission');
  const numericTowers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '10.7', '11.3'];
  const subs = await Submission.find({ tower: { $in: numericTowers } }).lean();
  console.log('Submissions using numeric towers:', subs.length);
  if (subs.length > 0) {
    console.log('Sample submission towers:', subs.map(s => s.tower).slice(0, 10));
  }
  process.exit(0);
}

check();
