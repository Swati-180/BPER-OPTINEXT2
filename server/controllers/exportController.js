const ExcelJS = require('exceljs');
const WDTSubmission = require('../models/WDTSubmission');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');

const STANDARD_MONTHLY_HOURS = 160;

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

async function getScopedSubmissions(req) {
  const dept = req.query.department;
  const match = dept && dept !== 'All Departments' ? { 'employee.department': dept } : {};
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
        fte: Number((hours / STANDARD_MONTHLY_HOURS).toFixed(2)),
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
      const rows = Array.isArray(sub.payload?.rows) ? sub.payload.rows : [];
      rows.forEach(row => {
        const h = safeNumber(row.timeTakenHoursPerMonth);
        detailSheet.addRow({
          referenceId: sub.referenceId,
          name: sub.employee?.name || '',
          department: sub.employee?.department || '',
          majorProcess: row.majorProcess || '',
          process: row.process || '',
          subProcess: row.subProcess || '',
          category: row.activityCategory || 'core',
          frequency: row.frequency || '',
          volume: safeNumber(row.volumesMonthly),
          timeMins: safeNumber(row.timePerTransactionMinutes),
          hours: h,
          fte: Number((h / STANDARD_MONTHLY_HOURS).toFixed(3)),
          apps: row.applicationsUsed || '',
          comments: row.comments || '',
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
        const fte = data.hours / STANDARD_MONTHLY_HOURS;
        fteSheet.addRow({
          dept,
          hours: Number(data.hours.toFixed(1)),
          fte: Number(fte.toFixed(2)),
          subs: data.subs,
          util: Number(Math.min(100, fte * 100).toFixed(1)),
        });
      });
    autoWidth(fteSheet);

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
        const fte = h / STANDARD_MONTHLY_HOURS;
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
