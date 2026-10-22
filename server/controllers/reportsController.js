const User = require('../models/User');
const WDTSubmission = require('../models/WDTSubmission');
const Fitment = require('../models/Fitment');

const STANDARD_MONTHLY_HOURS = 160;

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPercent(value, total) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(1));
}

function buildScopeMatch(department, month, year) {
  const match = {
    month: month != null ? Number(month) : 10,
    year: year != null ? Number(year) : 2026,
  };
  if (department && department !== 'All Departments') {
    match['employee.department'] = department;
  }
  return match;
}

async function resolveRequestUser(req) {
  const roleFromToken = req.user?.role;
  if (roleFromToken) {
    return { role: roleFromToken, email: req.user?.email || null, userId: req.user?.userId || null };
  }

  if (!req.user?.userId) {
    return { role: null, email: req.user?.email || null, userId: null };
  }

  const user = await User.findById(req.user.userId).select('role email');
  return {
    role: user?.role || null,
    email: user?.email || null,
    userId: req.user.userId,
  };
}

function ensureManager(role, res) {
  if (role !== 'manager' && role !== 'admin') {
    res.status(403).json({ message: 'Manager access required for reports.' });
    return false;
  }
  return true;
}

function flattenRows(submissions) {
  return submissions.flatMap((submission) => {
    const defaultEmpId = submission.employee?.employeeId || 'NA';
    const defaultEmpName = submission.employee?.name || 'Unknown Employee';
    const defaultDept = submission.employee?.department || 'Unassigned';

    // 1. Check for standard payload.rows representation
    const payloadRows = Array.isArray(submission?.payload?.rows) ? submission.payload.rows : [];
    const validPayloadRows = payloadRows.filter(r => r && typeof r === 'object');

    if (validPayloadRows.length > 0) {
      return validPayloadRows.map((row) => {
        const hours = safeNumber(row.timeTakenHoursPerMonth != null ? row.timeTakenHoursPerMonth : row.hours);
        const tower = row.tower || row.majorProcess || defaultDept;
        return {
          referenceId: submission.referenceId,
          submittedAt: submission.submittedAt,
          status: submission.status,
          employeeId: row.employeeId || defaultEmpId,
          employeeName: row.employeeName || defaultEmpName,
          department: row.department || defaultDept,
          tower,
          majorProcess: row.majorProcess || tower,
          process: row.process || 'Unspecified Process',
          subProcess: row.subProcess || row.name || 'Unspecified Activity',
          frequency: row.frequency || 'Unspecified',
          activityCategory: row.activityCategory || row.category || 'core',
          monthlyHours: hours,
          comments: row.comments || '',
        };
      });
    }

    // 2. Check for legacy/alternative activities representation (if payload.rows is absent or empty)
    const activities = Array.isArray(submission?.activities) ? submission.activities : [];
    const validActivities = activities.filter(a => a && typeof a === 'object');

    if (validActivities.length > 0) {
      return validActivities.map((act) => {
        const hours = safeNumber(act.monthlyHours != null ? act.monthlyHours : (act.timeTakenHoursPerMonth != null ? act.timeTakenHoursPerMonth : act.hours));
        const tower = act.tower || act.majorProcess || defaultDept;
        return {
          referenceId: submission.referenceId,
          submittedAt: submission.submittedAt,
          status: submission.status,
          employeeId: act.employeeId || defaultEmpId,
          employeeName: act.employeeName || defaultEmpName,
          department: act.department || defaultDept,
          tower,
          majorProcess: act.majorProcess || tower,
          process: act.process || 'Unspecified Process',
          subProcess: act.subProcess || act.name || 'Unspecified Activity',
          frequency: act.frequency || 'Unspecified',
          activityCategory: act.activityCategory || act.category || 'core',
          monthlyHours: hours,
          comments: act.comments || '',
        };
      });
    }

    // 3. Fallback for summary-only records (no row details, but document-level totalHours exists)
    // Only generate a summary row if totalHours > 0 and no detailed activity rows were present.
    const headerHours = safeNumber(submission?.totalHours);
    if (headerHours > 0) {
      return [{
        referenceId: submission.referenceId,
        submittedAt: submission.submittedAt,
        status: submission.status,
        employeeId: defaultEmpId,
        employeeName: defaultEmpName,
        department: defaultDept,
        tower: defaultDept,
        majorProcess: defaultDept,
        process: 'Summary Process',
        subProcess: 'Summary Activity',
        frequency: 'Monthly',
        activityCategory: 'core',
        monthlyHours: headerHours,
        comments: 'Derived from summary-only record',
      }];
    }

    return [];
  });
}

function classifyScreeningSignals(row) {
  const comment = String(row.comments || '').toLowerCase();
  const isHighVolume = row.monthlyHours >= 26;
  const hasKeyword = comment.includes('automation') || comment.includes('rpa') || comment.includes('repeat');

  let screeningSignal = 'None';
  if (isHighVolume && hasKeyword) {
    screeningSignal = 'High Volume & Keyword';
  } else if (isHighVolume) {
    screeningSignal = 'High Volume (>=26h)';
  } else if (hasKeyword) {
    screeningSignal = 'Keyword Flagged';
  }

  return {
    isHighVolume,
    hasKeyword,
    isScreened: isHighVolume || hasKeyword,
    screeningSignal
  };
}

function buildConsolidationSignal(row) {
  const signals = classifyScreeningSignals(row);
  return signals.isScreened;
}

function buildTrend(row) {
  if (row.monthlyHours >= 40) return 'up';
  if (row.monthlyHours <= 20) return 'down';
  return 'steady';
}

function getSubmissionWindowStatus() {
  const today = new Date();
  const date = today.getDate();
  const isOpen = date >= 20;
  const daysUntilNext = isOpen ? 0 : 20 - date;

  return {
    isOpen,
    currentMonth: today.getMonth() + 1,
    currentYear: today.getFullYear(),
    daysUntilNext,
    message: isOpen ? 'Submission Window is Open' : `Opens in ${daysUntilNext} days`,
  };
}

// --- In-Memory Scoped Reports Cache with Scope Isolation ---
const scopedSubmissionsCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

function invalidateScopedReportsCache() {
  scopedSubmissionsCache.clear();
}

async function getScopedSubmissions(req) {
  const { department, month, year } = req.query;
  const match = buildScopeMatch(department, month, year);
  const cacheKey = JSON.stringify(match);

  const cached = scopedSubmissionsCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now && cached.data) {
    return cached.data;
  }
  // Coalesce in-flight queries for the same scope so concurrent endpoints don't execute 3 identical scans
  if (cached && cached.inFlightPromise) {
    return cached.inFlightPromise;
  }

  const queryPromise = WDTSubmission.find(match)
    .select('referenceId batchId submittedAt month year status totalHours pendingFrom employee.employeeId employee.name employee.email employee.department employee.designation employee.tower payload.rows activities')
    .sort({ submittedAt: -1 })
    .lean()
    .then((docs) => {
      scopedSubmissionsCache.set(cacheKey, {
        data: docs,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return docs;
    })
    .catch((err) => {
      scopedSubmissionsCache.delete(cacheKey);
      throw err;
    });

  scopedSubmissionsCache.set(cacheKey, {
    inFlightPromise: queryPromise,
    expiresAt: now + CACHE_TTL_MS,
  });

  return queryPromise;
}

async function getDashboardReport(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) return;

    const [submissions, totalEmployees] = await Promise.all([
      getScopedSubmissions(req),
      User.countDocuments({ role: 'employee', isActive: true, isArchivedDemo: { $ne: true } }),
    ]);

    const rows = flattenRows(submissions);
    const totalHours = rows.reduce((sum, row) => sum + row.monthlyHours, 0);
    const totalFte = totalHours / STANDARD_MONTHLY_HOURS;

    const approved = submissions.filter((item) => item.status === 'Approved').length;
    const pending = submissions.filter((item) => item.status === 'Under Review').length;
    const changesRequested = submissions.filter((item) => item.status === 'Changes Requested').length;

    const towerMap = new Map();
    rows.forEach((row) => {
      const current = towerMap.get(row.tower) || { tower: row.tower, hours: 0, activityCount: 0 };
      current.hours += row.monthlyHours;
      current.activityCount += 1;
      towerMap.set(row.tower, current);
    });

    const towerFte = Array.from(towerMap.values())
      .map((item) => ({
        tower: item.tower,
        hours: Number(item.hours.toFixed(1)),
        activityCount: item.activityCount,
        fte: Number((item.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
      }))
      .sort((a, b) => b.fte - a.fte);

    const activityMap = new Map();
    rows.forEach((row) => {
      const key = `${row.subProcess}::${row.tower}`;
      const current = activityMap.get(key) || {
        name: row.subProcess,
        tower: row.tower,
        monthlyHours: 0,
        consolidate: false,
      };
      current.monthlyHours += row.monthlyHours;
      current.consolidate = current.consolidate || buildConsolidationSignal(row);
      activityMap.set(key, current);
    });

    const topActivities = Array.from(activityMap.values())
      .map((item) => ({
        name: item.name,
        tower: item.tower,
        monthlyHours: Number(item.monthlyHours.toFixed(1)),
        fte: Number((item.monthlyHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        consolidate: item.consolidate,
        trend: buildTrend(item),
      }))
      .sort((a, b) => b.fte - a.fte);

    const byDepartment = new Map();
    rows.forEach((row) => {
      const current = byDepartment.get(row.department) || { label: row.department, hours: 0 };
      current.hours += row.monthlyHours;
      byDepartment.set(row.department, current);
    });
    const teamUtilization = Array.from(byDepartment.values())
      .map((item) => {
        const fte = item.hours / STANDARD_MONTHLY_HOURS;
        return {
          label: item.label,
          totalHours: Number(item.hours.toFixed(1)),
          fte: Number(fte.toFixed(2)),
          utilizationPct: Number(Math.min(100, fte * 100).toFixed(1)),
        };
      })
      .sort((a, b) => b.utilizationPct - a.utilizationPct)
      .slice(0, 6);

    // 1. Roster counts: derive from authoritative User roster if synced
    // Explicitly verify whether roster synchronization has run (presence of isRosterOnly or rosterSynced employees)
    const [authoritativeRosterCount, rosterVacantCount] = await Promise.all([
      User.countDocuments({ role: 'employee', isActive: true, isRosterOnly: true, isArchivedDemo: { $ne: true } }),
      User.countDocuments({ role: 'position', isVacant: true }),
    ]);

    // An authoritative roster exists if explicit roster-managed records have been synchronized
    const hasAuthoritativeRoster = authoritativeRosterCount > 0;
    const finalRosterNamedStaffCount = hasAuthoritativeRoster
      ? await User.countDocuments({ role: 'employee', isActive: true, isArchivedDemo: { $ne: true } })
      : 0;

    // 2. Submission-derived active participants (distinct contributors in scoped submissions)
    const uniqueSubmissionParticipantsMap = new Map();
    submissions.forEach((s) => {
      const empId = String(s.employee?.employeeId || '').trim();
      const empName = String(s.employee?.name || '').trim();
      if (empId) {
        uniqueSubmissionParticipantsMap.set(empId, empName.toLowerCase() === 'vacant');
      }
    });

    let submissionNamedCount = 0;
    let submissionVacantCount = 0;
    uniqueSubmissionParticipantsMap.forEach((isVacant) => {
      if (isVacant) submissionVacantCount++;
      else submissionNamedCount++;
    });

    const summary = {
      totalEmployees, // Backward-compatible (active user accounts)
      activeUserAccounts: totalEmployees,
      hasAuthoritativeRoster,
      rosterSource: hasAuthoritativeRoster ? 'master_roster' : 'submission_participants',
      totalStaff: hasAuthoritativeRoster ? finalRosterNamedStaffCount : submissionNamedCount,
      vacantPositions: hasAuthoritativeRoster ? rosterVacantCount : submissionVacantCount,
      submissionParticipants: {
        namedStaff: submissionNamedCount,
        vacancies: submissionVacantCount,
        total: uniqueSubmissionParticipantsMap.size,
      },
      totalSubmissions: submissions.length,
      pendingReview: pending,
      approved,
      changesRequested,
      totalHours: Number(totalHours.toFixed(2)),
      totalFte: Number(totalFte.toFixed(2)),
      avgUtilizationPct: Number(Math.min(100, totalFte * 100).toFixed(1)),
    };

    const totalSubmissionCount = submissions.length;
    const submissionStatusSegments = [
      { key: 'approved', label: 'Approved', count: approved, percent: toPercent(approved, totalSubmissionCount) },
      { key: 'pending', label: 'Pending', count: pending, percent: toPercent(pending, totalSubmissionCount) },
      {
        key: 'changesRequested',
        label: 'Changes Requested',
        count: changesRequested,
        percent: toPercent(changesRequested, totalSubmissionCount),
      },
    ];

    const recentSubmissions = submissions.slice(0, 8).map((item) => ({
      referenceId: item.referenceId,
      employee: {
        employeeId: item.employee?.employeeId || 'NA',
        name: item.employee?.name || 'Unknown Employee',
      },
      status: item.status,
      submittedAt: item.submittedAt,
      totalHours: safeNumber(item.totalHours),
      pendingFrom: item.pendingFrom || 'NA',
    }));

    const employeeMap = new Map();
    rows.forEach((row) => {
      const isVac = String(row.employeeName).toLowerCase() === 'vacant';
      if (!isVac) {
        const empKey = row.employeeId || row.employeeName;
        const current = employeeMap.get(empKey) || {
          employeeId: row.employeeId || 'NA',
          name: row.employeeName || 'Unknown Employee',
          label: `${row.employeeName} (${row.employeeId})`,
          hours: 0,
        };
        current.hours += row.monthlyHours;
        employeeMap.set(empKey, current);
      }
    });

    const employeeFteData = Array.from(employeeMap.values()).map(emp => {
      const hours = Number(emp.hours.toFixed(2));
      const fte = Number((emp.hours / STANDARD_MONTHLY_HOURS).toFixed(2));
      const capacityPct = Number((fte * 100).toFixed(1));
      return {
        label: emp.label,
        name: emp.name,
        employeeId: emp.employeeId,
        totalHours: hours,
        fte,
        capacityPct,
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      submissionWindow: getSubmissionWindowStatus(),
      summary,
      charts: {
        towerFte,
        topActivities,
        submissionStatusSegments,
        teamUtilization,
        employeeFteData,
      },
      tables: {
        recentSubmissions,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getUtilizationReport(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) return;

    const submissions = await getScopedSubmissions(req);
    const rows = flattenRows(submissions);

    const totalHours = rows.reduce((sum, row) => sum + row.monthlyHours, 0);
    const totalSubmissions = submissions.length;
    const approved = submissions.filter((item) => item.status === 'Approved').length;
    const underReview = submissions.filter((item) => item.status === 'Under Review').length;
    const changesRequested = submissions.filter((item) => item.status === 'Changes Requested').length;

    const groupAndSort = (items, keyBuilder, valueSelector, limit = 10) => {
      const map = new Map();
      items.forEach((item) => {
        const key = keyBuilder(item);
        map.set(key, (map.get(key) || 0) + valueSelector(item));
      });
      return Array.from(map.entries())
        .map(([label, hours]) => ({ label, hours: Number(hours.toFixed(1)) }))
        .sort((a, b) => b.hours - a.hours)
        .slice(0, limit);
    };

    const byFrequency = groupAndSort(rows, (row) => row.frequency, (row) => row.monthlyHours, 8);
    const byProcess = groupAndSort(rows, (row) => row.subProcess || row.process, (row) => row.monthlyHours, 8);

    // Filter named staff vs vacant open positions
    const namedRows = rows.filter((row) => String(row.employeeName).toLowerCase() !== 'vacant');
    const vacantRows = rows.filter((row) => String(row.employeeName).toLowerCase() === 'vacant');

    // Rank named staff by stable Employee ID and name
    const byEmployee = groupAndSort(
      namedRows,
      (row) => `${row.employeeName} (${row.employeeId})`,
      (row) => row.monthlyHours,
      8
    );

    // Vacancy summary statistics (preserving all vacancy hours)
    // Safely normalize employee IDs (ignoring blank/whitespace or falling back to index)
    const validVacantIds = new Set();
    let unassignedVacantRowCount = 0;
    vacantRows.forEach((r, idx) => {
      const cleanId = String(r.employeeId || '').trim();
      if (cleanId) {
        validVacantIds.add(cleanId);
      } else {
        unassignedVacantRowCount++;
      }
    });

    const vacantUniquePositions = validVacantIds.size + unassignedVacantRowCount;
    const vacantTotalHours = Number(vacantRows.reduce((sum, r) => sum + (safeNumber(r.monthlyHours)), 0).toFixed(2));
    const vacancySummary = {
      positionsCount: vacantUniquePositions,
      totalHours: vacantTotalHours,
      fte: Number((vacantTotalHours / STANDARD_MONTHLY_HOURS).toFixed(2))
    };

    const coreHours = rows
      .filter((row) => String(row.activityCategory).toLowerCase() !== 'support')
      .reduce((sum, row) => sum + row.monthlyHours, 0);
    const supportHours = rows
      .filter((row) => String(row.activityCategory).toLowerCase() === 'support')
      .reduce((sum, row) => sum + row.monthlyHours, 0);

    const deptMap = new Map();
    rows.forEach((row) => {
      const current = deptMap.get(row.department) || { label: row.department, hours: 0, submissionRefs: new Set() };
      current.hours += row.monthlyHours;
      current.submissionRefs.add(row.referenceId);
      deptMap.set(row.department, current);
    });
    const byDepartment = Array.from(deptMap.values())
      .map((item) => {
        const fte = item.hours / STANDARD_MONTHLY_HOURS;
        return {
          label: item.label,
          hours: Number(item.hours.toFixed(1)),
          fte: Number(fte.toFixed(2)),
          utilizationPct: Number(Math.min(100, fte * 100).toFixed(1)),
          submissionCount: item.submissionRefs.size,
        };
      })
      .sort((a, b) => b.hours - a.hours);

    const recentSubmissions = submissions.slice(0, 10).map((item) => ({
      referenceId: item.referenceId,
      employeeName: item.employee?.name || 'Unknown Employee',
      department: item.employee?.department || 'Unassigned',
      totalHours: safeNumber(item.totalHours),
      status: item.status,
      submittedAt: item.submittedAt,
      employeeId: item.employee?.employeeId || 'NA',
    }));

    // Aggregate full named employee population for FTE band distribution (keyed by stable employee ID)
    const allNamedEmpMap = new Map();
    namedRows.forEach((row) => {
      const empKey = row.employeeId || row.employeeName;
      const current = allNamedEmpMap.get(empKey) || { label: `${row.employeeName} (${row.employeeId})`, hours: 0 };
      current.hours += row.monthlyHours;
      allNamedEmpMap.set(empKey, current);
    });

    const employeeFteData = Array.from(allNamedEmpMap.values()).map((emp) => ({
      label: emp.label,
      fte: Number((emp.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
    }));

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalHours: Number(totalHours.toFixed(2)),
        totalSubmissions,
        totalFte: Number((totalHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        avgHoursPerSubmission: Number((totalSubmissions ? totalHours / totalSubmissions : 0).toFixed(1)),
        approvalRatePct: Number(toPercent(approved, totalSubmissions).toFixed(1)),
      },
      statusCounts: {
        approved,
        underReview,
        changesRequested,
      },
      coreSupport: {
        coreHours: Number(coreHours.toFixed(2)),
        supportHours: Number(supportHours.toFixed(2)),
        totalHours: Number((coreHours + supportHours).toFixed(2)),
      },
      charts: {
        byFrequency,
        byProcess,
        byEmployee,
        byDepartment,
        employeeFteData,
      },
      vacancySummary,
      tables: {
        recentSubmissions,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getFteSummaryReport(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) return;

    const submissions = await getScopedSubmissions(req);
    const rows = flattenRows(submissions);

    const totalHours = rows.reduce((sum, row) => sum + row.monthlyHours, 0);
    const totalFte = totalHours / STANDARD_MONTHLY_HOURS;

    const byTowerMap = new Map();
    rows.forEach((row) => {
      const current = byTowerMap.get(row.tower) || { tower: row.tower, hours: 0, activityCount: 0 };
      current.hours += row.monthlyHours;
      current.activityCount += 1;
      byTowerMap.set(row.tower, current);
    });

    const byTower = Array.from(byTowerMap.values())
      .map((item) => ({
        tower: item.tower,
        hours: Number(item.hours.toFixed(1)),
        activityCount: item.activityCount,
        fte: Number((item.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
      }))
      .sort((a, b) => b.fte - a.fte);

    const byDepartmentMap = new Map();
    rows.forEach((row) => {
      const current = byDepartmentMap.get(row.department) || { department: row.department, hours: 0, activityCount: 0 };
      current.hours += row.monthlyHours;
      current.activityCount += 1;
      byDepartmentMap.set(row.department, current);
    });

    const byDepartment = Array.from(byDepartmentMap.values())
      .map((item) => ({
        department: item.department,
        hours: Number(item.hours.toFixed(1)),
        activityCount: item.activityCount,
        fte: Number((item.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
      }))
      .sort((a, b) => b.fte - a.fte);

    const topActivities = rows
      .map((row) => ({
        name: row.subProcess,
        tower: row.tower,
        department: row.department,
        monthlyHours: Number(row.monthlyHours.toFixed(1)),
        fte: Number((row.monthlyHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
      }))
      .sort((a, b) => b.fte - a.fte)
      .slice(0, 12);

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalHours: Number(totalHours.toFixed(2)),
        totalFte: Number(totalFte.toFixed(2)),
        baselineHours: STANDARD_MONTHLY_HOURS,
        totalActivities: rows.length,
      },
      charts: {
        byTower,
        byDepartment,
        topActivities,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getFteConsolidationSummaryReport(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) return;

    const efficiencyFactor = Number(req.query.efficiencyFactor) || 0.35;
    const costPerFteLakhs = Number(req.query.costPerFteLakhs) || 10;
    const costPerFteCr = costPerFteLakhs / 100;

    const submissions = await getScopedSubmissions(req);
    const rows = flattenRows(submissions);

    let highVolumeCount = 0;
    let keywordCount = 0;
    let overlapCount = 0;

    const candidateRows = rows.map((row) => {
      const signals = classifyScreeningSignals(row);
      const fte = row.monthlyHours / STANDARD_MONTHLY_HOURS;

      if (signals.isHighVolume && signals.hasKeyword) overlapCount++;
      else if (signals.isHighVolume) highVolumeCount++;
      else if (signals.hasKeyword) keywordCount++;

      return {
        ...row,
        ...signals,
        consolidate: signals.isScreened,
        fte,
      };
    });

    const consolidateActivities = candidateRows.filter((row) => row.consolidate);
    const candidateHours = consolidateActivities.reduce((sum, row) => sum + row.monthlyHours, 0);
    const candidateFte = candidateHours / STANDARD_MONTHLY_HOURS;
    const savedFte = candidateFte * efficiencyFactor;
    const estimatedSavingsCr = savedFte * costPerFteCr;

    const byDepartmentMap = new Map();
    candidateRows.forEach((row) => {
      const current = byDepartmentMap.get(row.department) || {
        department: row.department,
        totalActivities: 0,
        consolidateActivities: 0,
        candidateHours: 0,
        candidateFte: 0,
        savedFte: 0,
      };
      current.totalActivities += 1;
      if (row.consolidate) {
        current.consolidateActivities += 1;
        current.candidateHours += row.monthlyHours;
        current.candidateFte += row.fte;
        current.savedFte += row.fte * efficiencyFactor;
      }
      byDepartmentMap.set(row.department, current);
    });

    const byDepartment = Array.from(byDepartmentMap.values())
      .map((item) => ({
        department: item.department,
        totalActivities: item.totalActivities,
        consolidateActivities: item.consolidateActivities,
        consolidationRatePct: Number(toPercent(item.consolidateActivities, item.totalActivities).toFixed(1)),
        candidateHours: Number(item.candidateHours.toFixed(1)),
        candidateFte: Number(item.candidateFte.toFixed(2)),
        savedFte: Number(item.savedFte.toFixed(2)),
        estimatedSavingsCr: Number((item.savedFte * costPerFteCr).toFixed(2)),
      }))
      .sort((a, b) => b.savedFte - a.savedFte);

    const topConsolidationCandidates = consolidateActivities
      .map((row) => ({
        activityName: row.subProcess,
        tower: row.tower,
        department: row.department,
        monthlyHours: Number(row.monthlyHours.toFixed(1)),
        fte: Number(row.fte.toFixed(2)),
        screeningSignal: row.screeningSignal,
        savedFte: Number((row.fte * efficiencyFactor).toFixed(2)),
        trend: buildTrend(row),
      }))
      .sort((a, b) => b.monthlyHours - a.monthlyHours)
      .slice(0, 10);

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalActivities: candidateRows.length,
        consolidateActivities: consolidateActivities.length,
        consolidationRatePct: Number(toPercent(consolidateActivities.length, candidateRows.length).toFixed(1)),
        candidateHours: Number(candidateHours.toFixed(2)),
        candidateFte: Number(candidateFte.toFixed(2)),
        savedFte: Number(savedFte.toFixed(2)),
        estimatedSavingsCr: Number(estimatedSavingsCr.toFixed(2)),
        screeningCriteria: {
          highVolumeOnlyCount: highVolumeCount,
          keywordOnlyCount: keywordCount,
          overlapCount: overlapCount,
          totalUniqueScreened: consolidateActivities.length,
        },
        scenarioParameters: {
          efficiencyFactor,
          costPerFteLakhs,
          isScenarioModel: true,
          notice: 'Screened candidate activities and efficiency figures represent hypothetical planning scenarios, not audited realized savings.'
        }
      },
      charts: {
        byDepartment,
        topConsolidationCandidates,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getFitmentSummaryReport(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) return;

    const { department } = req.query;
    let employeeIdsScope = null;

    if (department && department !== 'All Departments') {
      employeeIdsScope = await WDTSubmission.distinct('employee.employeeId', { 'employee.department': department });
    }

    const fitmentQuery = {};
    if (employeeIdsScope) {
      fitmentQuery.employeeId = { $in: employeeIdsScope };
    }

    const fitments = await Fitment.find(fitmentQuery).sort({ weightedScore: -1 }).lean();

    // Determine the true operational workforce scope (named staff only, excluding vacancies)
    let totalEmployees = 0;
    let operationalEmpIdSet = new Set();
    if (employeeIdsScope) {
      totalEmployees = employeeIdsScope.length;
      operationalEmpIdSet = new Set(employeeIdsScope.map(String));
    } else {
      const authoritativeRosterCount = await User.countDocuments({ role: 'employee', isActive: true, isRosterOnly: true, isArchivedDemo: { $ne: true } });
      if (authoritativeRosterCount > 0) {
        totalEmployees = await User.countDocuments({ role: 'employee', isActive: true, isArchivedDemo: { $ne: true } });
        const rosterUsers = await User.find({ role: 'employee', isActive: true, isArchivedDemo: { $ne: true } }).select('employeeId').lean();
        operationalEmpIdSet = new Set(rosterUsers.map(u => String(u.employeeId || '').trim()).filter(Boolean));
      } else {
        // Fallback to active named staff in WDT submissions
        const wdtNamed = await WDTSubmission.distinct('employee.employeeId', { 'employee.name': { $not: /^vacant$/i } });
        totalEmployees = wdtNamed.length > 0 ? wdtNamed.length : await User.countDocuments({ role: 'employee', isActive: true, isArchivedDemo: { $ne: true } });
        operationalEmpIdSet = new Set(wdtNamed.map(String));
      }
    }

    const userMap = new Map(
      (
        await User.find({ role: 'employee' })
          .select('employeeId name designation band')
          .lean()
      ).map((u) => [u.employeeId, u])
    );

    const profilesWithUser = fitments.map((item) => {
      const user = userMap.get(item.employeeId) || {};
      const isOperational = operationalEmpIdSet.has(String(item.employeeId || '').trim());
      return {
        employeeId: item.employeeId,
        name: user.name || item.employeeId,
        designation: user.designation || '',
        band: user.band || '',
        weightedScore: safeNumber(item.weightedScore),
        fitmentLabel: item.fitmentLabel || 'UNFIT',
        lastEvaluatedAt: item.lastEvaluatedAt || item.updatedAt || item.createdAt,
        isPilotAssessment: !isOperational,
        assessmentCategory: isOperational ? 'Operational Workforce' : 'Pilot Evaluation Record'
      };
    });

    // Segregate operational vs pilot records
    const operationalProfiles = profilesWithUser.filter(p => !p.isPilotAssessment);
    const pilotProfiles = profilesWithUser.filter(p => p.isPilotAssessment);

    const operationalAssessedCount = operationalProfiles.length;
    const operationalCoveragePct = Number(toPercent(operationalAssessedCount, totalEmployees).toFixed(1));

    const avgWeightedScore = operationalAssessedCount
      ? Number((operationalProfiles.reduce((sum, item) => sum + safeNumber(item.weightedScore), 0) / operationalAssessedCount).toFixed(1))
      : (pilotProfiles.length ? Number((pilotProfiles.reduce((sum, item) => sum + safeNumber(item.weightedScore), 0) / pilotProfiles.length).toFixed(1)) : 0);

    const activeListForCharts = operationalAssessedCount > 0 ? operationalProfiles : pilotProfiles;

    const labelBreakdown = {
      fit: activeListForCharts.filter((item) => item.fitmentLabel === 'FIT').length,
      trainToFit: activeListForCharts.filter((item) => item.fitmentLabel === 'TRAIN TO FIT').length,
      unfit: activeListForCharts.filter((item) => item.fitmentLabel === 'UNFIT').length,
    };

    const scoreDistribution = [
      { label: '0-39', min: 0, max: 39 },
      { label: '40-64', min: 40, max: 64 },
      { label: '65-79', min: 65, max: 79 },
      { label: '80-100', min: 80, max: 100 },
    ].map((bucket) => ({
      label: bucket.label,
      count: activeListForCharts.filter((item) => {
        const score = safeNumber(item.weightedScore);
        return score >= bucket.min && score <= bucket.max;
      }).length,
    }));

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        profiles: operationalAssessedCount,
        totalEmployees,
        coveragePct: operationalCoveragePct,
        avgWeightedScore,
        labelBreakdown,
        operationalWorkforce: {
          totalEmployees,
          assessed: operationalAssessedCount,
          coveragePct: operationalCoveragePct,
          status: operationalAssessedCount === 0 ? 'Assessment Phase Pending (0% Verified Coverage)' : `${operationalCoveragePct}% Verified Coverage`
        },
        pilotAssessments: {
          totalCount: pilotProfiles.length,
          label: 'Sandbox / Pilot Baseline Records',
          notice: 'Historical pilot assessments performed during initial setup on sandbox accounts; kept separate from operational staff.'
        }
      },
      charts: {
        scoreDistribution,
      },
      tables: {
        topFitEmployees: activeListForCharts
          .filter((item) => item.fitmentLabel === 'FIT')
          .sort((a, b) => b.weightedScore - a.weightedScore)
          .slice(0, 10),
        lowFitEmployees: activeListForCharts
          .filter((item) => item.fitmentLabel !== 'FIT')
          .sort((a, b) => a.weightedScore - b.weightedScore)
          .slice(0, 10),
        pilotEvaluationRecords: pilotProfiles
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// Detailed Analysis Endpoints (Phase 9: Deep Reports)

async function getFteAnalysisReport(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) return;

    const submissions = await getScopedSubmissions(req);
    const rows = flattenRows(submissions);

    const totalHours = rows.reduce((sum, row) => sum + row.monthlyHours, 0);
    const totalFte = totalHours / STANDARD_MONTHLY_HOURS;

    // By Tower Detailed
    const byTowerMap = new Map();
    rows.forEach((row) => {
      const current = byTowerMap.get(row.tower) || { tower: row.tower, hours: 0, activityCount: 0 };
      current.hours += row.monthlyHours;
      current.activityCount += 1;
      byTowerMap.set(row.tower, current);
    });

    const byTowerDetail = Array.from(byTowerMap.values())
      .map((item) => ({
        tower: item.tower,
        hours: Number(item.hours.toFixed(1)),
        activityCount: item.activityCount,
        fte: Number((item.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        utilizationPct: Number(Math.min(100, (item.hours / STANDARD_MONTHLY_HOURS) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.fte - a.fte);

    // By Department Detailed
    const byDeptMap = new Map();
    rows.forEach((row) => {
      const current = byDeptMap.get(row.department) || { department: row.department, hours: 0, activityCount: 0 };
      current.hours += row.monthlyHours;
      current.activityCount += 1;
      byDeptMap.set(row.department, current);
    });

    const byDepartmentDetail = Array.from(byDeptMap.values())
      .map((item) => ({
        department: item.department,
        hours: Number(item.hours.toFixed(1)),
        activityCount: item.activityCount,
        fte: Number((item.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        utilizationPct: Number(Math.min(100, (item.hours / STANDARD_MONTHLY_HOURS) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.fte - a.fte);

    // All Activities Detail
    const allActivities = rows
      .map((row) => ({
        name: row.process || row.subProcess, // Fallback if needed, but we'll use process/subProcess directly now
        subProcess: row.subProcess && row.subProcess !== 'Unspecified Activity' ? row.subProcess : '',
        tower: row.tower,
        department: row.department,
        process: row.process && row.process !== 'Unspecified Process' ? row.process : '',
        frequency: row.frequency,
        monthlyHours: Number(row.monthlyHours.toFixed(1)),
        fte: Number((row.monthlyHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        activityCategory: row.activityCategory,
        employeeName: row.employeeName,
        employeeId: row.employeeId,
      }))
      .sort((a, b) => b.fte - a.fte);

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalHours: Number(totalHours.toFixed(2)),
        totalFte: Number(totalFte.toFixed(2)),
        baselineHours: STANDARD_MONTHLY_HOURS,
        totalActivities: rows.length,
        departments: byDepartmentDetail.length,
      },
      tabs: {
        byTower: byTowerDetail,
        byDepartment: byDepartmentDetail,
        allActivities,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getConsolidationAnalysisReport(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) return;

    const efficiencyFactor = Number(req.query.efficiencyFactor) || 0.35;
    const costPerFteLakhs = Number(req.query.costPerFteLakhs) || 10;
    const costPerFteCr = costPerFteLakhs / 100;

    const submissions = await getScopedSubmissions(req);
    const rows = flattenRows(submissions);

    let highVolumeCount = 0;
    let keywordCount = 0;
    let overlapCount = 0;

    const candidateRows = rows.map((row) => {
      const signals = classifyScreeningSignals(row);
      const fte = row.monthlyHours / STANDARD_MONTHLY_HOURS;

      if (signals.isHighVolume && signals.hasKeyword) overlapCount++;
      else if (signals.isHighVolume) highVolumeCount++;
      else if (signals.hasKeyword) keywordCount++;

      return {
        ...row,
        ...signals,
        consolidate: signals.isScreened,
        fte,
      };
    });

    const consolidateActivities = candidateRows.filter((row) => row.consolidate);
    const candidateHours = consolidateActivities.reduce((sum, row) => sum + row.monthlyHours, 0);
    const candidateFte = candidateHours / STANDARD_MONTHLY_HOURS;
    const savedFte = candidateFte * efficiencyFactor;
    const estimatedSavingsCr = savedFte * costPerFteCr;

    // By Department Detail
    const byDeptMap = new Map();
    candidateRows.forEach((row) => {
      const current = byDeptMap.get(row.department) || {
        department: row.department,
        totalActivities: 0,
        consolidateActivities: 0,
        candidateHours: 0,
        candidateFte: 0,
        savedFte: 0,
      };
      current.totalActivities += 1;
      if (row.consolidate) {
        current.consolidateActivities += 1;
        current.candidateHours += row.monthlyHours;
        current.candidateFte += row.fte;
        current.savedFte += row.fte * efficiencyFactor;
      }
      byDeptMap.set(row.department, current);
    });

    const byDepartmentDetail = Array.from(byDeptMap.values())
      .map((item) => ({
        department: item.department,
        totalActivities: item.totalActivities,
        consolidationCandidates: item.consolidateActivities,
        consolidationRatePct: Number(toPercent(item.consolidateActivities, item.totalActivities).toFixed(1)),
        candidateHours: Number(item.candidateHours.toFixed(1)),
        candidateFte: Number(item.candidateFte.toFixed(2)),
        savedFte: Number(item.savedFte.toFixed(2)),
        estimatedSavingsCr: Number((item.savedFte * costPerFteCr).toFixed(2)),
      }))
      .sort((a, b) => b.savedFte - a.savedFte);

    // All Consolidation Candidates Detail
    const allCandidates = candidateRows
      .map((row) => ({
        activityName: row.subProcess,
        tower: row.tower,
        department: row.department,
        process: row.process,
        frequency: row.frequency,
        monthlyHours: Number(row.monthlyHours.toFixed(1)),
        fte: Number(row.fte.toFixed(2)),
        savedFte: Number((row.fte * efficiencyFactor).toFixed(2)),
        estimatedSavingsCr: Number((row.fte * efficiencyFactor * costPerFteCr).toFixed(2)),
        consolidationSignal: row.screeningSignal,
        isHighVolume: row.isHighVolume,
        hasKeyword: row.hasKeyword,
        comment: row.comments,
      }))
      .sort((a, b) => b.monthlyHours - a.monthlyHours);

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalActivities: candidateRows.length,
        consolidateActivities: consolidateActivities.length,
        consolidationRatePct: Number(toPercent(consolidateActivities.length, candidateRows.length).toFixed(1)),
        candidateHours: Number(candidateHours.toFixed(2)),
        candidateFte: Number(candidateFte.toFixed(2)),
        savedFte: Number(savedFte.toFixed(2)),
        estimatedSavingsCr: Number(estimatedSavingsCr.toFixed(2)),
        screeningCriteria: {
          highVolumeOnlyCount: highVolumeCount,
          keywordOnlyCount: keywordCount,
          overlapCount: overlapCount,
          totalUniqueScreened: consolidateActivities.length,
        },
        scenarioParameters: {
          efficiencyFactor,
          costPerFteLakhs,
          isScenarioModel: true,
          notice: 'Screened candidate activities and efficiency figures represent hypothetical planning scenarios, not audited realized savings.'
        }
      },
      tabs: {
        byDepartment: byDepartmentDetail,
        allCandidates,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getFitmentAnalysisReport(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) return;

    const authoritativeRosterCount = await User.countDocuments({ role: 'employee', isActive: true, isRosterOnly: true, isArchivedDemo: { $ne: true } });
    let totalEmployees = 0;
    let operationalEmpIdSet = new Set();
    if (authoritativeRosterCount > 0) {
      totalEmployees = await User.countDocuments({ role: 'employee', isActive: true, isArchivedDemo: { $ne: true } });
      const rosterUsers = await User.find({ role: 'employee', isActive: true, isArchivedDemo: { $ne: true } }).select('employeeId').lean();
      operationalEmpIdSet = new Set(rosterUsers.map(u => String(u.employeeId || '').trim()).filter(Boolean));
    } else {
      const wdtNamed = await WDTSubmission.distinct('employee.employeeId', { 'employee.name': { $not: /^vacant$/i } });
      totalEmployees = wdtNamed.length > 0 ? wdtNamed.length : await User.countDocuments({ role: 'employee', isActive: true, isArchivedDemo: { $ne: true } });
      operationalEmpIdSet = new Set(wdtNamed.map(String));
    }

    const fitments = await Fitment.find({}).sort({ weightedScore: -1 }).lean();

    const userMap = new Map(
      (
        await User.find({ role: 'employee' })
          .select('employeeId name designation band department')
          .lean()
      ).map((u) => [u.employeeId, u])
    );

    const profilesWithUser = fitments.map((item) => {
      const user = userMap.get(item.employeeId) || {};
      const isOperational = operationalEmpIdSet.has(String(item.employeeId || '').trim());
      return {
        employeeId: item.employeeId,
        name: user.name || item.employeeId,
        designation: user.designation || '',
        band: user.band || '',
        department: user.department || '',
        weightedScore: safeNumber(item.weightedScore),
        fitmentLabel: item.fitmentLabel || 'UNFIT',
        lastEvaluatedAt: item.lastEvaluatedAt || item.updatedAt || item.createdAt,
        isPilotAssessment: !isOperational,
        assessmentCategory: isOperational ? 'Operational Workforce' : 'Pilot Evaluation Record'
      };
    });

    const operationalProfiles = profilesWithUser.filter(p => !p.isPilotAssessment);
    const pilotProfiles = profilesWithUser.filter(p => p.isPilotAssessment);

    const operationalAssessedCount = operationalProfiles.length;
    const operationalCoveragePct = Number(toPercent(operationalAssessedCount, totalEmployees).toFixed(1));

    const activeListForCharts = operationalAssessedCount > 0 ? operationalProfiles : pilotProfiles;

    const avgWeightedScore = operationalAssessedCount
      ? Number((operationalProfiles.reduce((sum, item) => sum + safeNumber(item.weightedScore), 0) / operationalAssessedCount).toFixed(1))
      : (pilotProfiles.length ? Number((pilotProfiles.reduce((sum, item) => sum + safeNumber(item.weightedScore), 0) / pilotProfiles.length).toFixed(1)) : 0);

    const labelBreakdown = {
      fit: activeListForCharts.filter((item) => item.fitmentLabel === 'FIT').length,
      trainToFit: activeListForCharts.filter((item) => item.fitmentLabel === 'TRAIN TO FIT').length,
      unfit: activeListForCharts.filter((item) => item.fitmentLabel === 'UNFIT').length,
    };

    const scoreDistribution = [
      { label: '0-39', min: 0, max: 39 },
      { label: '40-64', min: 40, max: 64 },
      { label: '65-79', min: 65, max: 79 },
      { label: '80-100', min: 80, max: 100 },
    ].map((bucket) => ({
      label: bucket.label,
      count: activeListForCharts.filter((item) => {
        const score = safeNumber(item.weightedScore);
        return score >= bucket.min && score <= bucket.max;
      }).length,
    }));

    // By Label Detail
    const byLabelDetail = [
      {
        label: 'FIT',
        profiles: activeListForCharts.filter((item) => item.fitmentLabel === 'FIT'),
      },
      {
        label: 'TRAIN TO FIT',
        profiles: activeListForCharts.filter((item) => item.fitmentLabel === 'TRAIN TO FIT'),
      },
      {
        label: 'UNFIT',
        profiles: activeListForCharts.filter((item) => item.fitmentLabel === 'UNFIT'),
      },
    ];

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        profiles: operationalAssessedCount,
        totalEmployees,
        coveragePct: operationalCoveragePct,
        avgWeightedScore,
        labelBreakdown,
        operationalWorkforce: {
          totalEmployees,
          assessed: operationalAssessedCount,
          coveragePct: operationalCoveragePct,
          status: operationalAssessedCount === 0 ? 'Assessment Phase Pending (0% Verified Coverage)' : `${operationalCoveragePct}% Verified Coverage`
        },
        pilotAssessments: {
          totalCount: pilotProfiles.length,
          label: 'Sandbox / Pilot Baseline Records',
          notice: 'Historical pilot assessments performed during initial setup on sandbox accounts; kept separate from operational staff.'
        },
        evaluationStatus: operationalAssessedCount === 0
          ? 'Operational Assessment Phase Pending (0% Verified Coverage)'
          : (operationalAssessedCount < totalEmployees ? 'Partial Assessment in Progress' : 'Fully Evaluated'),
        dataNotice: operationalAssessedCount === 0
          ? `Institutional competency assessment is pending for active staff roster (0/${totalEmployees} evaluated). Displaying ${pilotProfiles.length} verified pilot baseline records separately.`
          : null,
      },
      charts: {
        scoreDistribution,
      },
      tabs: {
        byLabel: byLabelDetail,
        allProfiles: activeListForCharts.sort((a, b) => b.weightedScore - a.weightedScore),
        operationalProfiles: operationalProfiles.sort((a, b) => b.weightedScore - a.weightedScore),
        pilotProfiles: pilotProfiles.sort((a, b) => b.weightedScore - a.weightedScore),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getUtilizationAnalysisReport(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) return;

    const submissions = await getScopedSubmissions(req);
    const rows = flattenRows(submissions);

    const totalHours = rows.reduce((sum, row) => sum + row.monthlyHours, 0);
    const totalSubmissions = submissions.length;

    // By Frequency Detail
    const byFreqMap = new Map();
    rows.forEach((row) => {
      const current = byFreqMap.get(row.frequency) || { frequency: row.frequency, hours: 0, activityCount: 0 };
      current.hours += row.monthlyHours;
      current.activityCount += 1;
      byFreqMap.set(row.frequency, current);
    });

    const byFrequencyDetail = Array.from(byFreqMap.values())
      .map((item) => ({
        frequency: item.frequency,
        hours: Number(item.hours.toFixed(1)),
        activityCount: item.activityCount,
        fte: Number((item.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
      }))
      .sort((a, b) => b.hours - a.hours);

    // By Process Detail
    const byProcessMap = new Map();
    rows.forEach((row) => {
      const key = row.subProcess || row.process;
      const current = byProcessMap.get(key) || { process: key, hours: 0, activityCount: 0 };
      current.hours += row.monthlyHours;
      current.activityCount += 1;
      byProcessMap.set(key, current);
    });

    const byProcessDetail = Array.from(byProcessMap.values())
      .map((item) => ({
        process: item.process,
        hours: Number(item.hours.toFixed(1)),
        activityCount: item.activityCount,
        fte: Number((item.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
      }))
      .sort((a, b) => b.hours - a.hours);

    // By Employee Detail
    const byEmployeeMap = new Map();
    rows.forEach((row) => {
      const current = byEmployeeMap.get(row.employeeId) || {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        department: row.department,
        hours: 0,
        activityCount: 0,
      };
      current.hours += row.monthlyHours;
      current.activityCount += 1;
      byEmployeeMap.set(row.employeeId, current);
    });

    const byEmployeeDetail = Array.from(byEmployeeMap.values())
      .map((item) => ({
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        department: item.department,
        hours: Number(item.hours.toFixed(1)),
        fte: Number((item.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        activityCount: item.activityCount,
      }))
      .sort((a, b) => b.hours - a.hours);

    // By Department Detail
    const byDeptMap = new Map();
    rows.forEach((row) => {
      const current = byDeptMap.get(row.department) || { department: row.department, hours: 0, submissionRefs: new Set() };
      current.hours += row.monthlyHours;
      current.submissionRefs.add(row.referenceId);
      byDeptMap.set(row.department, current);
    });

    const byDepartmentDetail = Array.from(byDeptMap.values())
      .map((item) => ({
        department: item.department,
        hours: Number(item.hours.toFixed(1)),
        fte: Number((item.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        submissionCount: item.submissionRefs.size,
      }))
      .sort((a, b) => b.hours - a.hours);

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalHours: Number(totalHours.toFixed(2)),
        totalSubmissions,
        totalFte: Number((totalHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        departments: byDepartmentDetail.length,
      },
      tabs: {
        byFrequency: byFrequencyDetail,
        byProcess: byProcessDetail,
        byEmployee: byEmployeeDetail,
        byDepartment: byDepartmentDetail,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getAuditLogs(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) {
      return;
    }

    const AuditLog = require('../models/AuditLog');
    const logs = await AuditLog.find({}).sort({ createdAt: -1 }).limit(100).lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = {
  getDashboardReport,
  getUtilizationReport,
  getFteSummaryReport,
  getFteConsolidationSummaryReport,
  getFitmentSummaryReport,
  getFteAnalysisReport,
  getConsolidationAnalysisReport,
  getFitmentAnalysisReport,
  getUtilizationAnalysisReport,
  getAuditLogs,
  flattenRows,
  safeNumber,
  invalidateScopedReportsCache,
};
