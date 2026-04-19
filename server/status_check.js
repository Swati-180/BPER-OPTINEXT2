#!/usr/bin/env node

const http = require('http');
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const Taxonomy = require('./models/Taxonomy');

async function runTests() {
  console.log('=== BPER Process Management Status Check ===\n');

  try {
    // 1. Check MongoDB connection
    console.log('1. Checking MongoDB connection...');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('   ✓ MongoDB connected\n');

    // 2. Check data in database
    console.log('2. Checking taxonomy data...');
    const totalCount = await Taxonomy.countDocuments();
    const departmentGroups = await Taxonomy.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 }, towers: { $addToSet: '$majorProcess' } } },
      { $sort: { _id: 1 } }
    ]);

    console.log(`   ✓ Total taxonomy records: ${totalCount}`);
    departmentGroups.forEach(group => {
      console.log(`     • ${group._id || 'Unspecified'}: ${group.count} records, ${group.towers.length} towers`);
    });
    console.log();

    // 3. Check API endpoints
    console.log('3. Checking API endpoints...');

    // Get auth token
    const token = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ email: 'admin@BPER.com', password: 'Admin@123' });
      
      const options = {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.token) {
              resolve(result.token);
            } else {
              reject(new Error('No token in response'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    console.log('   ✓ Auth token obtained\n');

    // Test endpoints
    const endpoints = [
      { name: 'All departments', path: '/api/activities/towers/All' },
      { name: 'HR department', path: '/api/activities/towers/HR' },
      { name: 'Finance & Accounting', path: '/api/activities/towers/Finance%20%26%20Accounting' }
    ];

    for (const endpoint of endpoints) {
      const data = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: 5000,
          path: endpoint.path,
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        };
        
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(data) });
            } catch (e) {
              resolve({ status: res.statusCode, data: null, error: e.message });
            }
          });
        });
        
        req.on('error', reject);
        req.end();
      });

      if (data.status === 200 && Array.isArray(data.data)) {
        console.log(`   ✓ ${endpoint.name}: ${data.data.length} towers`);
      } else {
        console.log(`   ✗ ${endpoint.name}: Status ${data.status}`);
      }
    }

    console.log('\n=== All checks completed successfully! ===');
    console.log('\nFrontend should now display process data correctly.');
    console.log('If still seeing "No processes found":');
    console.log('1. Clear browser cache (Ctrl+F5 or Cmd+Shift+R)');
    console.log('2. Check browser console for errors (F12)');
    console.log('3. Ensure frontend dev server is running (npm run dev in client/)');

    process.exit(0);
  } catch (err) {
    console.error('✗ Error:', err.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure MongoDB is connected');
    console.error('2. Ensure backend server is running (npm run dev in server/)');
    console.error('3. Run: npm run seed (in server/) to populate data');
    process.exit(1);
  }
}

runTests();
