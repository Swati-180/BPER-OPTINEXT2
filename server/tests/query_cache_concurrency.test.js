const assert = require('assert');
const path = require('path');
const ts = require('typescript');
const fs = require('fs');

// Minimal DOM/window mock to allow importing production code
let listeners = {};
global.window = {
  addEventListener: (e, h) => { listeners[e] = listeners[e] || []; listeners[e].push(h); },
  dispatchEvent: (e) => { (listeners[e.type] || []).forEach(fn => fn(e)); },
  localStorage: {
    store: {},
    getItem(k) { return this.store[k] || null; },
    setItem(k, v) { this.store[k] = String(v); },
    removeItem(k) { delete this.store[k]; },
    clear() { this.store = {}; }
  }
};
global.CustomEvent = class CustomEvent { constructor(t, p = {}) { this.type = t; this.detail = p.detail; } };

// Compile production client/src/lib/queryCache.ts directly
const queryCacheSource = fs.readFileSync(path.join(__dirname, '../../client/src/lib/queryCache.ts'), 'utf8');
const compiledQueryCache = ts.transpileModule(queryCacheSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;

let mockUser = { email: 'admin@bper.com', role: 'admin' };
const authStorageMock = { loadAuthUser: () => mockUser };
const moduleObj = { exports: {} };
new Function('require', 'module', 'exports', compiledQueryCache)(
  (mod) => mod === './authStorage' ? authStorageMock : require(mod),
  moduleObj,
  moduleObj.exports
);

const { QueryCacheManager, queryCache } = moduleObj.exports;

async function runAll12Scenarios() {
  console.log('=== RUNNING COMPREHENSIVE 12-SCENARIO AUDIT SUITE ===\n');

  // Scenario 1: Normal cache hits and TTL expiration
  console.log('Scenario 1: Normal cache hits and TTL expiration...');
  const qc1 = new QueryCacheManager();
  qc1.set('/api/reports/ttl', { val: 1 }, 20); // 20ms TTL
  assert.strictEqual(qc1.get('/api/reports/ttl')?.val, 1, 'Cache hit before TTL');
  await new Promise(r => setTimeout(r, 30));
  assert.strictEqual(qc1.get('/api/reports/ttl'), null, 'Expired after TTL');
  console.log('✅ PASSED');

  // Scenario 2: Concurrent requests for the same endpoint
  console.log('Scenario 2: Concurrent requests deduplication...');
  const qc2 = new QueryCacheManager();
  let calls2 = 0;
  const p1 = qc2.fetchWithCache('/api/reports/concurrent', async () => {
    calls2++;
    await new Promise(r => setTimeout(r, 15));
    return { data: 'shared' };
  });
  const p2 = qc2.fetchWithCache('/api/reports/concurrent', async () => {
    calls2++;
    return { data: 'shared' };
  });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.strictEqual(calls2, 1, 'Only 1 network fetch executed for identical concurrent calls');
  assert.deepStrictEqual(r1, r2);
  console.log('✅ PASSED');

  // Scenario 3: Request A starts → matching invalidation → request B starts before A resolves
  console.log('Scenario 3: Request A invalidated; Request B must start a fresh request...');
  const qc3 = new QueryCacheManager();
  let resolveA;
  let callsA = 0;
  const pA = qc3.fetchWithCache('/api/reports/dashboard', () => {
    callsA++;
    return new Promise(r => resolveA = r);
  });

  // Invalidation occurs while A is in flight
  qc3.invalidateMatching(/.*\/reports\/.*/);

  // Request B starts before A resolves
  let callsB = 0;
  const pB = qc3.fetchWithCache('/api/reports/dashboard', () => {
    callsB++;
    return Promise.resolve({ version: 'B-fresh' });
  });

  assert.strictEqual(callsB, 1, 'Request B made a new network call instead of joining invalidated A');
  resolveA({ version: 'A-stale' });
  const [resA, resB] = await Promise.all([pA, pB]);
  assert.strictEqual(resA.version, 'A-stale');
  assert.strictEqual(resB.version, 'B-fresh');
  assert.strictEqual(qc3.get('/api/reports/dashboard')?.version, 'B-fresh', 'Cache populated with fresh B');
  console.log('✅ PASSED');

  // Scenario 4: Request A resolves after invalidation (cannot populate cache)
  console.log('Scenario 4: Request A resolving after invalidation cannot overwrite cache...');
  const qc4 = new QueryCacheManager();
  let resolveA4;
  const pA4 = qc4.fetchWithCache('/api/reports/alone', () => new Promise(r => resolveA4 = r));
  qc4.invalidateMatching('/reports/alone');
  resolveA4({ version: 'stale' });
  await pA4;
  assert.strictEqual(qc4.get('/api/reports/alone'), null, 'Stale response must not populate cache');
  console.log('✅ PASSED');

  // Scenario 5: Unrelated in-flight requests remain unaffected by targeted invalidation
  console.log('Scenario 5: Unrelated in-flight requests remain unaffected...');
  const qc5 = new QueryCacheManager();
  let resolveTaxonomy;
  const pTax = qc5.fetchWithCache('/api/config/taxonomy', () => new Promise(r => resolveTaxonomy = r));
  // Invalidate reports
  qc5.invalidateMatching(/.*\/reports\/.*/);
  resolveTaxonomy({ taxonomy: 'active' });
  await pTax;
  assert.strictEqual(qc5.get('/api/config/taxonomy')?.taxonomy, 'active', 'Taxonomy successfully caches');
  console.log('✅ PASSED');

  // Scenario 6: Repeated and overlapping string/regex invalidations
  console.log('Scenario 6: Repeated and overlapping string/regex invalidations...');
  const qc6 = new QueryCacheManager();
  let resolveMulti;
  const pMulti = qc6.fetchWithCache('/api/reports/multi', () => new Promise(r => resolveMulti = r));
  qc6.invalidateMatching(/.*\/reports\/.*/);
  qc6.invalidateMatching('/reports/multi');
  qc6.invalidateMatching(/.*\/reports\/.*/);
  resolveMulti({ stale: true });
  await pMulti;
  assert.strictEqual(qc6.get('/api/reports/multi'), null, 'Repeated invalidations prevent caching');
  console.log('✅ PASSED');

  // Scenario 7: clearAll() during in-flight request, followed by new request
  console.log('Scenario 7: clearAll() during in-flight request...');
  const qc7 = new QueryCacheManager();
  let resolveOld;
  const pOld = qc7.fetchWithCache('/api/reports/clear-test', () => new Promise(r => resolveOld = r));
  qc7.clearAll();
  let callsNew = 0;
  const pNew = qc7.fetchWithCache('/api/reports/clear-test', () => {
    callsNew++;
    return Promise.resolve({ fresh: 'after-clear' });
  });
  resolveOld({ stale: 'before-clear' });
  const [oldRes, newRes] = await Promise.all([pOld, pNew]);
  assert.strictEqual(callsNew, 1);
  assert.strictEqual(newRes.fresh, 'after-clear');
  assert.strictEqual(qc7.get('/api/reports/clear-test')?.fresh, 'after-clear');
  console.log('✅ PASSED');

  // Scenario 8: Old request completion must not delete a newer in-flight request
  console.log('Scenario 8: Identity-safe in-flight cleanup...');
  const qc8 = new QueryCacheManager();
  let resolveOld8, resolveNew8;
  const pOld8 = qc8.fetchWithCache('/api/reports/ident', () => new Promise(r => resolveOld8 = r));
  qc8.invalidateMatching('/reports/ident');
  // New request starts and registers in inFlight
  let newCalls8 = 0;
  const pNew8 = qc8.fetchWithCache('/api/reports/ident', () => {
    newCalls8++;
    return new Promise(r => resolveNew8 = r);
  });
  // Old request finishes first
  resolveOld8({ old: true });
  await pOld8;
  // Verify inFlight still tracks pNew8 (pOld8 finally block didn't delete it)
  let joinedCalls = 0;
  const pJoin8 = qc8.fetchWithCache('/api/reports/ident', () => {
    joinedCalls++;
    return Promise.resolve({ join: true });
  });
  assert.strictEqual(joinedCalls, 0, 'Caller joined newer in-flight request; inFlight was not prematurely deleted');
  resolveNew8({ new: true });
  await Promise.all([pNew8, pJoin8]);
  console.log('✅ PASSED');

  // Scenario 9: Logout and account switching
  console.log('Scenario 9: Logout and account switching...');
  const qc9 = new QueryCacheManager();
  mockUser = { email: 'admin@bper.com', role: 'admin' };
  qc9.set('/api/reports/role', { user: 'admin' });
  assert.strictEqual(qc9.get('/api/reports/role')?.user, 'admin');

  mockUser = { email: 'manager@bper.com', role: 'manager' };
  assert.strictEqual(qc9.get('/api/reports/role'), null, 'Manager cannot see admin data');

  mockUser = { email: 'admin@bper.com', role: 'admin' };
  qc9.clearAll();
  assert.strictEqual(qc9.get('/api/reports/role'), null, 'clearAll purges data on logout');
  console.log('✅ PASSED');

  // Scenario 10: Failed requests and retry behavior
  console.log('Scenario 10: Failed requests not cached and retry works...');
  const qc10 = new QueryCacheManager();
  try {
    await qc10.fetchWithCache('/api/reports/fail', () => Promise.reject(new Error('Network drop')));
    assert.fail('Should reject');
  } catch (e) {
    assert.strictEqual(e.message, 'Network drop');
  }
  assert.strictEqual(qc10.get('/api/reports/fail'), null, 'Error not cached');
  // Retry works
  const retryRes = await qc10.fetchWithCache('/api/reports/fail', () => Promise.resolve({ retry: 'ok' }));
  assert.strictEqual(retryRes.retry, 'ok');
  assert.strictEqual(qc10.get('/api/reports/fail')?.retry, 'ok', 'Retry cached successfully');
  console.log('✅ PASSED');

  // Scenario 11: Invalidation-rule memory growth
  console.log('Scenario 11: Invalidation-rule memory growth deduplication...');
  const qc11 = new QueryCacheManager();
  for (let i = 0; i < 100; i++) {
    qc11.invalidateMatching(/.*\/reports\/.*/);
    qc11.invalidateMatching('/reports/fte');
  }
  // @ts-ignore
  assert.strictEqual(qc11.invalidations.length, 2, 'Invalidation rules deduplicated by pattern; bounded to 2');
  console.log('✅ PASSED');

  // Scenario 12: Regex matching with global/sticky flags
  console.log('Scenario 12: Deterministic regex matching with global/sticky flags...');
  const qc12 = new QueryCacheManager();
  const globalRegex = /.*\/reports\/.*/g;
  const stickyRegex = /.*\/reports\/.*/y;
  assert.strictEqual(qc12.matchesPattern('/api/reports/1', globalRegex), true);
  assert.strictEqual(qc12.matchesPattern('/api/reports/1', globalRegex), true, 'Stateful global flag did not break 2nd test');
  assert.strictEqual(qc12.matchesPattern('/api/reports/2', stickyRegex), true);
  assert.strictEqual(qc12.matchesPattern('/api/reports/2', stickyRegex), true, 'Stateful sticky flag did not break 2nd test');
  console.log('✅ PASSED');

  // Scenario 13: Real window mutation events
  console.log('Scenario 13: Real window mutation events (bper:data-updated, bper:assumptions-updated, bper:auth-cleared)...');
  const globalQc = queryCache;
  mockUser = { email: 'admin@bper.com', role: 'admin' };
  globalQc.set('/api/reports/ev1', { a: 1 });
  globalQc.set('/api/config/ev2', { b: 2 });
  window.dispatchEvent(new CustomEvent('bper:data-updated'));
  assert.strictEqual(globalQc.get('/api/reports/ev1'), null, 'data-updated cleared reports');
  assert.strictEqual(globalQc.get('/api/config/ev2')?.b, 2, 'data-updated kept config');
  window.dispatchEvent(new CustomEvent('bper:assumptions-updated'));
  assert.strictEqual(globalQc.get('/api/config/ev2'), null, 'assumptions-updated cleared config');
  globalQc.set('/api/reports/ev3', { c: 3 });
  window.dispatchEvent(new CustomEvent('bper:auth-cleared'));
  assert.strictEqual(globalQc.get('/api/reports/ev3'), null, 'auth-cleared cleared cache');
  console.log('✅ PASSED');

  console.log('\n========================================================');
  console.log('ALL 13 CONCURRENCY AUDIT SCENARIOS PASSED WITH ZERO FAILS!');
  console.log('========================================================\n');
}

runAll12Scenarios().catch(err => {
  console.error('Audit suite failed:', err);
  process.exit(1);
});
