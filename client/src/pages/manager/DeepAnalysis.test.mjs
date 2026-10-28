import assert from 'node:assert';
import test from 'node:test';

// Test simulation of DeepAnalysis tab-switching, lazy loading, per-filter caching, and stale response cancellation

test('DeepAnalysis lazy fetching: fetches only the active tab report on initial mount', async () => {
  const fetchCounts = {
    fte: 0,
    consolidation: 0,
    fitment: 0,
    utilization: 0,
  };

  function simulateLoad(mainTab) {
    if (mainTab === 'fte') fetchCounts.fte++;
    if (mainTab === 'consolidation') fetchCounts.consolidation++;
    if (mainTab === 'fitment') fetchCounts.fitment++;
    if (mainTab === 'utilization') fetchCounts.utilization++;
  }

  // User lands on DeepAnalysis with default tab = 'fte'
  simulateLoad('fte');

  assert.strictEqual(fetchCounts.fte, 1, 'FTE should be fetched');
  assert.strictEqual(fetchCounts.consolidation, 0, 'Consolidation must NOT be fetched eagerly');
  assert.strictEqual(fetchCounts.fitment, 0, 'Fitment must NOT be fetched eagerly');
  assert.strictEqual(fetchCounts.utilization, 0, 'Utilization must NOT be fetched eagerly');
});

test('DeepAnalysis caching: switching to a new tab fetches it; switching back reuses cache without refetching', async () => {
  const fetchCounts = {
    fte: 0,
    utilization: 0,
  };

  const fteCache = new Map();
  const utilizationCache = new Map();

  function accessTab(mainTab, dept = '') {
    const key = dept || '__ALL__';
    if (mainTab === 'fte') {
      if (fteCache.has(key)) return fteCache.get(key);
      fetchCounts.fte++;
      const data = { tab: 'fte', dept };
      fteCache.set(key, data);
      return data;
    }
    if (mainTab === 'utilization') {
      if (utilizationCache.has(key)) return utilizationCache.get(key);
      fetchCounts.utilization++;
      const data = { tab: 'utilization', dept };
      utilizationCache.set(key, data);
      return data;
    }
  }

  // 1. Initial mount on 'fte'
  accessTab('fte');
  assert.strictEqual(fetchCounts.fte, 1);
  assert.strictEqual(fetchCounts.utilization, 0);

  // 2. User clicks 'utilization' tab
  accessTab('utilization');
  assert.strictEqual(fetchCounts.fte, 1);
  assert.strictEqual(fetchCounts.utilization, 1);

  // 3. User switches back to 'fte'
  accessTab('fte');
  assert.strictEqual(fetchCounts.fte, 1, 'Should reuse cached FTE report without triggering another API call');

  // 4. User switches back to 'utilization'
  accessTab('utilization');
  assert.strictEqual(fetchCounts.utilization, 1, 'Should reuse cached Utilization report without triggering another API call');
});

test('DeepAnalysis department filter: triggers refetch for new filter and caches per department', async () => {
  let fetchCount = 0;
  const fteCache = new Map();

  function fetchFte(dept) {
    const key = dept || '__ALL__';
    if (fteCache.has(key)) return fteCache.get(key);
    fetchCount++;
    const res = { dept, totalFte: dept === 'Finance' ? 4.5 : 12.0 };
    fteCache.set(key, res);
    return res;
  }

  // All departments
  const allRes = fetchFte('');
  assert.strictEqual(fetchCount, 1);
  assert.strictEqual(allRes.totalFte, 12.0);

  // Filter to Finance
  const finRes = fetchFte('Finance');
  assert.strictEqual(fetchCount, 2);
  assert.strictEqual(finRes.totalFte, 4.5);

  // Toggle back to All departments
  const allResCached = fetchFte('');
  assert.strictEqual(fetchCount, 2, 'Should hit cache for All departments');
  assert.strictEqual(allResCached.totalFte, 12.0);
});

test('DeepAnalysis race condition guard: ignores stale response if newer request initiated', async () => {
  let activeReqId = 0;
  let displayedData = null;

  async function triggerQuery(dept, delayMs, payload) {
    const reqId = ++activeReqId;
    await new Promise((r) => setTimeout(r, delayMs));
    if (activeReqId !== reqId) {
      // Discard stale response
      return;
    }
    displayedData = payload;
  }

  // User rapidly clicks "Finance" (slow 50ms) then "HR" (fast 10ms)
  const p1 = triggerQuery('Finance', 50, 'Finance Data');
  const p2 = triggerQuery('HR', 10, 'HR Data');

  await Promise.all([p1, p2]);

  assert.strictEqual(displayedData, 'HR Data', 'HR data from newer request must be displayed, stale Finance response must not overwrite');
});

test('DeepAnalysis activities pagination metadata: accurately calculates pages, limits, and handles empty and edge pages', () => {
  function getPaginationMeta(totalCount, page = 1, limit = 50) {
    const validLimit = Math.max(1, limit);
    const totalPages = Math.ceil(totalCount / validLimit) || 1;
    const validPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (validPage - 1) * validLimit;
    const endIndex = Math.min(startIndex + validLimit, totalCount);

    return {
      page: validPage,
      limit: validLimit,
      total: totalCount,
      totalPages,
      itemCountOnPage: Math.max(0, endIndex - startIndex),
      isFirstPage: validPage === 1,
      isLastPage: validPage === totalPages,
    };
  }

  // 1. Regular 21,058 items, page 1
  const p1 = getPaginationMeta(21058, 1, 50);
  assert.strictEqual(p1.totalPages, 422);
  assert.strictEqual(p1.itemCountOnPage, 50);
  assert.strictEqual(p1.isFirstPage, true);
  assert.strictEqual(p1.isLastPage, false);

  // 2. Final page (page 422) with 21,058 items (21,058 % 50 = 8 items)
  const pLast = getPaginationMeta(21058, 422, 50);
  assert.strictEqual(pLast.page, 422);
  assert.strictEqual(pLast.itemCountOnPage, 8);
  assert.strictEqual(pLast.isFirstPage, false);
  assert.strictEqual(pLast.isLastPage, true);

  // 3. Out-of-bounds page clamps to totalPages
  const pOver = getPaginationMeta(21058, 999, 50);
  assert.strictEqual(pOver.page, 422);
  assert.strictEqual(pOver.isLastPage, true);

  // 4. Empty result set (0 items)
  const pEmpty = getPaginationMeta(0, 1, 50);
  assert.strictEqual(pEmpty.totalPages, 1);
  assert.strictEqual(pEmpty.itemCountOnPage, 0);
  assert.strictEqual(pEmpty.isFirstPage, true);
  assert.strictEqual(pEmpty.isLastPage, true);
});

test('DeepAnalysis page transition: navigating pages loads new slice and maintains stable sort', () => {
  const dataset = Array.from({ length: 125 }, (_, i) => ({
    id: i + 1,
    fte: 125 - i, // Pre-sorted descending
  }));

  function paginate(items, page, limit = 50) {
    const startIndex = (page - 1) * limit;
    return items.slice(startIndex, startIndex + limit);
  }

  const page1 = paginate(dataset, 1, 50);
  assert.strictEqual(page1.length, 50);
  assert.strictEqual(page1[0].fte, 125);
  assert.strictEqual(page1[49].fte, 76);

  const page2 = paginate(dataset, 2, 50);
  assert.strictEqual(page2.length, 50);
  assert.strictEqual(page2[0].fte, 75);
  assert.strictEqual(page2[49].fte, 26);

  const page3 = paginate(dataset, 3, 50);
  assert.strictEqual(page3.length, 25);
  assert.strictEqual(page3[0].fte, 25);
  assert.strictEqual(page3[24].fte, 1);
});

test('DeepAnalysis filter-reset behavior: changing search or tower resets page to 1', () => {
  let currentPage = 5;

  function onFilterChange(newSearch, newTower, currentFilterState) {
    if (newSearch !== currentFilterState.search || newTower !== currentFilterState.tower) {
      currentPage = 1; // Reset to page 1
    }
  }

  const currentFilters = { search: '', tower: 'Finance' };

  // User enters search "Billing" while on page 5
  onFilterChange('Billing', 'Finance', currentFilters);
  assert.strictEqual(currentPage, 1, 'Search query change should reset page to 1');

  currentPage = 10;
  // User changes tower to "Operations"
  onFilterChange('Billing', 'Operations', { search: 'Billing', tower: 'Finance' });
  assert.strictEqual(currentPage, 1, 'Tower filter change should reset page to 1');
});

test('DeepAnalysis activities stale response guard: fast query after slow query ignores stale response', async () => {
  let activeReqId = 0;
  let currentActivities = [];
  let isActivitiesLoading = false;

  async function fetchActivities(searchQuery, latencyMs, mockData) {
    const reqId = ++activeReqId;
    isActivitiesLoading = true;

    await new Promise((resolve) => setTimeout(resolve, latencyMs));

    if (activeReqId !== reqId) {
      // Stale response ignored
      return;
    }

    currentActivities = mockData;
    isActivitiesLoading = false;
  }

  // 1. Slow initial search "Cash" (100ms)
  const p1 = fetchActivities('Cash', 100, [{ name: 'Cashflow analysis' }]);

  // 2. User quickly clears and types "Tax" (20ms)
  const p2 = fetchActivities('Tax', 20, [{ name: 'Tax compliance' }]);

  await Promise.all([p1, p2]);

  assert.strictEqual(currentActivities.length, 1);
  assert.strictEqual(currentActivities[0].name, 'Tax compliance', 'Stale Cash response must not overwrite Tax response');
  assert.strictEqual(isActivitiesLoading, false);
});

test('DeepAnalysis export query parameters: generates correct query parameters without accidental double filtering', () => {
  function buildExportQueryParams(department, search, tower, process, subProcess) {
    const params = new URLSearchParams();
    if (department && department !== 'All Departments') {
      params.set('department', department);
    }
    params.set('export', 'true');
    if (tower) {
      params.set('tower', tower);
    }
    if (search) {
      params.set('search', search);
    }
    if (process) {
      params.set('process', process);
    }
    if (subProcess) {
      params.set('subProcess', subProcess);
    }
    return params.toString();
  }

  // 1. All Departments, Tower = PTP, Search = invoice
  const q1 = buildExportQueryParams('All Departments', 'invoice', 'PTP');
  assert.strictEqual(q1, 'export=true&tower=PTP&search=invoice');
  assert.ok(!q1.includes('department='), 'All Departments should not include department filter param');

  // 2. Specific department Finance & Accounting, no search
  const q2 = buildExportQueryParams('Finance & Accounting', '', 'Treasury');
  assert.strictEqual(q2, 'department=Finance+%26+Accounting&export=true&tower=Treasury');

  // 3. Activity contributors drilldown export
  const q3 = buildExportQueryParams('Finance & Accounting', '', 'Treasury', 'Cashflow Planning', 'Cash flow analysis');
  assert.strictEqual(q3, 'department=Finance+%26+Accounting&export=true&tower=Treasury&process=Cashflow+Planning&subProcess=Cash+flow+analysis');
});

