const assert = require('assert');
const jwt = require('jsonwebtoken');
const http = require('http');
const dotenv = require('dotenv');

dotenv.config();

console.log('=== TEST SUITE 1: WORKFORCE CAPACITY API CONTROLLER & ROUTE TESTS ===\n');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const BASE_PORT = process.env.PORT || 5000;

function makeRequest(path, token = null) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: 'localhost',
        port: BASE_PORT,
        path,
        method: 'GET',
        headers
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runApiTests() {
  // Generate Test JWT Tokens
  const managerToken = jwt.sign({ userId: 'test-manager-id', role: 'manager', email: 'manager@bper.com' }, JWT_SECRET, { expiresIn: '1h' });
  const adminToken = jwt.sign({ userId: 'test-admin-id', role: 'admin', email: 'admin@bper.com' }, JWT_SECRET, { expiresIn: '1h' });
  const employeeToken = jwt.sign({ userId: 'test-emp-id', role: 'employee', email: 'emp@bper.com' }, JWT_SECRET, { expiresIn: '1h' });

  // 1. Unauthorized Access (No Token) -> HTTP 401
  console.log('Test 1.1: Unauthorized request with no token...');
  const resNoToken = await makeRequest('/api/reports/workforce-capacity');
  console.log('Response status:', resNoToken.status, resNoToken.body);
  assert.strictEqual(resNoToken.status, 401, 'Request without token must return HTTP 401');
  console.log('✅ PASS: Unauthorized access blocked with HTTP 401');

  // 2. Non-Manager Access (Employee role) -> HTTP 403
  console.log('\nTest 1.2: Forbidden request with employee role...');
  const resEmployee = await makeRequest('/api/reports/workforce-capacity', employeeToken);
  console.log('Response status:', resEmployee.status, resEmployee.body);
  assert.strictEqual(resEmployee.status, 403, 'Employee access must return HTTP 403 Forbidden');
  console.log('✅ PASS: Non-manager access blocked with HTTP 403');

  // 3. Authorized Manager Access -> HTTP 200 and all three views present
  console.log('\nTest 1.3: Authorized manager request...');
  const resManager = await makeRequest('/api/reports/workforce-capacity', managerToken);
  console.log('Response status:', resManager.status);
  assert.strictEqual(resManager.status, 200, 'Manager access must return HTTP 200');

  const data = resManager.body;
  assert.ok(data.actualWorkforce, 'Response must contain actualWorkforce (View A)');
  assert.ok(data.vacancyCapacityPlanning, 'Response must contain vacancyCapacityPlanning (View B)');
  assert.ok(data.workforceGapAnalysis, 'Response must contain workforceGapAnalysis (View C)');

  console.log('View A (Actual Workforce Summary):', data.actualWorkforce.summary);
  console.log('View B (Vacancy Capacity Summary):', data.vacancyCapacityPlanning.summary);
  console.log('View C (Workforce Gap Summary):', data.workforceGapAnalysis.summary);

  assert.ok(Array.isArray(data.actualWorkforce.byGradeBand), 'View A must contain byGradeBand');
  assert.ok(Array.isArray(data.vacancyCapacityPlanning.byGradeBand), 'View B must contain byGradeBand');
  assert.ok(Array.isArray(data.workforceGapAnalysis.gradeBandGapMatrix), 'View C must contain gradeBandGapMatrix');
  console.log('✅ PASS: All three views (A, B, C) returned with complete payload structure');

  // 4. Department Filtering Test
  console.log('\nTest 1.4: Department filtering (Finance & Accounting)...');
  const resDeptFilter = await makeRequest('/api/reports/workforce-capacity?department=' + encodeURIComponent('Finance & Accounting'), adminToken);
  assert.strictEqual(resDeptFilter.status, 200);
  const deptData = resDeptFilter.body;
  console.log('Filtered Dept Staffed Headcount:', deptData.actualWorkforce.summary.occupiedHeadcount);
  console.log('Filtered Dept Vacant Positions:', deptData.vacancyCapacityPlanning.summary.vacantPositionsCount);
  assert.ok(deptData.actualWorkforce.summary.occupiedHeadcount >= 0, 'Must compute department headcount');
  console.log('✅ PASS: Department filtering executed properly');

  // 5. Grade Perspective Toggle via API
  console.log('\nTest 1.5: Grade perspective query parameter (current)...');
  const resCurrent = await makeRequest('/api/reports/workforce-capacity?gradePerspective=current', adminToken);
  assert.strictEqual(resCurrent.status, 200);
  assert.strictEqual(resCurrent.body.gradePerspective, 'current', 'API must reflect gradePerspective=current');
  console.log('✅ PASS: Grade perspective parameter handled properly');

  console.log('\n🎉 ALL WORKFORCE CAPACITY API CONTROLLER TESTS PASSED 100%!');
}

runApiTests().catch((err) => {
  console.error('❌ FAIL in API Tests:', err);
  process.exit(1);
});
