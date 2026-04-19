#!/usr/bin/env node
/**
 * Quick verification script for BPER Process Management
 * Run this to quickly check if all systems are ready for frontend data fetching
 */

const http = require('http');

console.log('🔍 BPER Process Management - Quick Verification\n');

let allTests = true;

async function makeRequest(path, token) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), count: JSON.parse(data)?.length || 0 });
        } catch(e) {
          resolve({ status: res.statusCode, data: null, count: 0 });
        }
      });
    });
    
    req.on('error', (e) => {
      resolve({ status: 0, error: e.message });
    });
    req.end();
  });
}

(async () => {
  try {
    // Test server connectivity
    console.log('1️⃣  Checking backend server...');
    const loginRes = await makeRequest('/api/auth/login', 'dummy');
    if (loginRes.status === 401) {  // 401 is expected since we didn't send real credentials
      console.log('   ✅ Backend server responding\n');
    } else {
      console.log('   ❌ Backend server not responding\n');
      allTests = false;
    }

    // Get real token
    const token = await new Promise((resolve) => {
      const postData = JSON.stringify({ email: 'admin@BPER.com', password: 'Admin@123' });
      const options = {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data).token || null);
          } catch(e) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.write(postData);
      req.end();
    });

    if (!token) {
      console.log('❌ Could not obtain auth token');
      process.exit(1);
    }

    // Test endpoints
    console.log('2️⃣  Checking data availability...\n');
    
    const tests = [
      { name: 'All Departments', path: '/api/activities/towers/All' },
      { name: 'HR', path: '/api/activities/towers/HR' },
      { name: 'Finance & Accounting', path: '/api/activities/towers/Finance%20%26%20Accounting' }
    ];

    for (const test of tests) {
      const result = await makeRequest(test.path, token);
      if (result.status === 200) {
        console.log(`   ✅ ${test.name}: ${result.count} towers available`);
      } else {
        console.log(`   ❌ ${test.name}: API error (${result.status})`);
        allTests = false;
      }
    }

    console.log();
    if (allTests) {
      console.log('🎉 All systems ready! Frontend should display data correctly.\n');
      console.log('📋 Instructions if frontend still shows "No processes found":');
      console.log('   1. Restart frontend: npm run dev (in client/)');
      console.log('   2. Clear cache: Ctrl+F5 or Cmd+Shift+R');
      console.log('   3. Check console: Press F12 and look for errors');
      console.log('   4. Debug page: Visit http://localhost:3000/manager/api-debug\n');
    } else {
      console.log('⚠️  Some tests failed. Check the errors above.\n');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
