import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, BriefcaseBusiness, Clock3, Filter, Layers3, Loader2, UserRound } from 'lucide-react';
import { getUtilizationReport } from '../../lib/api';
import { formatDateISO } from '../employee/bperSubmissionStorage';

type DepartmentFilter = 'All Departments' | string;

type UtilizationReport = {
  summary?: {
    totalHours?: number;
    totalSubmissions?: number;
    avgHoursPerSubmission?: number;
    approvalRatePct?: number;
  };
  statusCounts?: {
    approved?: number;
    underReview?: number;
    changesRequested?: number;
  };
  coreSupport?: {
    coreHours?: number;
    supportHours?: number;
    totalHours?: number;
  };
  charts?: {
    byFrequency?: Array<{ label: string; hours: number }>;
    byProcess?: Array<{ label: string; hours: number }>;
    byEmployee?: Array<{ label: string; hours: number }>;
    byDepartment?: Array<{ label: string; hours: number; fte: number; utilizationPct: number; submissionCount: number }>;
  };
  tables?: {
    recentSubmissions?: Array<{
      referenceId: string;
      employeeName: string;
      employeeId: string;
      department: string;
      totalHours: number;
      status: 'Under Review' | 'Approved' | 'Changes Requested';
      submittedAt: string;
    }>;
  };
};

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getStatusClass(status: 'Under Review' | 'Approved' | 'Changes Requested') {
  if (status === 'Approved') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'Changes Requested') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-blue-100 text-blue-700 border-blue-200';
}

export default function WDTAnalyticsPage() {
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>('All Departments');
  const [report, setReport] = useState<UtilizationReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReport(department: DepartmentFilter) {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getUtilizationReport(department);
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load utilization report.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReport(departmentFilter);
  }, [departmentFilter]);

  useEffect(() => {
    const refreshOnDataUpdate = () => {
      loadReport(departmentFilter);
    };

    const refreshInterval = window.setInterval(() => {
      loadReport(departmentFilter);
    }, 30000);

    window.addEventListener('bper:data-updated', refreshOnDataUpdate as EventListener);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener('bper:data-updated', refreshOnDataUpdate as EventListener);
    };
  }, [departmentFilter]);

  const summary = report?.summary || {};
  const statusCounts = report?.statusCounts || {};
  const coreSupport = report?.coreSupport || {};

  const byFrequency = Array.isArray(report?.charts?.byFrequency) ? report!.charts!.byFrequency! : [];
  const byProcess = Array.isArray(report?.charts?.byProcess) ? report!.charts!.byProcess! : [];
  const byEmployee = Array.isArray(report?.charts?.byEmployee) ? report!.charts!.byEmployee! : [];
  const byDepartment = Array.isArray(report?.charts?.byDepartment) ? report!.charts!.byDepartment! : [];
  const recentRecords = Array.isArray(report?.tables?.recentSubmissions) ? report!.tables!.recentSubmissions! : [];

  const departments = useMemo(() => {
    const options = byDepartment.map((item) => item.label).filter(Boolean);
    return ['All Departments', ...Array.from(new Set(options)).sort((a, b) => a.localeCompare(b))];
  }, [byDepartment]);

  const coreHours = safeNumber(coreSupport.coreHours);
  const supportHours = safeNumber(coreSupport.supportHours);
  const coreSupportTotal = safeNumber(coreSupport.totalHours) || coreHours + supportHours;
  const corePercent = coreSupportTotal === 0 ? 0 : (coreHours / coreSupportTotal) * 100;
  const supportPercent = coreSupportTotal === 0 ? 0 : (supportHours / coreSupportTotal) * 100;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-2xl border border-[#D9E4F2] bg-white">
        <Loader2 className="h-10 w-10 animate-spin text-[#1A5BA7]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          <div>
            <p className="text-sm font-semibold">Unable to load WDT analytics</p>
            <p className="mt-1 text-xs">{error}</p>
            <button
              type="button"
              onClick={() => loadReport(departmentFilter)}
              className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#0F2649]">WDT Analytics</h1>
            <p className="mt-1 text-sm text-[#637F9F]">
              {safeNumber(summary.totalHours).toFixed(1)} total hours across {safeNumber(summary.totalSubmissions)} submissions
            </p>
          </div>

          <label className="relative w-full md:w-72">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8CA0BA]" />
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#D6E2F0] bg-white pl-10 pr-3 text-sm font-medium text-[#243A59] outline-none focus:border-[#6E97CB] focus:ring-2 focus:ring-[#D7E6F7]"
            >
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Clock3} label="Total Hours" value={safeNumber(summary.totalHours).toFixed(1)} helper="Tracked WDT hours" />
          <KpiCard icon={BriefcaseBusiness} label="Submissions" value={String(safeNumber(summary.totalSubmissions))} helper="Department-filtered records" />
          <KpiCard icon={BarChart3} label="Avg Hours / Submission" value={safeNumber(summary.avgHoursPerSubmission).toFixed(1)} helper="Operational workload average" />
          <KpiCard icon={Layers3} label="Approval Rate" value={`${safeNumber(summary.approvalRatePct)}%`} helper="Approved vs total submissions" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-4 shadow-[0_6px_16px_rgba(16,42,80,0.06)]">
          <h3 className="text-lg font-bold text-[#102846]">Hours by Category</h3>
          <p className="mt-1 text-xs text-[#6E86A3]">Core and support distribution from submissions</p>

          <div className="mt-4 grid grid-cols-[112px_1fr] items-center gap-4">
            <div
              className="h-28 w-28 rounded-full"
              style={{
                background: `conic-gradient(#1E5EA9 ${corePercent}%, #61A5FA ${corePercent}% ${corePercent + supportPercent}%, #DCE8F7 0)`,
              }}
            >
              <div className="m-4 h-20 w-20 rounded-full border border-[#E3ECF8] bg-white flex items-center justify-center text-xs font-semibold text-[#5B7596]">
                Split
              </div>
            </div>

            <div className="space-y-2.5">
              <LegendRow label="Core Activities" value={safeNumber(coreSupport.coreHours).toFixed(1)} colorClass="bg-[#1E5EA9]" />
              <LegendRow label="Support Activities" value={safeNumber(coreSupport.supportHours).toFixed(1)} colorClass="bg-[#61A5FA]" />
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-4 shadow-[0_6px_16px_rgba(16,42,80,0.06)]">
          <h3 className="text-lg font-bold text-[#102846]">Hours by Frequency</h3>
          <p className="mt-1 text-xs text-[#6E86A3]">Workload concentration across reporting frequencies</p>

          <div className="mt-4 space-y-3">
            {byFrequency.length === 0 ? (
              <EmptyChartState />
            ) : (
              byFrequency.map((item) => {
                const max = byFrequency[0]?.hours || 1;
                return (
                  <BarRow
                    key={item.label}
                    label={item.label}
                    value={safeNumber(item.hours)}
                    widthPercent={(safeNumber(item.hours) / max) * 100}
                    colorClass="bg-[#2F6DB5]"
                  />
                );
              })
            )}
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-4 shadow-[0_6px_16px_rgba(16,42,80,0.06)]">
          <h3 className="text-lg font-bold text-[#102846]">Top Employees by Hours</h3>
          <div className="mt-4 space-y-3">
            {byEmployee.length === 0 ? (
              <EmptyChartState />
            ) : (
              byEmployee.map((item) => {
                const max = byEmployee[0]?.hours || 1;
                return (
                  <BarRow
                    key={item.label}
                    label={item.label}
                    value={safeNumber(item.hours)}
                    widthPercent={(safeNumber(item.hours) / max) * 100}
                    colorClass="bg-[#3F8BD7]"
                    icon={UserRound}
                  />
                );
              })
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-4 shadow-[0_6px_16px_rgba(16,42,80,0.06)]">
          <h3 className="text-lg font-bold text-[#102846]">Top Processes by Hours</h3>
          <div className="mt-4 space-y-3">
            {byProcess.length === 0 ? (
              <EmptyChartState />
            ) : (
              byProcess.map((item) => {
                const max = byProcess[0]?.hours || 1;
                return (
                  <BarRow
                    key={item.label}
                    label={item.label}
                    value={safeNumber(item.hours)}
                    widthPercent={(safeNumber(item.hours) / max) * 100}
                    colorClass="bg-[#4A86C5]"
                  />
                );
              })
            )}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_6px_16px_rgba(16,42,80,0.06)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E3EBF6] px-5 py-3.5">
          <h3 className="text-lg font-bold text-[#102846]">Recent Submissions</h3>
          <div className="flex items-center gap-2">
            <StatusPill label="Under Review" value={safeNumber(statusCounts.underReview)} tone="blue" />
            <StatusPill label="Approved" value={safeNumber(statusCounts.approved)} tone="green" />
            <StatusPill label="Changes Requested" value={safeNumber(statusCounts.changesRequested)} tone="amber" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-180 border-collapse text-left">
            <thead>
              <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                <th className="px-5 py-3">Form ID</th>
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Hours</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-[#6E86A3]">
                    No submissions available for this filter.
                  </td>
                </tr>
              ) : (
                recentRecords.map((record) => (
                  <tr key={record.referenceId} className="border-b border-[#E8EEF7] last:border-b-0">
                    <td className="px-5 py-3.5 text-sm font-semibold text-[#1A5CA8]">{record.referenceId}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-[#1A3556]">{record.employeeName}</td>
                    <td className="px-5 py-3.5 text-sm text-[#4F6785]">{record.department}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-[#0E2646]">{safeNumber(record.totalHours).toFixed(1)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusClass(record.status)}`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#4F6785]">{formatDateISO(record.submittedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="rounded-xl border border-[#DCE7F4] bg-[#F8FBFF] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7D94B1]">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[#112A4E]">{value}</p>
          <p className="mt-1 text-xs text-[#7088A4]">{helper}</p>
        </div>
        <div className="h-9 w-9 rounded-lg border border-[#D8E4F4] bg-white flex items-center justify-center text-[#376EB4]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </article>
  );
}

function LegendRow({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#E3EBF7] bg-[#F9FBFF] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
        <span className="text-sm font-medium text-[#355173]">{label}</span>
      </div>
      <span className="text-sm font-semibold text-[#102846]">{value}h</span>
    </div>
  );
}

function BarRow({
  label,
  value,
  widthPercent,
  colorClass,
  icon: Icon,
}: {
  label: string;
  value: number;
  widthPercent: number;
  colorClass: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="inline-flex items-center gap-1.5 min-w-0">
          {Icon ? <Icon className="h-3.5 w-3.5 text-[#6A83A3]" /> : null}
          <span className="truncate text-[#355173]">{label}</span>
        </div>
        <span className="font-semibold text-[#102846]">{value.toFixed(1)}h</span>
      </div>
      <div className="h-2.5 rounded-full bg-[#E7EEF8] overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.max(8, widthPercent)}%` }} />
      </div>
    </div>
  );
}

function EmptyChartState() {
  return <div className="rounded-xl border border-dashed border-[#DCE6F3] py-8 text-center text-sm text-[#8BA0BA]">No data</div>;
}

function StatusPill({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'green' | 'amber' }) {
  const className =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-blue-200 bg-blue-50 text-blue-700';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
      <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold">{value}</span>
    </span>
  );
}
