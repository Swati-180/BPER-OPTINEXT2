const dotenv = require('dotenv');
const mongoose = require('mongoose');
const WDTSubmission = require('./models/WDTSubmission');

dotenv.config({ path: './server/.env' });

action().catch((err) => {
  console.error('Report verification failed:', err.message);
  process.exit(1);
});

async function action() {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000';
  const managerEmail = process.env.VERIFY_MANAGER_EMAIL || 'admin@bper.com';
  const managerPassword = process.env.VERIFY_MANAGER_PASSWORD || 'Admin@123';
  const employeeEmail = process.env.VERIFY_EMPLOYEE_EMAIL || 'employee@bper.com';
  const employeePassword = process.env.VERIFY_EMPLOYEE_PASSWORD || 'Employee@123';

  console.log('Starting report route verification...');

  const managerToken = await login(baseUrl, managerEmail, managerPassword);
  const employeeToken = await login(baseUrl, employeeEmail, employeePassword);

  const mongoUri = process.env.MONGODB_URI;
  let expectedSubmissionCount = null;

  if (mongoUri) {
    await mongoose.connect(mongoUri);
    expectedSubmissionCount = await WDTSubmission.countDocuments({});
  } else {
    console.warn('MONGODB_URI not set. Skipping direct DB parity check.');
  }
  const dashboardRes = await fetch(`${baseUrl}/api/reports/dashboard`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  const dashboardData = await dashboardRes.json();

  if (!dashboardRes.ok) {
    throw new Error(`Manager dashboard report failed: ${dashboardData?.message || dashboardRes.status}`);
  }

  const apiSubmissionCount = Number(dashboardData?.summary?.totalSubmissions || 0);

  const utilRes = await fetch(`${baseUrl}/api/reports/utilization`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  const utilData = await utilRes.json();

  if (!utilRes.ok) {
    throw new Error(`Manager utilization report failed: ${utilData?.message || utilRes.status}`);
  }

  const matchesCount = expectedSubmissionCount === null
    ? Number(utilData?.summary?.totalSubmissions || 0) === apiSubmissionCount
    : expectedSubmissionCount === apiSubmissionCount;

  const employeeForbiddenRes = await fetch(`${baseUrl}/api/reports/dashboard`, {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });

  const employeeForbidden = employeeForbiddenRes.status === 403;

  console.log('--- Report Verification Summary ---');
  console.log(`Manager /api/reports/dashboard: PASS (${dashboardRes.status})`);
  console.log(`Manager /api/reports/utilization: PASS (${utilRes.status})`);
  console.log(`Employee blocked from /api/reports/dashboard: ${employeeForbidden ? 'PASS' : 'FAIL'} (${employeeForbiddenRes.status})`);
  if (expectedSubmissionCount === null) {
    console.log(`Dashboard totalSubmissions matches utilization summary: ${matchesCount ? 'PASS' : 'FAIL'} (dashboard=${apiSubmissionCount}, utilization=${Number(utilData?.summary?.totalSubmissions || 0)})`);
  } else {
    console.log(`Dashboard totalSubmissions matches DB count: ${matchesCount ? 'PASS' : 'FAIL'} (api=${apiSubmissionCount}, db=${expectedSubmissionCount})`);
  }

  if (!employeeForbidden || !matchesCount) {
    throw new Error('One or more report checks failed.');
  }

  console.log('All report checks passed.');
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

async function login(baseUrl, email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok || !data?.token) {
    throw new Error(`Login failed for ${email}: ${data?.message || res.status}`);
  }

  return data.token;
}
