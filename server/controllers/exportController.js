const ExcelJS = require('exceljs');
const WDTSubmission = require('../models/WDTSubmission');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const { getEffectiveAssumptions } = require('../services/assumptionsService');

const DEFAULT_STANDARD_MONTHLY_HOURS = 160;

function safeNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
}

function headerStyle(bold = true, bgColor = 'FF1E4080') {
  return {
    font: { bold, color: { argb: 'FFFFFFFF' }, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
    border: { bottom: { style: 'thin', color: { argb: 'FFCDD5E0' } } }
  };
}

function subHeaderStyle() {
  return {
    font: { bold: true, color: { argb: 'FF1E3A5F' }, size: 9 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } },
    alignment: { vertical: 'middle', horizontal: 'center' },
  };
}

function numStyle(decimal = 1) {
  return { numFmt: `0.${'0'.repeat(decimal)}`, alignment: { horizontal: 'center' } };
}

function autoWidth(worksheet) {
  worksheet.columns.forEach(col => {
    let max = col.header ? String(col.header).length : 10;
    col.eachCell?.({ includeEmpty: false }, cell => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > max) max = len;
    });
    col.width = Math.min(Math.max(max + 2, 10), 50);
  });
}

async function resolveManager(req) {
  const userId = req.user?.userId || req.user?.id;
  if (!userId) return null;
  try { return await User.findById(userId).select('role'); } catch { return null; }
}

const { SYSTEM_TEST_ACCOUNT_IDS } = require('../utils/gradeStandardizer');

async function getScopedSubmissions(req) {
  const { department, month, year } = req.query;
  const match = {
    month: month != null ? Number(month) : 10,
    year: year != null ? Number(year) : 2026,
    'employee.employeeId': { $nin: SYSTEM_TEST_ACCOUNT_IDS },
  };
  if (department && department !== 'All Departments') {
    match['employee.department'] = department;
  }
  return WDTSubmission.find(match).sort({ submittedAt: -1 }).lean();
}

/**
 * GET /api/export/wdt-submissions
 * Exports all WDT submissions with per-row activity detail to Excel.
 */
async function exportWDTSubmissionsExcel(req, res) {
  try {
    const manager = await resolveManager(req);
    if (!manager || (manager.role !== 'manager' && manager.role !== 'admin')) {
      return res.status(403).json({ message: 'Manager access required.' });
    }

    const assumptions = await getEffectiveAssumptions();
    const standardMonthlyHours = assumptions?.screeningSettings?.standardMonthlyHours || DEFAULT_STANDARD_MONTHLY_HOURS;

    const submissions = await getScopedSubmissions(req);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BPER Platform';
    workbook.created = new Date();

    // ─── Sheet 1: Summary ─────────────────────────────────────────────────────
    const summarySheet = workbook.addWorksheet('Submission Summary');
    summarySheet.columns = [
      { header: 'Reference ID', key: 'referenceId' },
      { header: 'Employee Name', key: 'name' },
      { header: 'Employee ID', key: 'employeeId' },
      { header: 'Department', key: 'department' },
      { header: 'Month', key: 'month' },
      { header: 'Year', key: 'year' },
      { header: 'Total Hours', key: 'totalHours' },
      { header: 'FTE', key: 'fte' },
      { header: 'Status', key: 'status' },
      { header: 'Submitted At', key: 'submittedAt' },
    ];
    summarySheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle()));
    summarySheet.getRow(1).height = 30;

    submissions.forEach(sub => {
      const hours = safeNumber(sub.totalHours);
      const row = summarySheet.addRow({
        referenceId: sub.referenceId,
        name: sub.employee?.name || '',
        employeeId: sub.employee?.employeeId || '',
        department: sub.employee?.department || '',
        month: sub.month,
        year: sub.year,
        totalHours: hours,
        fte: Number((hours / standardMonthlyHours).toFixed(2)),
        status: sub.status,
        submittedAt: formatDate(sub.submittedAt),
      });
      // Color status cell
      const statusCell = row.getCell('status');
      if (sub.status === 'Approved') {
        statusCell.font = { color: { argb: 'FF166534' }, bold: true };
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      } else if (sub.status === 'Changes Requested') {
        statusCell.font = { color: { argb: 'FF92400E' }, bold: true };
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      } else {
        statusCell.font = { color: { argb: 'FF1E40AF' }, bold: true };
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBF0FF' } };
      }
    });
    autoWidth(summarySheet);

    // ─── Sheet 2: Activity Detail ──────────────────────────────────────────────
    const detailSheet = workbook.addWorksheet('Activity Detail');
    detailSheet.columns = [
      { header: 'Reference ID', key: 'referenceId' },
      { header: 'Employee Name', key: 'name' },
      { header: 'Department', key: 'department' },
      { header: 'Major Process', key: 'majorProcess' },
      { header: 'Process', key: 'process' },
      { header: 'Sub-Process', key: 'subProcess' },
      { header: 'Category', key: 'category' },
      { header: 'Frequency', key: 'frequency' },
      { header: 'Volume/Month', key: 'volume' },
      { header: 'Time/Txn (min)', key: 'timeMins' },
      { header: 'Hours/Month', key: 'hours' },
      { header: 'FTE', key: 'fte' },
      { header: 'Applications', key: 'apps' },
      { header: 'Comments', key: 'comments' },
    ];
    detailSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle(true, 'FF0F2649')));
    detailSheet.getRow(1).height = 30;

    submissions.forEach(sub => {
      let rows = [];
      const payloadRows = Array.isArray(sub.payload?.rows) ? sub.payload.rows.filter(r => r && typeof r === 'object') : [];
      if (payloadRows.length > 0) {
        rows = payloadRows.map(row => ({
          majorProcess: row.majorProcess || row.tower || '',
          process: row.process || '',
          subProcess: row.subProcess || row.name || '',
          category: row.activityCategory || row.category || 'core',
          frequency: row.frequency || '',
          volume: safeNumber(row.volumesMonthly),
          timeMins: safeNumber(row.timePerTransactionMinutes),
          hours: safeNumber(row.timeTakenHoursPerMonth != null ? row.timeTakenHoursPerMonth : row.hours),
          apps: row.applicationsUsed || '',
          comments: row.comments || '',
        }));
      } else {
        const activities = Array.isArray(sub.activities) ? sub.activities.filter(a => a && typeof a === 'object') : [];
        if (activities.length > 0) {
          rows = activities.map(act => ({
            majorProcess: act.majorProcess || act.tower || '',
            process: act.process || '',
            subProcess: act.subProcess || act.name || '',
            category: act.activityCategory || act.category || 'core',
            frequency: act.frequency || '',
            volume: safeNumber(act.volumesMonthly),
            timeMins: safeNumber(act.timePerTransactionMinutes),
            hours: safeNumber(act.monthlyHours != null ? act.monthlyHours : (act.timeTakenHoursPerMonth != null ? act.timeTakenHoursPerMonth : act.hours)),
            apps: act.applicationsUsed || '',
            comments: act.comments || '',
          }));
        } else if (safeNumber(sub.totalHours) > 0) {
          rows = [{
            majorProcess: sub.employee?.department || 'Summary Process',
            process: 'Summary Process',
            subProcess: 'Summary Activity',
            category: 'core',
            frequency: 'Monthly',
            volume: 1,
            timeMins: 0,
            hours: safeNumber(sub.totalHours),
            apps: '',
            comments: 'Derived from summary record',
          }];
        }
      }

      rows.forEach(row => {
        detailSheet.addRow({
          referenceId: sub.referenceId,
          name: sub.employee?.name || '',
          department: sub.employee?.department || '',
          majorProcess: row.majorProcess,
          process: row.process,
          subProcess: row.subProcess,
          category: row.category,
          frequency: row.frequency,
          volume: row.volume,
          timeMins: row.timeMins,
          hours: row.hours,
          fte: Number((row.hours / standardMonthlyHours).toFixed(3)),
          apps: row.apps,
          comments: row.comments,
        });
      });
    });
    autoWidth(detailSheet);

    // ─── Sheet 3: FTE by Department ────────────────────────────────────────────
    const fteSheet = workbook.addWorksheet('FTE by Department');
    fteSheet.columns = [
      { header: 'Department', key: 'dept' },
      { header: 'Total Hours', key: 'hours' },
      { header: 'FTE', key: 'fte' },
      { header: 'Submissions', key: 'subs' },
      { header: 'Utilization %', key: 'util' },
    ];
    fteSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle(true, 'FF1E5EA9')));
    fteSheet.getRow(1).height = 30;

    const deptMap = new Map();
    submissions.forEach(sub => {
      const dept = sub.employee?.department || 'Unassigned';
      const rows = Array.isArray(sub.payload?.rows) ? sub.payload.rows : [];
      const hours = rows.reduce((s, r) => s + safeNumber(r.timeTakenHoursPerMonth), 0);
      const cur = deptMap.get(dept) || { hours: 0, subs: 0 };
      cur.hours += hours; cur.subs += 1;
      deptMap.set(dept, cur);
    });

    Array.from(deptMap.entries())
      .sort((a, b) => b[1].hours - a[1].hours)
      .forEach(([dept, data]) => {
        const fte = data.hours / standardMonthlyHours;
        fteSheet.addRow({
          dept,
          hours: Number(data.hours.toFixed(2)),
          fte: Number(fte.toFixed(2)),
          subs: data.subs,
          util: Number(Math.min(100, fte * 100).toFixed(1)),
        });
      });
    // ─── Sheet 4: 6x6 Process Assessment ──────────────────────────────────────
    const ProcessAnalysis = require('../models/ProcessAnalysis');
    const Taxonomy = require('../models/Taxonomy');
    const pamSheet = workbook.addWorksheet('6x6 Process Assessment');
    pamSheet.columns = [
      { header: 'Department', key: 'department' },
      { header: 'Major Process / Tower', key: 'tower' },
      { header: 'Process Group', key: 'subProcessGroup' },
      { header: 'Process / Activity Name', key: 'process' },
      { header: 'Type', key: 'type' },
      { header: 'Multiple Locns', key: 'c0' },
      { header: 'Routine', key: 'c1' },
      { header: 'Volumes', key: 'c2' },
      { header: 'Manpower', key: 'c3' },
      { header: 'SOPs', key: 'c4' },
      { header: 'ERP / Technology', key: 'c5' },
      { header: 'Sensitivity', key: 'c6' },
      { header: 'Criticality', key: 'c7' },
      { header: 'Controls', key: 'c8' },
      { header: 'Proximity', key: 'c9' },
      { header: 'Regulatory', key: 'c10' },
      { header: 'Skill', key: 'c11' },
      { header: 'Score (Max 12)', key: 'score' },
      { header: 'Assessment Status', key: 'status' },
      { header: 'Operational FTE', key: 'fte' },
    ];
    pamSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle(true, 'FF0F3860')));
    pamSheet.getRow(1).height = 30;

    // Load PAM records scoped by department
    let pamQuery = {};
    if (req.query.department && req.query.department !== 'All Departments') {
      pamQuery.department = req.query.department;
    }
    const pamRecords = await ProcessAnalysis.find(pamQuery).sort({ department: 1, process: 1 }).lean();
    const taxonomyList = await Taxonomy.find({}).lean();
    const taxMap = new Map();
    taxonomyList.forEach(t => {
      if (Array.isArray(t.subProcesses)) {
        t.subProcesses.forEach(sp => taxMap.set(`${t.department}:::${sp}`, t));
      }
      taxMap.set(`${t.department}:::${t.process}`, t);
    });

    // Compute operational FTE per activity from current scoped submissions
    // Rules:
    // 1. Strictly department-scoped (no global fallback to prevent cross-department leakage).
    // 2. Prefer granular activity identity (r.subProcess || r.name). Fallback to r.process ONLY if granular identity is absent.
    // 3. Each WDT row contributes to exactly one identity, preventing double-counting across parent/child PAM rows.
    // 4. Multiple submissions for the same activity aggregate correctly.
    // 5. If no reliable match exists, report 'Unavailable'.
    const activityFteMap = new Map(); // key: normDept:::normActivityName -> number
    const activityOccurredMap = new Map(); // key: normDept:::normActivityName -> boolean
    const normalizeKey = (str) => String(str || '').trim().toLowerCase();

    submissions.forEach(sub => {
      const dept = sub.employee?.department || 'Unassigned';
      const normDept = normalizeKey(dept);
      const payloadRows = Array.isArray(sub.payload?.rows) ? sub.payload.rows.filter(r => r && typeof r === 'object') : [];
      const actList = payloadRows.length > 0 ? payloadRows : (Array.isArray(sub.activities) ? sub.activities.filter(a => a && typeof a === 'object') : []);

      actList.forEach(r => {
        const hours = safeNumber(r.timeTakenHoursPerMonth != null ? r.timeTakenHoursPerMonth : (r.monthlyHours != null ? r.monthlyHours : r.hours));
        const fteContribution = hours / standardMonthlyHours;

        // Prefer granular subProcess or name; fall back to process only if granular name is missing/unspecified
        const granularName = r.subProcess || r.name;
        const fallbackName = (r.process && r.process !== 'Unspecified Process') ? r.process : null;
        const matchedName = granularName ? normalizeKey(granularName) : (fallbackName ? normalizeKey(fallbackName) : null);

        if (matchedName) {
          const keyWithDept = `${normDept}:::${matchedName}`;
          activityFteMap.set(keyWithDept, (activityFteMap.get(keyWithDept) || 0) + fteContribution);
          activityOccurredMap.set(keyWithDept, true);
        }
      });
    });

    pamRecords.forEach(rec => {
      const criteria = Array.isArray(rec.criteria) ? rec.criteria : Array(12).fill('-');
      const isAllPending = criteria.every(c => c === '-');
      const statusLabel = isAllPending ? 'Pending Assessment' : (rec.consolidated ? 'Consolidatable' : 'Retained');
      const taxKey = `${rec.department}:::${rec.process}`;
      const tax = taxMap.get(taxKey);

      const normDept = normalizeKey(rec.department);
      const normProc = normalizeKey(rec.process);
      const specificKey = `${normDept}:::${normProc}`;

      let fteDisplay = 'Unavailable';
      if (activityOccurredMap.has(specificKey)) {
        fteDisplay = Number((activityFteMap.get(specificKey) || 0).toFixed(3));
      }

      const row = pamSheet.addRow({
        department: rec.department,
        tower: tax?.majorProcess || 'General',
        subProcessGroup: tax?.process || '-',
        process: rec.process,
        type: rec.type || 'core',
        c0: criteria[0] || '-',
        c1: criteria[1] || '-',
        c2: criteria[2] || '-',
        c3: criteria[3] || '-',
        c4: criteria[4] || '-',
        c5: criteria[5] || '-',
        c6: criteria[6] || '-',
        c7: criteria[7] || '-',
        c8: criteria[8] || '-',
        c9: criteria[9] || '-',
        c10: criteria[10] || '-',
        c11: criteria[11] || '-',
        score: isAllPending ? 'Pending' : (rec.score != null ? rec.score : 0),
        status: statusLabel,
        fte: fteDisplay,
      });

      // Highlight status cell
      const statusCell = row.getCell('status');
      if (statusLabel === 'Consolidatable') {
        statusCell.font = { color: { argb: 'FF166534' }, bold: true };
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      } else if (statusLabel === 'Retained') {
        statusCell.font = { color: { argb: 'FF92400E' }, bold: true };
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      } else {
        statusCell.font = { color: { argb: 'FF4B5563' }, bold: false };
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      }
    });
    autoWidth(pamSheet);

    // ─── Output ────────────────────────────────────────────────────────────────
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bper-wdt-${dateStr}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Export] WDT submissions export error:', err);
    res.status(500).json({ message: err.message });
  }
}

/**
 * GET /api/export/fte-report
 * Exports FTE analysis to Excel.
 */
async function exportFTEReportExcel(req, res) {
  try {
    const manager = await resolveManager(req);
    if (!manager || (manager.role !== 'manager' && manager.role !== 'admin')) {
      return res.status(403).json({ message: 'Manager access required.' });
    }

    const assumptions = await getEffectiveAssumptions();
    const standardMonthlyHours = assumptions?.screeningSettings?.standardMonthlyHours || DEFAULT_STANDARD_MONTHLY_HOURS;

    const submissions = await getScopedSubmissions(req);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BPER Platform';
    workbook.created = new Date();

    // All activities
    const actSheet = workbook.addWorksheet('FTE Analysis');
    actSheet.columns = [
      { header: 'Employee', key: 'name' },
      { header: 'Department', key: 'dept' },
      { header: 'Tower / Major Process', key: 'tower' },
      { header: 'Process', key: 'process' },
      { header: 'Sub-Process', key: 'subProcess' },
      { header: 'Category', key: 'category' },
      { header: 'Hours/Month', key: 'hours' },
      { header: 'FTE', key: 'fte' },
      { header: 'FTE Band', key: 'band' },
    ];
    actSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle()));
    actSheet.getRow(1).height = 30;

    submissions.forEach(sub => {
      const rows = Array.isArray(sub.payload?.rows) ? sub.payload.rows : [];
      rows.forEach(row => {
        const h = safeNumber(row.timeTakenHoursPerMonth);
        const fte = h / standardMonthlyHours;
        const band = fte < 0.25 ? '0–0.25' : fte < 0.5 ? '0.25–0.5' : fte < 0.75 ? '0.5–0.75' : fte < 1.0 ? '0.75–1.0' : '1.0+';
        actSheet.addRow({
          name: sub.employee?.name || '',
          dept: sub.employee?.department || '',
          tower: row.majorProcess || '',
          process: row.process || '',
          subProcess: row.subProcess || '',
          category: row.activityCategory || 'core',
          hours: h,
          fte: Number(fte.toFixed(3)),
          band,
        });
      });
    });
    autoWidth(actSheet);

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bper-fte-${dateStr}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Export] FTE export error:', err);
    res.status(500).json({ message: err.message });
  }
}

module.exports = { exportWDTSubmissionsExcel, exportFTEReportExcel };
