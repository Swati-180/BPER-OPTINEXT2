const fetch = require('node-fetch');

const API_BASE = 'http://localhost:5000/api';

// Test token - we'll need to get a valid one from the server
const testToken = 'test-token';

async function testApi() {
  try {
    console.log('Testing Activities API Endpoints...\n');
    
    // First, let's login to get a valid token
    console.log('1. Getting auth token...');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@BPER.com',
        password: 'Admin@123'
      })
    });
    
    const loginData = await loginRes.json();
    if (!loginData.token) {
      console.error('Failed to get token:', loginData);
      process.exit(1);
    }
    
    const token = loginData.token;
    console.log('✓ Got auth token\n');
    
    // Test towers endpoint
    console.log('2. Fetching towers for "All" department...');
    const towersRes = await fetch(`${API_BASE}/activities/towers/All`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const towers = await towersRes.json();
    console.log(`✓ Retrieved ${towers.length} towers`);
    if (towers.length > 0) {
      console.log(`  Sample towers: ${towers.slice(0, 3).map(t => t.name).join(', ')}`);
    }
    
    // Test towers for HR
    console.log('\n3. Fetching towers for "HR" department...');
    const hrTowersRes = await fetch(`${API_BASE}/activities/towers/HR`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const hrTowers = await hrTowersRes.json();
    console.log(`✓ Retrieved ${hrTowers.length} HR towers`);
    if (hrTowers.length > 0) {
      console.log(`  Sample towers: ${hrTowers.slice(0, 3).map(t => t.name).join(', ')}`);
    }
    
    // Test towers for Finance & Accounting
    console.log('\n4. Fetching towers for "Finance & Accounting" department...');
    const faTowersRes = await fetch(`${API_BASE}/activities/towers/Finance%20%26%20Accounting`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const faTowers = await faTowersRes.json();
    console.log(`✓ Retrieved ${faTowers.length} FA towers`);
    if (faTowers.length > 0) {
      console.log(`  Towers: ${faTowers.map(t => t.name).join(', ')}`);
      
      // Test processes for first tower
      if (faTowers.length > 0) {
        const firstTower = faTowers[0].name;
        console.log(`\n5. Fetching processes for tower "${firstTower}"...`);
        const procRes = await fetch(`${API_BASE}/activities/processes/${encodeURIComponent(firstTower)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const processes = await procRes.json();
        console.log(`✓ Retrieved ${processes.length} processes`);
        if (processes.length > 0) {
          console.log(`  Sample processes: ${processes.slice(0, 3).map(p => p.name).join(', ')}`);
          
          // Test activities for first process
          const firstProcess = processes[0].name;
          console.log(`\n6. Fetching activities for process "${firstProcess}"...`);
          const activitiesRes = await fetch(
            `${API_BASE}/activities/list?tower=${encodeURIComponent(firstTower)}&process=${encodeURIComponent(firstProcess)}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          const activities = await activitiesRes.json();
          console.log(`✓ Retrieved ${activities.length} activities`);
          if (activities.length > 0) {
            console.log(`  Sample activities: ${activities.slice(0, 2).map(a => a.name).join(', ')}`);
          }
        }
      }
    }
    
    console.log('\n✓ All API tests passed!');
    process.exit(0);
    
  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
  }
}

testApi();
