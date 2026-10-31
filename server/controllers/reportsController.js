const User = require('../models/User');
const WDTSubmission = require('../models/WDTSubmission');
const Fitment = require('../models/Fitment');
const ProcessAnalysis = require('../models/ProcessAnalysis');
const Taxonomy = require('../models/Taxonomy');

const { standardizeGrade, SYSTEM_TEST_ACCOUNT_IDS } = require('../utils/gradeStandardizer');
const { getEffectiveAssumptions, resolveReportParameters, registerReportCacheInvalidator } = require('../services/assumptionsService');

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
    'employee.employeeId': { $nin: SYSTEM_TEST_ACCOUNT_IDS },
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

    // 1. Check for standard payload.rows representation (excluding rejected custom activities)
    const payloadRows = Array.isArray(submission?.payload?.rows) ? submission.payload.rows : [];
    const validPayloadRows = payloadRows.filter(r => r && typeof r === 'object' && r.approvalStatus !== 'Rejected');

    const { standardizeGrade } = require('../utils/gradeStandardizer');
    const rawGrade = submission.employee?.grade || '';
    const originalGradeAtSubmission = submission.employee?.originalGradeAtSubmission || rawGrade;
    const employeeType = submission.employee?.employeeType || '';
    const standardizedGrade = submission.employee?.standardizedGradeAtSubmission || standardizeGrade(originalGradeAtSubmission, employeeType);
    const isVacant = String(defaultEmpName).toLowerCase() === 'vacant' || submission.employee?.isVacant === true;
    const occupancyStatus = isVacant ? 'Vacant' : 'Occupied';

    if (validPayloadRows.length > 0) {
      return validPayloadRows.map((row) => {
        const hours = safeNumber(row.timeTakenHoursPerMonth != null ? row.timeTakenHoursPerMonth : row.hours);
        const tower = row.tower || row.majorProcess || defaultDept;
        return {
          referenceId: submission.referenceId,
          batchId: submission.batchId,
          reportingPeriod: submission.reportingPeriod || `${submission.year || 2026}-${String(submission.month || 10).padStart(2, '0')}`,
          submittedAt: submission.submittedAt,
          status: submission.status,
          employeeId: row.employeeId || defaultEmpId,
          employeeName: row.employeeName || defaultEmpName,
          department: row.department || defaultDept,
          designation: submission.employee?.designation || '',
          grade: rawGrade,
          originalGradeAtSubmission,
          standardizedGrade,
          employeeType,
          occupancyStatus,
          isVacant,
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

function classifyScreeningSignals(row, screeningThresholdHours = 26, screeningKeywords = ['automation', 'rpa', 'repeat']) {
  const comment = String(row.comments || '').toLowerCase();
  const threshold = Number.isFinite(screeningThresholdHours) ? screeningThresholdHours : 26;
  const isHighVolume = row.monthlyHours >= threshold;
  const keywords = Array.isArray(screeningKeywords) && screeningKeywords.length > 0
    ? screeningKeywords
    : ['automation', 'rpa', 'repeat'];
  const hasKeyword = keywords.some(k => comment.includes(String(k).toLowerCase()));

  let screeningSignal = 'None';
  if (isHighVolume && hasKeyword) {
    screeningSignal = 'High Volume & Keyword';
  } else if (isHighVolume) {
    screeningSignal = `High Volume (>=${threshold}h)`;
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
  fitmentSummaryCache.clear();
}

// --- In-Memory Fitment Summary Cache with Request Coalescing & Race Guard ---
const fitmentSummaryCache = new Map();
let fitmentSummaryGeneration = 0;

function invalidateFitmentSummaryCache() {
  fitmentSummaryCache.clear();
  fitmentSummaryGeneration++;
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
    .select('referenceId batchId reportingPeriod importedAt submittedAt month year status totalHours pendingFrom employee.employeeId employee.name employee.email employee.department employee.designation employee.tower employee.grade employee.originalGradeAtSubmission employee.standardizedGradeAtSubmission employee.employeeType employee.occupancyStatus employee.isVacant payload.rows activities')
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
    
    // Sir's Rule: Exclude vacant positions from actual employee-level workload & utilization
    const staffedRows = rows.filter((row) => !row.isVacant);
    const vacantRows = rows.filter((row) => row.isVacant);

    const staffedHours = staffedRows.reduce((sum, row) => sum + row.monthlyHours, 0);
    const staffedFte = staffedHours / STANDARD_MONTHLY_HOURS;

    const vacantHours = vacantRows.reduce((sum, row) => sum + row.monthlyHours, 0);
    const vacantFte = vacantHours / STANDARD_MONTHLY_HOURS;

    const totalHours = staffedHours + vacantHours;
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

    // 1. Differentiate staffed/named vs vacant position submissions
    const staffedSubmissions = submissions.filter((s) => !s.employee?.isVacant && String(s.employee?.name).toLowerCase() !== 'vacant');
    const vacantSubmissions = submissions.filter((s) => s.employee?.isVacant === true || String(s.employee?.name).toLowerCase() === 'vacant');

    const uniqueNamedStaffIds = new Set(staffedSubmissions.map((s) => String(s.employee?.employeeId || '').trim()).filter(Boolean));
    const uniqueVacantIds = new Set(vacantSubmissions.map((s) => String(s.employee?.employeeId || '').trim()).filter(Boolean));

    const submissionNamedCount = uniqueNamedStaffIds.size;
    const submissionVacantCount = uniqueVacantIds.size;

    const approvedFilled = staffedSubmissions.filter((s) => s.status === 'Approved').length;
    const approvedVacant = vacantSubmissions.filter((s) => s.status === 'Approved').length;

    // 2. Roster counts: verify whether User collection contains a complete authoritative roster
    const [authoritativeRosterCount, rosterVacantCount] = await Promise.all([
      User.countDocuments({ role: 'employee', isActive: true, isRosterOnly: true, isArchivedDemo: { $ne: true } }),
      User.countDocuments({ role: 'position', isVacant: true }),
    ]);

    // An authoritative roster in User collection must be complete enough to represent the operational population
    const hasAuthoritativeRoster = authoritativeRosterCount >= submissionNamedCount && authoritativeRosterCount > 0;
    const finalRosterNamedStaffCount = hasAuthoritativeRoster
      ? await User.countDocuments({ role: 'employee', isActive: true, isArchivedDemo: { $ne: true } })
      : submissionNamedCount;
    const finalRosterVacantCount = hasAuthoritativeRoster ? rosterVacantCount : submissionVacantCount;

    const rawStaffedUtilizationPct = submissionNamedCount > 0
      ? Number(((staffedHours / (submissionNamedCount * STANDARD_MONTHLY_HOURS)) * 100).toFixed(1))
      : 0;
    const cappedStaffedUtilizationPct = Number(Math.min(100, rawStaffedUtilizationPct).toFixed(1));
    const targetHeadcount = 500;
    const workloadVsTargetPct = Number(((totalHours / (targetHeadcount * STANDARD_MONTHLY_HOURS)) * 100).toFixed(1)); // ~99.9%

    const summary = {
      totalEmployees: submissionNamedCount, // Real operational headcount (248)
      activeUserAccounts: totalEmployees, // Login accounts in DB (e.g. 8)
      hasAuthoritativeRoster,
      rosterSource: hasAuthoritativeRoster ? 'master_roster' : 'submission_workforce',
      totalStaff: submissionNamedCount,
      vacantPositions: finalRosterVacantCount,
      submissionParticipants: {
        namedStaff: submissionNamedCount,
        vacancies: submissionVacantCount,
        total: submissionNamedCount + submissionVacantCount,
      },
      totalSubmissions: submissions.length,
      pendingReview: pending,
      approved,
      approvedFilled,
      approvedVacant,
      changesRequested,
      // Staffed vs Vacant Workload Breakdown (Sir's Approved OptiNXT Rules)
      staffedHours: Number(staffedHours.toFixed(2)),
      staffedFte: Number(staffedFte.toFixed(2)), // 378.82
      vacantHours: Number(vacantHours.toFixed(2)),
      vacantFte: Number(vacantFte.toFixed(2)), // 120.64
      totalHours: Number(totalHours.toFixed(2)),
      totalFte: Number(totalFte.toFixed(2)), // 499.46 FTE
      primaryEmployeeFte: Number(staffedFte.toFixed(2)), // Sir's Rule: Primary FTE KPI is based strictly on 248 filled submissions
      // Problem 4(c) Approved Metrics: Raw staffed utilization & Workload vs Target
      staffedUtilizationPct: rawStaffedUtilizationPct, // 152.8%
      cappedStaffedUtilizationPct, // 100.0%
      avgUtilizationPct: rawStaffedUtilizationPct, // Uncapped actual percentage
      workloadVsTargetPct, // 99.9%
      inScopeTargetHeadcount: targetHeadcount, // Documented organizational target (500 HC / 499.46 FTE)
      totalTowersCount: towerFte.length, // 18 towers
      completeness: {
        inScopeHeadcount: targetHeadcount,
        totalSubmitted: submissions.length,
        filledSubmitted: submissionNamedCount,
        vacantSubmitted: submissionVacantCount,
        approvedFilled,
        approvedVacant,
        approvedTotal: approved,
        staffedFte: Number(staffedFte.toFixed(2)),
        vacantFte: Number(vacantFte.toFixed(2)),
        totalFte: Number(totalFte.toFixed(2)),
        staffedUtilizationPct: rawStaffedUtilizationPct,
        workloadVsTargetPct,
        baselineHoursPerMonth: STANDARD_MONTHLY_HOURS
      }
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

    const topActivitiesCount = topActivities.length;
    const topActivitiesPreview = topActivities.slice(0, 50);

    res.json({
      generatedAt: new Date().toISOString(),
      submissionWindow: getSubmissionWindowStatus(),
      summary,
      charts: {
        towerFte,
        topActivities: topActivitiesPreview,
        totalActivitiesCount: topActivitiesCount,
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
    // Track unique employee statuses for collection status (mutually exclusive per employee)
    const empStatusMap = new Map();
    submissions.forEach(sub => {
      const empId = sub.employee?.employeeId || sub.employee?.email || sub.referenceId;
      if (!empStatusMap.has(empId)) {
        empStatusMap.set(empId, sub.status);
      } else {
        // Prioritize Approved > Under Review > Changes Requested
        const existingStatus = empStatusMap.get(empId);
        if (sub.status === 'Approved') {
          empStatusMap.set(empId, 'Approved');
        } else if (sub.status === 'Under Review' && existingStatus !== 'Approved') {
          empStatusMap.set(empId, 'Under Review');
        }
      }
    });

    let approved = 0;
    let underReview = 0;
    let changesRequested = 0;
    empStatusMap.forEach(status => {
      if (status === 'Approved') approved++;
      else if (status === 'Under Review') underReview++;
      else if (status === 'Changes Requested') changesRequested++;
    });

    // Slide 1: WDT Scope Funnel Calculation
    const uniqueSubProcesses = new Set();
    const uniqueProcesses = new Set();
    const uniqueMajorProcesses = new Set();
    rows.forEach(r => {
      if (r.subProcess && r.subProcess !== 'Unspecified Activity') uniqueSubProcesses.add(r.subProcess);
      if (r.process && r.process !== 'Unspecified Process') uniqueProcesses.add(r.process);
      const major = r.majorProcess || r.tower;
      if (major && major !== 'Unassigned') uniqueMajorProcesses.add(major);
    });
    const scopeFunnel = {
      lineItemsCount: rows.length,
      subProcessesCount: uniqueSubProcesses.size,
      processesCount: uniqueProcesses.size,
      majorProcessesCount: uniqueMajorProcesses.size
    };

    // Slide 2: Global Collection Status Calculation
    const { department } = req.query;
    let userFilter = { role: 'employee', isActive: true, isArchivedDemo: { $ne: true } };
    if (department && department !== 'All Departments') {
      userFilter.department = department;
    }
    const rolesInScope = await User.countDocuments(userFilter);
    // When submissions exist (e.g. imported WDT submissions), the in-scope roster is at least the total submissions/employees in that scope
    const effectiveRolesInScope = Math.max(rolesInScope, totalSubmissions);
    const inProgressCount = changesRequested; // Submissions requiring revision or in active progress
    const yetToStartCount = Math.max(0, effectiveRolesInScope - (approved + underReview + inProgressCount));

    const collectionStatus = {
      rolesInScope: effectiveRolesInScope,
      approved: {
        count: approved,
        pct: Number(toPercent(approved, effectiveRolesInScope).toFixed(1))
      },
      awaitingApproval: {
        count: underReview,
        pct: Number(toPercent(underReview, effectiveRolesInScope).toFixed(1))
      },
      inProgress: {
        count: inProgressCount,
        pct: Number(toPercent(inProgressCount, effectiveRolesInScope).toFixed(1))
      },
      yetToStart: {
        count: yetToStartCount,
        pct: Number(toPercent(yetToStartCount, effectiveRolesInScope).toFixed(1))
      }
    };

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
        staffedHours: Number(namedRows.reduce((sum, r) => sum + r.monthlyHours, 0).toFixed(2)),
        staffedFte: Number((namedRows.reduce((sum, r) => sum + r.monthlyHours, 0) / STANDARD_MONTHLY_HOURS).toFixed(2)),
        vacantHours: Number(vacantTotalHours.toFixed(2)),
        vacantFte: Number((vacantTotalHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
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
      collectionStatus,
      scopeFunnel,
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

    // Retrieve saved organization-wide assumptions and resolve effective parameters
    const orgAssumptions = await getEffectiveAssumptions();
    const reportParams = resolveReportParameters(orgAssumptions, req.query, requestUser.role);
    const {
      efficiencyFactor,
      costPerFteLakhs,
      costPerFteCr,
      standardMonthlyHours,
      screeningThresholdHours,
      screeningKeywords,
      isWhatIfScenario,
      simulationOverrides
    } = reportParams;

    const submissions = await getScopedSubmissions(req);
    const rows = flattenRows(submissions);

    let highVolumeCount = 0;
    let keywordCount = 0;
    let overlapCount = 0;

    const candidateRows = rows.map((row) => {
      const signals = classifyScreeningSignals(row, screeningThresholdHours, screeningKeywords);
      const fte = row.monthlyHours / standardMonthlyHours;

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
    const candidateFte = candidateHours / standardMonthlyHours;
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
          standardMonthlyHours,
          screeningThresholdHours,
          screeningKeywords,
          isScenarioModel: true,
          isWhatIfScenario: !!isWhatIfScenario,
          simulationOverrides: simulationOverrides || {},
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
    const normalizedDept = (department && department !== 'All Departments')
      ? String(department).trim()
      : '__ALL__';

    const now = Date.now();
    const cached = fitmentSummaryCache.get(normalizedDept);
    if (cached && cached.expiresAt > now && cached.data) {
      return res.json(cached.data);
    }

    if (cached && cached.inFlightPromise) {
      const data = await cached.inFlightPromise;
      return res.json(data);
    }

    const computePromise = (async () => {
      let employeeIdsScope = null;
      if (normalizedDept !== '__ALL__') {
        employeeIdsScope = await WDTSubmission.distinct('employee.employeeId', { 'employee.department': normalizedDept });
      }

      const fitmentQuery = {};
      if (employeeIdsScope) {
        fitmentQuery.employeeId = { $in: employeeIdsScope };
      }

      // Parallelize independent queries: Fitment query, User details lookup, and workforce calculation
      const fitmentsPromise = Fitment.find(fitmentQuery).sort({ weightedScore: -1 }).lean();
      const userMapPromise = User.find({ role: 'employee' })
        .select('employeeId name designation band')
        .lean()
        .then((users) => new Map(users.map((u) => [u.employeeId, u])));

      const workforcePromise = (async () => {
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
        return { totalEmployees, operationalEmpIdSet };
      })();

      const [fitments, userMap, { totalEmployees, operationalEmpIdSet }] = await Promise.all([
        fitmentsPromise,
        userMapPromise,
        workforcePromise,
      ]);

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

      return {
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
      };
    })();

    const requestGeneration = fitmentSummaryGeneration;

    fitmentSummaryCache.set(normalizedDept, {
      inFlightPromise: computePromise,
      generation: requestGeneration,
    });

    try {
      const result = await computePromise;
      // Race guard: only populate cache if no invalidation happened during execution
      if (fitmentSummaryGeneration === requestGeneration) {
        fitmentSummaryCache.set(normalizedDept, {
          data: result,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      }
      return res.json(result);
    } catch (err) {
      if (fitmentSummaryGeneration === requestGeneration) {
        fitmentSummaryCache.delete(normalizedDept);
      }
      throw err;
    }
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

    const includeActivities = req.query.includeActivities === 'true' || req.query.allActivities === 'true';
    const isExport = req.query.export === 'true';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 50));
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
    const towerFilter = req.query.tower ? String(req.query.tower).trim() : '';
    const processFilter = req.query.process ? String(req.query.process).trim() : '';
    const subProcessFilter = req.query.subProcess ? String(req.query.subProcess).trim() : '';

    let activitiesResult = [];
    let activitiesPagination = null;

    if (includeActivities || isExport) {
      let filteredRows = rows;
      if (towerFilter) {
        filteredRows = filteredRows.filter(r => r.tower === towerFilter);
      }
      if (processFilter) {
        filteredRows = filteredRows.filter(r => (r.process || r.name) === processFilter);
      }
      if (subProcessFilter) {
        filteredRows = filteredRows.filter(r => (r.subProcess && r.subProcess !== 'Unspecified Activity' ? r.subProcess : '') === subProcessFilter);
      }
      if (search) {
        filteredRows = filteredRows.filter(r =>
          String(r.process || '').toLowerCase().includes(search) ||
          String(r.subProcess || '').toLowerCase().includes(search)
        );
      }

      const totalFiltered = filteredRows.length;

      const mappedActivities = filteredRows
        .map((row) => ({
          name: row.process || row.subProcess,
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

      if (isExport) {
        activitiesResult = mappedActivities;
        activitiesPagination = {
          page: 1,
          limit: totalFiltered,
          total: totalFiltered,
          totalPages: 1
        };
      } else {
        const startIndex = (page - 1) * limit;
        activitiesResult = mappedActivities.slice(startIndex, startIndex + limit);
        activitiesPagination = {
          page,
          limit,
          total: totalFiltered,
          totalPages: Math.ceil(totalFiltered / limit) || 1
        };
      }
    }

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
        allActivities: activitiesResult,
        pagination: activitiesPagination
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

    // Retrieve saved organization-wide assumptions and resolve effective parameters
    const orgAssumptions = await getEffectiveAssumptions();
    const reportParams = resolveReportParameters(orgAssumptions, req.query, requestUser.role);
    const {
      efficiencyFactor,
      costPerFteLakhs,
      costPerFteCr,
      standardMonthlyHours,
      screeningThresholdHours,
      screeningKeywords,
      isWhatIfScenario,
      simulationOverrides
    } = reportParams;

    const submissions = await getScopedSubmissions(req);
    const rows = flattenRows(submissions);

    let highVolumeCount = 0;
    let keywordCount = 0;
    let overlapCount = 0;

    const candidateRows = rows.map((row) => {
      const signals = classifyScreeningSignals(row, screeningThresholdHours, screeningKeywords);
      const fte = row.monthlyHours / standardMonthlyHours;

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
    const candidateFte = candidateHours / standardMonthlyHours;
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

    // Consolidation Candidates Detail: Filter exclusively to screened candidates meeting criteria (consolidate === true)
    // and provide dual activityName/name mapping for full compatibility with both DeepAnalysis and ConsolidationAnalysis.
    const allCandidates = candidateRows
      .filter((row) => row.consolidate)
      .map((row) => ({
        name: row.subProcess,
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
        comment: row.comments || '',
      }))
      .sort((a, b) => b.monthlyHours - a.monthlyHours);

    // 6x6 PAM Integration for Official Consolidation (Phase 1 verified rules)
    const pamRecords = await ProcessAnalysis.find({}).lean();
    const pamMap = new Map();
    pamRecords.forEach(p => {
      const pKey = `${p.department || ''}:::${p.process || ''}`;
      // p.consolidated is boolean or null (Pending Assessment)
      pamMap.set(pKey, p.consolidated);
      // also fallback by process name
      if (!pamMap.has(p.process)) pamMap.set(p.process, p.consolidated);
    });

    // Build Slide 10: Consolidation potential by Major Process
    // and Slides 32, 34, 36, 38, 40, 42, 44, 46, 48: Effort splits with cumulative Pareto
    const majorProcessMap = new Map();
    const processSubMap = new Map(); // key: majorProcess ::: process
    const empMajorHoursMap = new Map(); // key: employeeId ::: majorProcess
    const empMajorConsolHoursMap = new Map(); // key: employeeId ::: majorProcess

    let totalPamConsolidatableHours = 0;
    let totalPamRetainedHours = 0;
    let totalPamPendingHours = 0;
    let totalPamConsolidatableCount = 0;
    let totalPamRetainedCount = 0;
    let totalPamPendingCount = 0;

    rows.forEach((row) => {
      const major = row.majorProcess || row.tower || 'Unspecified';
      const proc = row.process && row.process !== 'Unspecified Process' ? row.process : (row.subProcess || 'Unspecified');
      const pamStatus = pamMap.get(`${row.department}:::${row.subProcess}`) ?? pamMap.get(row.subProcess) ?? null;
      const hours = row.monthlyHours || 0;
      const fte = hours / STANDARD_MONTHLY_HOURS;

      // Track by Major Process
      const currentMajor = majorProcessMap.get(major) || {
        majorProcess: major,
        totalHours: 0,
        totalFte: 0,
        consolidatableHours: 0,
        consolidatableFte: 0,
        retainedHours: 0,
        retainedFte: 0,
        pendingAssessmentHours: 0,
        pendingAssessmentFte: 0,
        activityCount: 0,
        consolidatableActivitiesCount: 0,
        retainedActivitiesCount: 0,
        pendingActivitiesCount: 0,
      };
      currentMajor.totalHours += hours;
      currentMajor.totalFte += fte;
      currentMajor.activityCount += 1;

      if (pamStatus === true) {
        currentMajor.consolidatableHours += hours;
        currentMajor.consolidatableFte += fte;
        currentMajor.consolidatableActivitiesCount += 1;
        totalPamConsolidatableHours += hours;
        totalPamConsolidatableCount += 1;
      } else if (pamStatus === false) {
        currentMajor.retainedHours += hours;
        currentMajor.retainedFte += fte;
        currentMajor.retainedActivitiesCount += 1;
        totalPamRetainedHours += hours;
        totalPamRetainedCount += 1;
      } else {
        // Explicitly Pending Assessment - do NOT classify as retained!
        currentMajor.pendingAssessmentHours += hours;
        currentMajor.pendingAssessmentFte += fte;
        currentMajor.pendingActivitiesCount += 1;
        totalPamPendingHours += hours;
        totalPamPendingCount += 1;
      }
      majorProcessMap.set(major, currentMajor);

      // Track process-level within Major Process (Slides 11, 13, 15, etc.)
      const procKey = `${major}:::${proc}`;
      const currentProc = processSubMap.get(procKey) || {
        majorProcess: major,
        process: proc,
        totalHours: 0,
        totalFte: 0,
        consolidatableFte: 0,
        retainedFte: 0,
        pendingFte: 0,
      };
      currentProc.totalHours += hours;
      currentProc.totalFte += fte;
      if (pamStatus === true) {
        currentProc.consolidatableFte += fte;
      } else if (pamStatus === false) {
        currentProc.retainedFte += fte;
      } else {
        currentProc.pendingFte += fte;
      }
      processSubMap.set(procKey, currentProc);

      // Track per-employee major process dedication (Slides 12, 14, 16, etc.)
      const empId = row.employeeId || 'NA';
      const empMajorKey = `${empId}:::${major}`;
      empMajorHoursMap.set(empMajorKey, (empMajorHoursMap.get(empMajorKey) || 0) + hours);
      if (pamStatus === true) {
        empMajorConsolHoursMap.set(empMajorKey, (empMajorConsolHoursMap.get(empMajorKey) || 0) + hours);
      }
    });

    // Total employee hours lookup across all activities
    const empTotalHoursMap = new Map();
    rows.forEach(r => {
      const empId = r.employeeId || 'NA';
      empTotalHoursMap.set(empId, (empTotalHoursMap.get(empId) || 0) + r.monthlyHours);
    });

    // Format Slide 10: Major Process Consolidation View
    const majorProcessConsolidation = Array.from(majorProcessMap.values())
      .map((item) => {
        const assessedFte = item.consolidatableFte + item.retainedFte;
        const consolPct = assessedFte > 0 ? Number(((item.consolidatableFte / assessedFte) * 100).toFixed(1)) : 0;
        return {
          majorProcess: item.majorProcess,
          totalHours: Number(item.totalHours.toFixed(2)),
          totalFte: Number(item.totalFte.toFixed(2)),
          consolidatableFte: Number(item.consolidatableFte.toFixed(2)),
          retainedFte: Number(item.retainedFte.toFixed(2)),
          pendingAssessmentFte: Number(item.pendingAssessmentFte.toFixed(2)),
          consolidationPct: consolPct,
          activityCount: item.activityCount,
          consolidatableActivitiesCount: item.consolidatableActivitiesCount,
          retainedActivitiesCount: item.retainedActivitiesCount,
          pendingActivitiesCount: item.pendingActivitiesCount,
        };
      })
      .sort((a, b) => b.totalFte - a.totalFte);

    // Format Slides 11-30: Process Consolidation & Lift vs KT by Major Process
    const majorProcessLiftVsKt = {};
    const majorProcessDetail = {};

    Array.from(majorProcessMap.keys()).forEach(major => {
      // 1. Process-level drilldown (Slides 11, 13, 15, etc.)
      const procs = Array.from(processSubMap.values())
        .filter(p => p.majorProcess === major)
        .map(p => ({
          process: p.process,
          totalFte: Number(p.totalFte.toFixed(2)),
          consolidationPotential: Number(p.consolidatableFte.toFixed(2)),
          retained: Number(p.retainedFte.toFixed(2)),
          consolidationPct: p.totalFte > 0 ? Number(((p.consolidatableFte / p.totalFte) * 100).toFixed(1)) : 0
        }))
        .sort((a, b) => b.totalFte - a.totalFte);

      // Cumulative Pareto for Major Process (Slides 32, 34, 36, etc.)
      const totalMajorHours = procs.reduce((sum, p) => sum + p.totalFte, 0);
      let runningSum = 0;
      const procsWithPareto = procs.map(p => {
        runningSum += p.totalFte;
        const cumulativePct = totalMajorHours > 0 ? Number(((runningSum / totalMajorHours) * 100).toFixed(1)) : 0;
        return {
          ...p,
          cumulativePct,
          isTop80: cumulativePct <= 80 || (cumulativePct > 80 && runningSum - p.totalFte < totalMajorHours * 0.8)
        };
      });

      majorProcessDetail[major] = procsWithPareto;

      // 2. Lift & Shift vs KT Calculation (Slides 12, 14, 16, etc.)
      // Threshold: dedication >= 70% -> Lift & Shift, < 70% -> KT Required
      let liftAndShiftCount = 0;
      let ktRequiredCount = 0;
      let liftAndShiftFte = 0;
      let ktRequiredFte = 0;

      empTotalHoursMap.forEach((totalEmpHours, empId) => {
        const consolMajorHours = empMajorConsolHoursMap.get(`${empId}:::${major}`) || 0;
        const totalMajorHours = empMajorHoursMap.get(`${empId}:::${major}`) || 0;
        if (consolMajorHours > 0 && totalEmpHours > 0) {
          const dedicationRatio = consolMajorHours / totalEmpHours;
          const consolFte = consolMajorHours / STANDARD_MONTHLY_HOURS;
          if (dedicationRatio >= 0.70) {
            liftAndShiftCount += 1;
            liftAndShiftFte += consolFte;
          } else {
            ktRequiredCount += 1;
            ktRequiredFte += consolFte;
          }
        }
      });

      const totalEmployeesInMajor = liftAndShiftCount + ktRequiredCount;
      const liftPct = totalEmployeesInMajor > 0 ? Number(((liftAndShiftCount / totalEmployeesInMajor) * 100).toFixed(1)) : 0;
      const ktPct = totalEmployeesInMajor > 0 ? Number(((ktRequiredCount / totalEmployeesInMajor) * 100).toFixed(1)) : 0;

      majorProcessLiftVsKt[major] = {
        majorProcess: major,
        totalEmployees: totalEmployeesInMajor,
        liftAndShift: {
          count: liftAndShiftCount,
          pct: liftPct,
          fte: Number(liftAndShiftFte.toFixed(2))
        },
        ktRequired: {
          count: ktRequiredCount,
          pct: ktPct,
          fte: Number(ktRequiredFte.toFixed(2))
        }
      };
    });

    const totalPamAssessedHours = totalPamConsolidatableHours + totalPamRetainedHours;
    const officialPamSummary = {
      isAuditedPamBaseline: true,
      totalHours: Number((totalPamConsolidatableHours + totalPamRetainedHours + totalPamPendingHours).toFixed(2)),
      totalFte: Number(((totalPamConsolidatableHours + totalPamRetainedHours + totalPamPendingHours) / STANDARD_MONTHLY_HOURS).toFixed(2)),
      consolidatableHours: Number(totalPamConsolidatableHours.toFixed(2)),
      consolidatableFte: Number((totalPamConsolidatableHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
      consolidatableCount: totalPamConsolidatableCount,
      retainedHours: Number(totalPamRetainedHours.toFixed(2)),
      retainedFte: Number((totalPamRetainedHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
      retainedCount: totalPamRetainedCount,
      pendingAssessmentHours: Number(totalPamPendingHours.toFixed(2)),
      pendingAssessmentFte: Number((totalPamPendingHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
      pendingAssessmentCount: totalPamPendingCount,
      assessedConsolidationRatePct: totalPamAssessedHours > 0
        ? Number(((totalPamConsolidatableHours / totalPamAssessedHours) * 100).toFixed(1))
        : 0
    };

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
          standardMonthlyHours,
          screeningThresholdHours,
          screeningKeywords,
          isScenarioModel: true,
          isWhatIfScenario: !!isWhatIfScenario,
          simulationOverrides: simulationOverrides || {},
          notice: 'Screened candidate activities and efficiency figures represent hypothetical planning scenarios, not audited realized savings.'
        }
      },
      officialPamSummary,
      tabs: {
        byDepartment: byDepartmentDetail,
        allCandidates,
      },
      // Slide 10: Consolidation potential by major process
      majorProcessConsolidation,
      // Slides 11-30: Paired process consolidation & Lift vs KT analysis
      majorProcessLiftVsKt,
      // Slides 32-48: Process-level effort splits with Pareto cumulative tracking
      majorProcessDetail,
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

async function getWorkforceCapacityReport(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) return;

    const { gradePerspective = 'historical' } = req.query; // 'historical' (default) or 'current'
    const submissions = await getScopedSubmissions(req);
    const rows = flattenRows(submissions);

    // Fetch user map for live current grades if requested
    const userMap = new Map(
      (
        await User.find({ role: { $in: ['employee', 'position'] } })
          .select('employeeId name designation band department isVacant')
          .lean()
      ).map((u) => [String(u.employeeId || '').trim(), u])
    );

    const { standardizeGrade, ORDERED_GRADE_BANDS } = require('../utils/gradeStandardizer');

    // Verified October 2026 source contract resources whose employeeType was omitted in historical DB import
    const OCT_2026_VERIFIED_CONTRACT_IDS = new Set(['14406', '35781', '67815', '85047']);

    // Categorize rows into Staffed (Occupied) vs Vacant
    const staffedRows = [];
    const vacantRows = [];

    rows.forEach((r) => {
      const cleanEmpId = String(r.employeeId || '').trim();
      const cleanEmpName = String(r.employeeName || '').trim().toLowerCase();
      const liveUser = userMap.get(cleanEmpId);

      // Reporting-layer reconciliation: For verified October 2026 source contractors, supply 'Contract'
      // if and only if employeeType is missing in the database document. All other NA grades without
      // explicit contract type remain strictly 'Unmapped'.
      const isOct2026Dataset = r.reportingPeriod === '2026-10' || (r.referenceId && r.referenceId.startsWith('WDT-2026-10-EMP'));
      let effectiveEmployeeType = r.employeeType;
      if (!effectiveEmployeeType && isOct2026Dataset && OCT_2026_VERIFIED_CONTRACT_IDS.has(cleanEmpId)) {
        effectiveEmployeeType = 'Contract';
      }

      // Determine effective grade based on requested perspective (Default = Option A: submission-time grade)
      let effectiveGrade = r.originalGradeAtSubmission || r.grade;
      let effectiveStandardizedBand = standardizeGrade(effectiveGrade, effectiveEmployeeType);
      
      if (gradePerspective === 'current' && liveUser && liveUser.band) {
        effectiveGrade = liveUser.band;
        effectiveStandardizedBand = standardizeGrade(liveUser.band, effectiveEmployeeType);
      }

      const enhancedRow = {
        ...r,
        employeeType: effectiveEmployeeType,
        effectiveGrade,
        effectiveStandardizedBand,
        currentGrade: liveUser ? liveUser.band : null,
      };

      if (r.isVacant) {
        vacantRows.push(enhancedRow);
      } else {
        staffedRows.push(enhancedRow);
      }
    });

    // Helper: Aggregate by Standardized Grade Band
    const buildBandDistribution = (itemRows) => {
      const bandMap = new Map();
      ORDERED_GRADE_BANDS.forEach((band) => {
        bandMap.set(band, { band, hours: 0, fte: 0, headcount: new Set() });
      });

      itemRows.forEach((r) => {
        const bandKey = r.effectiveStandardizedBand || 'Unmapped';
        const current = bandMap.get(bandKey) || { band: bandKey, hours: 0, fte: 0, headcount: new Set() };
        current.hours += r.monthlyHours;
        if (r.employeeId && r.employeeId !== 'NA') current.headcount.add(r.employeeId);
        bandMap.set(bandKey, current);
      });

      return Array.from(bandMap.values()).map((b) => ({
        band: b.band,
        hours: Number(b.hours.toFixed(1)),
        fte: Number((b.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        headcount: b.headcount.size,
      }));
    };

    // Helper: Aggregate by Department
    const buildDeptDistribution = (itemRows) => {
      const deptMap = new Map();
      itemRows.forEach((r) => {
        const dept = r.department || 'Unassigned';
        const current = deptMap.get(dept) || { department: dept, hours: 0, fte: 0, headcount: new Set() };
        current.hours += r.monthlyHours;
        if (r.employeeId && r.employeeId !== 'NA') current.headcount.add(r.employeeId);
        deptMap.set(dept, current);
      });

      return Array.from(deptMap.values()).map((d) => ({
        department: d.department,
        hours: Number(d.hours.toFixed(1)),
        fte: Number((d.hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        headcount: d.headcount.size,
      })).sort((a, b) => b.hours - a.hours);
    };

    // VIEW A: Actual Workforce (Occupied positions only, staffed workload & FTE contribution)
    const staffedEmpMap = new Map();
    staffedRows.forEach((r) => {
      const empKey = r.employeeId || r.employeeName;
      const current = staffedEmpMap.get(empKey) || {
        employeeId: r.employeeId,
        name: r.employeeName,
        department: r.department,
        designation: r.designation,
        originalGradeAtSubmission: r.originalGradeAtSubmission,
        standardizedGrade: r.effectiveStandardizedBand,
        currentGrade: r.currentGrade,
        monthlyHours: 0,
        activityCount: 0,
      };
      current.monthlyHours += r.monthlyHours;
      current.activityCount += 1;
      staffedEmpMap.set(empKey, current);
    });

    const staffedEmployees = Array.from(staffedEmpMap.values()).map((e) => ({
      ...e,
      monthlyHours: Number(e.monthlyHours.toFixed(1)),
      fte: Number((e.monthlyHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
      utilizationPct: Number(Math.min(100, (e.monthlyHours / STANDARD_MONTHLY_HOURS) * 100).toFixed(1)),
    })).sort((a, b) => b.monthlyHours - a.monthlyHours);

    const totalStaffedHours = staffedRows.reduce((sum, r) => sum + r.monthlyHours, 0);
    const viewA_ActualWorkforce = {
      summary: {
        occupiedHeadcount: staffedEmployees.length,
        staffedHours: Number(totalStaffedHours.toFixed(2)),
        staffedFte: Number((totalStaffedHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        avgUtilizationPct: Number(
          (staffedEmployees.length > 0 ? (totalStaffedHours / (staffedEmployees.length * STANDARD_MONTHLY_HOURS)) * 100 : 0).toFixed(1)
        ),
      },
      byGradeBand: buildBandDistribution(staffedRows),
      byDepartment: buildDeptDistribution(staffedRows),
      employees: staffedEmployees,
    };

    // VIEW B: Vacancy & Capacity Planning (Vacant positions, grade bands, departments, planned FTE requirements)
    const vacantPosMap = new Map();
    vacantRows.forEach((r) => {
      const posKey = r.employeeId || `VAC-${vacantPosMap.size + 1}`;
      const current = vacantPosMap.get(posKey) || {
        positionId: r.employeeId,
        title: r.designation || 'Vacant Position',
        department: r.department,
        grade: r.originalGradeAtSubmission || r.grade,
        standardizedGradeBand: r.effectiveStandardizedBand,
        plannedHours: 0,
        activityCount: 0,
      };
      current.plannedHours += r.monthlyHours;
      current.activityCount += 1;
      vacantPosMap.set(posKey, current);
    });

    const vacantPositionsList = Array.from(vacantPosMap.values()).map((p) => ({
      ...p,
      plannedHours: Number(p.plannedHours.toFixed(1)),
      plannedFte: Number((p.plannedHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
    })).sort((a, b) => b.plannedHours - a.plannedHours);

    const totalVacantHours = vacantRows.reduce((sum, r) => sum + r.monthlyHours, 0);
    const viewB_VacancyCapacityPlanning = {
      summary: {
        vacantPositionsCount: vacantPositionsList.length,
        plannedWorkloadHours: Number(totalVacantHours.toFixed(2)),
        plannedCapacityFte: Number((totalVacantHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
      },
      byGradeBand: buildBandDistribution(vacantRows),
      byDepartment: buildDeptDistribution(vacantRows),
      positions: vacantPositionsList,
    };

    // VIEW C: Workforce Gap Analysis (Compare current staffed capacity with required capacity)
    const availableStaffedCapacityHours = staffedEmployees.length * STANDARD_MONTHLY_HOURS;
    const availableStaffedCapacityFte = staffedEmployees.length;
    const requiredCapacityHours = totalStaffedHours + totalVacantHours;
    const requiredCapacityFte = Number((requiredCapacityHours / STANDARD_MONTHLY_HOURS).toFixed(2));
    const netGapHours = Number((requiredCapacityHours - availableStaffedCapacityHours).toFixed(2));
    const netGapFte = Number((netGapHours / STANDARD_MONTHLY_HOURS).toFixed(2));

    // Department level Gap Matrix
    const allDepts = Array.from(new Set([...rows.map((r) => r.department || 'Unassigned')]));
    const departmentGapMatrix = allDepts.map((dept) => {
      const deptStaffed = staffedRows.filter((r) => (r.department || 'Unassigned') === dept);
      const deptVacant = vacantRows.filter((r) => (r.department || 'Unassigned') === dept);

      const deptStaffedEmps = new Set(deptStaffed.map((r) => r.employeeId)).size;
      const deptStaffedHours = deptStaffed.reduce((sum, r) => sum + r.monthlyHours, 0);
      const deptVacantHours = deptVacant.reduce((sum, r) => sum + r.monthlyHours, 0);
      const deptAvailableHours = deptStaffedEmps * STANDARD_MONTHLY_HOURS;
      const deptRequiredHours = deptStaffedHours + deptVacantHours;

      return {
        department: dept,
        staffedHeadcount: deptStaffedEmps,
        availableCapacityFte: deptStaffedEmps,
        staffedWorkloadFte: Number((deptStaffedHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        vacantPlannedFte: Number((deptVacantHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        requiredTotalFte: Number((deptRequiredHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        gapFte: Number(((deptRequiredHours - deptAvailableHours) / STANDARD_MONTHLY_HOURS).toFixed(2)),
        status: deptRequiredHours > deptAvailableHours ? 'Capacity Deficit' : 'Balanced / Surplus',
      };
    }).sort((a, b) => b.gapFte - a.gapFte);

    // Grade Band level Gap Matrix
    const gradeBandGapMatrix = ORDERED_GRADE_BANDS.map((band) => {
      const bandStaffed = staffedRows.filter((r) => r.effectiveStandardizedBand === band);
      const bandVacant = vacantRows.filter((r) => r.effectiveStandardizedBand === band);

      const bandStaffedEmps = new Set(bandStaffed.map((r) => r.employeeId)).size;
      const bandStaffedHours = bandStaffed.reduce((sum, r) => sum + r.monthlyHours, 0);
      const bandVacantHours = bandVacant.reduce((sum, r) => sum + r.monthlyHours, 0);
      const bandAvailableHours = bandStaffedEmps * STANDARD_MONTHLY_HOURS;
      const bandRequiredHours = bandStaffedHours + bandVacantHours;

      return {
        gradeBand: band,
        staffedHeadcount: bandStaffedEmps,
        availableCapacityFte: bandStaffedEmps,
        staffedWorkloadFte: Number((bandStaffedHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        vacantPlannedFte: Number((bandVacantHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        requiredTotalFte: Number((bandRequiredHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        gapFte: Number(((bandRequiredHours - bandAvailableHours) / STANDARD_MONTHLY_HOURS).toFixed(2)),
        status: bandRequiredHours > bandAvailableHours ? 'Capacity Deficit' : 'Balanced / Surplus',
      };
    });

    const viewC_WorkforceGapAnalysis = {
      summary: {
        occupiedHeadcount: staffedEmployees.length,
        availableStaffedCapacityFte,
        requiredCapacityFte,
        netGapFte,
        deficitNotice: netGapFte > 0 ? 'Deficit indicates unassigned vacancy workload requiring redistribution, automation, or staffing' : 'Workforce capacity is sufficient',
      },
      departmentGapMatrix,
      gradeBandGapMatrix,
    };

    res.json({
      generatedAt: new Date().toISOString(),
      gradePerspective,
      actualWorkforce: viewA_ActualWorkforce,
      vacancyCapacityPlanning: viewB_VacancyCapacityPlanning,
      workforceGapAnalysis: viewC_WorkforceGapAnalysis,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// Register reports cache invalidator with assumptionsService
registerReportCacheInvalidator(invalidateScopedReportsCache);

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
  getWorkforceCapacityReport,
  getAuditLogs,
  buildScopeMatch,
  flattenRows,
  safeNumber,
  invalidateScopedReportsCache,
  invalidateFitmentSummaryCache,
};
