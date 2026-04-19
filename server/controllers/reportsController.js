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

function buildScopeMatch(department) {
  if (!department || department === 'All Departments') return {};
  return { 'employee.department': department };
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
    const rows = Array.isArray(submission?.payload?.rows) ? submission.payload.rows : [];
    return rows.map((row) => ({
      referenceId: submission.referenceId,
      submittedAt: submission.submittedAt,
      status: submission.status,
      employeeId: submission.employee?.employeeId || 'NA',
      employeeName: submission.employee?.name || 'Unknown Employee',
      department: submission.employee?.department || 'Unassigned',
      tower: row.majorProcess || submission.employee?.department || 'Unassigned',
      majorProcess: row.majorProcess || 'Unspecified Process',
      process: row.process || 'Unspecified Process',
      subProcess: row.subProcess || 'Unspecified Activity',
      frequency: row.frequency || 'Unspecified',
      activityCategory: row.activityCategory || 'core',
      monthlyHours: safeNumber(row.timeTakenHoursPerMonth),
      comments: row.comments || '',
    }));
  });
}

function buildConsolidationSignal(row) {
  const comment = String(row.comments || '').toLowerCase();
  return (
    comment.includes('automation') ||
    comment.includes('rpa') ||
    comment.includes('repeat') ||
    row.monthlyHours >= 26
  );
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

async function getScopedSubmissions(req) {
  const { department } = req.query;
  const match = buildScopeMatch(department);
  return WDTSubmission.find(match).sort({ submittedAt: -1 }).lean();
}

async function getDashboardReport(req, res) {
  try {
    const requestUser = await resolveRequestUser(req);
    if (!ensureManager(requestUser.role, res)) return;

    const [submissions, totalEmployees] = await Promise.all([
      getScopedSubmissions(req),
      User.countDocuments({ role: 'employee', isActive: true }),
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
      .sort((a, b) => b.fte - a.fte)
      .slice(0, 5);

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

    const summary = {
      totalEmployees,
      totalSubmissions: submissions.length,
      pendingReview: pending,
      approved,
      changesRequested,
      totalHours: Number(totalHours.toFixed(1)),
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

    res.json({
      generatedAt: new Date().toISOString(),
      submissionWindow: getSubmissionWindowStatus(),
      summary,
      charts: {
        towerFte,
        topActivities,
        submissionStatusSegments,
        teamUtilization,
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
    const byEmployee = groupAndSort(rows, (row) => row.employeeName, (row) => row.monthlyHours, 8);

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

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalHours: Number(totalHours.toFixed(1)),
        totalSubmissions,
        avgHoursPerSubmission: Number((totalSubmissions ? totalHours / totalSubmissions : 0).toFixed(1)),
        approvalRatePct: Math.round(toPercent(approved, totalSubmissions)),
      },
      statusCounts: {
        approved,
        underReview,
        changesRequested,
      },
      coreSupport: {
        coreHours: Number(coreHours.toFixed(1)),
        supportHours: Number(supportHours.toFixed(1)),
        totalHours: Number((coreHours + supportHours).toFixed(1)),
      },
      charts: {
        byFrequency,
        byProcess,
        byEmployee,
        byDepartment,
      },
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
        totalHours: Number(totalHours.toFixed(1)),
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

    const submissions = await getScopedSubmissions(req);
    const rows = flattenRows(submissions);

    const candidateRows = rows.map((row) => {
      const consolidate = buildConsolidationSignal(row);
      const fte = row.monthlyHours / STANDARD_MONTHLY_HOURS;
      return {
        ...row,
        consolidate,
        fte,
      };
    });

    const consolidateActivities = candidateRows.filter((row) => row.consolidate);
    const savedFte = consolidateActivities.reduce((sum, row) => sum + row.fte * 0.35, 0);
    const estimatedSavingsCr = savedFte * 0.1;

    const byDepartmentMap = new Map();
    candidateRows.forEach((row) => {
      const current = byDepartmentMap.get(row.department) || {
        department: row.department,
        totalActivities: 0,
        consolidateActivities: 0,
        savedFte: 0,
      };
      current.totalActivities += 1;
      if (row.consolidate) {
        current.consolidateActivities += 1;
        current.savedFte += row.fte * 0.35;
      }
      byDepartmentMap.set(row.department, current);
    });

    const byDepartment = Array.from(byDepartmentMap.values())
      .map((item) => ({
        department: item.department,
        totalActivities: item.totalActivities,
        consolidateActivities: item.consolidateActivities,
        consolidationRatePct: Number(toPercent(item.consolidateActivities, item.totalActivities).toFixed(1)),
        savedFte: Number(item.savedFte.toFixed(2)),
      }))
      .sort((a, b) => b.savedFte - a.savedFte);

    const topConsolidationCandidates = consolidateActivities
      .map((row) => ({
        activityName: row.subProcess,
        tower: row.tower,
        department: row.department,
        monthlyHours: Number(row.monthlyHours.toFixed(1)),
        fte: Number(row.fte.toFixed(2)),
        savedFte: Number((row.fte * 0.35).toFixed(2)),
        trend: buildTrend(row),
      }))
      .sort((a, b) => b.savedFte - a.savedFte)
      .slice(0, 10);

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalActivities: candidateRows.length,
        consolidateActivities: consolidateActivities.length,
        consolidationRatePct: Number(toPercent(consolidateActivities.length, candidateRows.length).toFixed(1)),
        savedFte: Number(savedFte.toFixed(2)),
        estimatedSavingsCr: Number(estimatedSavingsCr.toFixed(2)),
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
    
    let totalEmployees = 0;
    if (employeeIdsScope) {
      totalEmployees = employeeIdsScope.length;
    } else {
      totalEmployees = await User.countDocuments({ role: 'employee', isActive: true });
    }

    const userMap = new Map(
      (
        await User.find({ role: 'employee' })
          .select('employeeId name designation band')
          .lean()
      ).map((u) => [u.employeeId, u])
    );

    const profiles = fitments.length;
    const avgWeightedScore = profiles
      ? Number((fitments.reduce((sum, item) => sum + safeNumber(item.weightedScore), 0) / profiles).toFixed(1))
      : 0;

    const labelBreakdown = {
      fit: fitments.filter((item) => item.fitmentLabel === 'FIT').length,
      trainToFit: fitments.filter((item) => item.fitmentLabel === 'TRAIN TO FIT').length,
      unfit: fitments.filter((item) => item.fitmentLabel === 'UNFIT').length,
    };

    const scoreDistribution = [
      { label: '0-39', min: 0, max: 39 },
      { label: '40-64', min: 40, max: 64 },
      { label: '65-79', min: 65, max: 79 },
      { label: '80-100', min: 80, max: 100 },
    ].map((bucket) => ({
      label: bucket.label,
      count: fitments.filter((item) => {
        const score = safeNumber(item.weightedScore);
        return score >= bucket.min && score <= bucket.max;
      }).length,
    }));

    const profilesWithUser = fitments.map((item) => {
      const user = userMap.get(item.employeeId) || {};
      return {
        employeeId: item.employeeId,
        name: user.name || item.employeeId,
        designation: user.designation || '',
        band: user.band || '',
        weightedScore: safeNumber(item.weightedScore),
        fitmentLabel: item.fitmentLabel || 'UNFIT',
        lastEvaluatedAt: item.lastEvaluatedAt || item.updatedAt || item.createdAt,
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        profiles,
        totalEmployees,
        coveragePct: Number(toPercent(profiles, totalEmployees).toFixed(1)),
        avgWeightedScore,
        labelBreakdown,
      },
      charts: {
        scoreDistribution,
      },
      tables: {
        topFitEmployees: profilesWithUser
          .filter((item) => item.fitmentLabel === 'FIT')
          .sort((a, b) => b.weightedScore - a.weightedScore)
          .slice(0, 10),
        lowFitEmployees: profilesWithUser
          .filter((item) => item.fitmentLabel !== 'FIT')
          .sort((a, b) => a.weightedScore - b.weightedScore)
          .slice(0, 10),
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
        name: row.subProcess,
        tower: row.tower,
        department: row.department,
        process: row.process,
        frequency: row.frequency,
        monthlyHours: Number(row.monthlyHours.toFixed(1)),
        fte: Number((row.monthlyHours / STANDARD_MONTHLY_HOURS).toFixed(2)),
        activityCategory: row.activityCategory,
      }))
      .sort((a, b) => b.fte - a.fte);

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalHours: Number(totalHours.toFixed(1)),
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

    const submissions = await getScopedSubmissions(req);
    const rows = flattenRows(submissions);

    const candidateRows = rows.map((row) => {
      const consolidate = buildConsolidationSignal(row);
      const fte = row.monthlyHours / STANDARD_MONTHLY_HOURS;
      return {
        ...row,
        consolidate,
        fte,
      };
    });

    const consolidateActivities = candidateRows.filter((row) => row.consolidate);
    const savedFte = consolidateActivities.reduce((sum, row) => sum + row.fte * 0.35, 0);
    const estimatedSavingsCr = savedFte * 0.1;

    // By Department Detail
    const byDeptMap = new Map();
    candidateRows.forEach((row) => {
      const current = byDeptMap.get(row.department) || {
        department: row.department,
        totalActivities: 0,
        consolidateActivities: 0,
        savedFte: 0,
      };
      current.totalActivities += 1;
      if (row.consolidate) {
        current.consolidateActivities += 1;
        current.savedFte += row.fte * 0.35;
      }
      byDeptMap.set(row.department, current);
    });

    const byDepartmentDetail = Array.from(byDeptMap.values())
      .map((item) => ({
        department: item.department,
        totalActivities: item.totalActivities,
        consolidateActivities: item.consolidateActivities,
        consolidationRatePct: Number(toPercent(item.consolidateActivities, item.totalActivities).toFixed(1)),
        savedFte: Number(item.savedFte.toFixed(2)),
        estimatedSavingsCr: Number((item.savedFte * 0.1).toFixed(2)),
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
        savedFte: Number((row.fte * 0.35).toFixed(2)),
        estimatedSavingsCr: Number((row.fte * 0.35 * 0.1).toFixed(2)),
        consolidationSignal: row.consolidate ? 'Yes' : 'No',
        comment: row.comments,
      }))
      .sort((a, b) => b.savedFte - a.savedFte);

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalActivities: candidateRows.length,
        consolidateActivities: consolidateActivities.length,
        consolidationRatePct: Number(toPercent(consolidateActivities.length, candidateRows.length).toFixed(1)),
        savedFte: Number(savedFte.toFixed(2)),
        estimatedSavingsCr: Number(estimatedSavingsCr.toFixed(2)),
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

    const [fitments, totalEmployees] = await Promise.all([
      Fitment.find({}).sort({ weightedScore: -1 }).lean(),
      User.countDocuments({ role: 'employee', isActive: true }),
    ]);

    const userMap = new Map(
      (
        await User.find({ role: 'employee' })
          .select('employeeId name designation band department')
          .lean()
      ).map((u) => [u.employeeId, u])
    );

    const profiles = fitments.length;
    const avgWeightedScore = profiles
      ? Number((fitments.reduce((sum, item) => sum + safeNumber(item.weightedScore), 0) / profiles).toFixed(1))
      : 0;

    const labelBreakdown = {
      fit: fitments.filter((item) => item.fitmentLabel === 'FIT').length,
      trainToFit: fitments.filter((item) => item.fitmentLabel === 'TRAIN TO FIT').length,
      unfit: fitments.filter((item) => item.fitmentLabel === 'UNFIT').length,
    };

    const scoreDistribution = [
      { label: '0-39', min: 0, max: 39 },
      { label: '40-64', min: 40, max: 64 },
      { label: '65-79', min: 65, max: 79 },
      { label: '80-100', min: 80, max: 100 },
    ].map((bucket) => ({
      label: bucket.label,
      count: fitments.filter((item) => {
        const score = safeNumber(item.weightedScore);
        return score >= bucket.min && score <= bucket.max;
      }).length,
    }));

    const profilesWithUser = fitments.map((item) => {
      const user = userMap.get(item.employeeId) || {};
      return {
        employeeId: item.employeeId,
        name: user.name || item.employeeId,
        designation: user.designation || '',
        band: user.band || '',
        department: user.department || '',
        weightedScore: safeNumber(item.weightedScore),
        fitmentLabel: item.fitmentLabel || 'UNFIT',
        lastEvaluatedAt: item.lastEvaluatedAt || item.updatedAt || item.createdAt,
      };
    });

    // By Label Detail
    const byLabelDetail = [
      {
        label: 'FIT',
        profiles: profilesWithUser.filter((item) => item.fitmentLabel === 'FIT'),
      },
      {
        label: 'TRAIN TO FIT',
        profiles: profilesWithUser.filter((item) => item.fitmentLabel === 'TRAIN TO FIT'),
      },
      {
        label: 'UNFIT',
        profiles: profilesWithUser.filter((item) => item.fitmentLabel === 'UNFIT'),
      },
    ];

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        profiles,
        totalEmployees,
        coveragePct: Number(toPercent(profiles, totalEmployees).toFixed(1)),
        avgWeightedScore,
        labelBreakdown,
      },
      charts: {
        scoreDistribution,
      },
      tabs: {
        byLabel: byLabelDetail,
        allProfiles: profilesWithUser.sort((a, b) => b.weightedScore - a.weightedScore),
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
        totalHours: Number(totalHours.toFixed(1)),
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
};
