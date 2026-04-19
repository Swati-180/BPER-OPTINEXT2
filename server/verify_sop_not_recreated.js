const http = require('http');
const mongoose = require('mongoose');
const ProcessAnalysis = require('./models/ProcessAnalysis');
require('dotenv').config();

function postLogin() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.token);
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on('error', reject);
    req.write(JSON.stringify({ email: 'admin@BPER.com', password: 'Admin@123' }));
    req.end();
  });
}

function callSixBySix(token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/analysis/six-by-six?department=All%20Departments',
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(res.statusCode));
      }
    );

    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const token = await postLogin();
    const status = await callSixBySix(token);

    const sopRegex = /^Standard Operating Procedure\s+\d+$/i;
    const sopCount = await ProcessAnalysis.countDocuments({
      process: { $regex: sopRegex }
    });

    console.log('SOP recreation verification:');
    console.log(`  six-by-six API status: ${status}`);
    console.log(`  SOP rows currently in DB: ${sopCount}`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
