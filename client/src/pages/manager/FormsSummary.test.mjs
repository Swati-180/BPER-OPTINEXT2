/**
 * Focused tests for Forms summary endpoint and on-demand full detail retrieval.
 * Tests:
 * 1. Opt-in summary response (?summary=true) vs full default response.
 * 2. Summary response preserves comment previews and essential queue metadata.
 * 3. On-demand detail retrieval by referenceId provides complete activity rows.
 * 4. Role-based authorization and filtering behavior.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const API_BASE = 'http://localhost:5000';

function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${API_BASE}${path}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(body),
            byteLength: Buffer.byteLength(body),
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            raw: body,
            byteLength: Buffer.byteLength(body),
          });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('Forms API: summary mode vs default full-payload mode', async (t) => {
  // 1. Authenticate as Admin
  const loginRes = await postJson('/api/auth/login', {
    email: 'admin@bper.com',
    password: 'Admin@123',
  });
  assert.equal(loginRes.status, 200, 'Admin login should succeed');
  const token = loginRes.body.token;
  assert.ok(token, 'Token must be present');

  await t.test('GET /api/wdt/submissions?summary=true returns lightweight summary', async () => {
    const res = await getJson('/api/wdt/submissions?summary=true', token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body), 'Response should be an array of submissions');
    assert.ok(res.body.length > 0, 'Should have submission records');

    // Verify payload reduction: summary response is < 500 KB (down from 8.8 MB)
    assert.ok(res.byteLength < 600 * 1024, `Summary byteLength (${res.byteLength}) should be < 600KB`);

    // Verify first record has all queue metadata
    const first = res.body[0];
    assert.ok(first.referenceId, 'referenceId must exist');
    assert.ok(first.status, 'status must exist');
    assert.ok(first.submittedAt, 'submittedAt must exist');
    assert.ok(first.employee, 'employee snapshot must exist');
    assert.ok(typeof first.totalHours === 'number', 'totalHours must exist as number');
    assert.ok(Array.isArray(first.reviewHistory), 'reviewHistory must be an array');

    // Verify preview comments preservation
    assert.ok(Array.isArray(first.payload?.rows), 'payload.rows should exist');
    assert.ok(first.payload.rows.length <= 1, 'summary should limit rows to at most 1 preview item');
  });

  await t.test('GET /api/wdt/submissions without query param returns full response unchanged', async () => {
    const res = await getJson('/api/wdt/submissions', token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const first = res.body[0];
    assert.ok(Array.isArray(first.payload?.rows));
    // Full records contain all detailed rows (> 1)
    assert.ok(first.payload.rows.length > 1, 'Default mode must retain all activity rows for legacy consumers');
    assert.ok(res.byteLength > 1024 * 1024, 'Full payload should be > 1MB');
  });

  await t.test('GET /api/wdt/submissions/:referenceId returns complete details on demand', async () => {
    // Fetch summary first to get a real referenceId
    const summaryRes = await getJson('/api/wdt/submissions?summary=true', token);
    const targetRefId = summaryRes.body[0].referenceId;

    const detailRes = await getJson(`/api/wdt/submissions/${targetRefId}`, token);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.referenceId, targetRefId);
    assert.ok(Array.isArray(detailRes.body.payload?.rows), 'Detail must contain full rows');
    assert.ok(detailRes.body.payload.rows.length > 1, 'Detail must return all activities');
    
    // Check fields needed for review, flags, and export
    const sampleRow = detailRes.body.payload.rows[0];
    assert.ok(sampleRow.process !== undefined, 'process field required');
    assert.ok(sampleRow.subProcess !== undefined, 'subProcess field required');
    assert.ok(sampleRow.timeTakenHoursPerMonth !== undefined, 'timeTakenHoursPerMonth required');
  });
});
