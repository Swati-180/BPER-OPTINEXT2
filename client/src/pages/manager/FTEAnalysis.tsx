import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  Filter,
  Loader2,
  TrendingUp,
  Clock3,
  Users,
  Building2,
} from 'lucide-react';
import { getFteAnalysisReport, exportToCSV } from '../../lib/api';

type TabType = 'overview' | 'byTower' | 'byDepartment' | 'allActivities';

type FteAnalysisReport = {
  generatedAt?: string;
  summary?: {
    totalHours?: number;
    totalFte?: number;
    baselineHours?: number;
    totalActivities?: number;
  };
  tabs?: {
    byTower?: Array<{
      tower: string;
      hours: number;
      fte: number;
      utilizationPct: number;
      activityCount: number;
    }>;
    byDepartment?: Array<{
      department: string;
      hours: number;
      fte: number;
      utilizationPct: number;
      activityCount: number;
    }>;
    allActivities?: Array<{
      name: string;
      tower: string;
      department: string;
      process: string;
      frequency: string;
      monthlyHours: number;
      fte: number;
      activityCategory: string;
    }>;
  };
};

type DepartmentFilter = 'All Departments' | string;

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function FTEAnalysisPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>('All Departments');
  const [report, setReport] = useState<FteAnalysisReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function loadReport(department: DepartmentFilter) {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getFteAnalysisReport(department);
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load FTE analysis.');
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
  const byTower = Array.isArray(report?.tabs?.byTower) ? report!.tabs!.byTower! : [];
  const byDepartment = Array.isArray(report?.tabs?.byDepartment) ? report!.tabs!.byDepartment! : [];
  const allActivities = Array.isArray(report?.tabs?.allActivities) ? report!.tabs!.allActivities! : [];

  const departments = useMemo(() => {
    const options = byDepartment.map((item) => item.department).filter(Boolean);
    return ['All Departments', ...Array.from(new Set(options)).sort((a, b) => a.localeCompare(b))];
  }, [byDepartment]);

  function handleExportByTower() {
    setIsExporting(true);
    try {
      exportToCSV(
        byTower,
        'FTE-Analysis-By-Tower',
        ['tower', 'hours', 'fte', 'utilizationPct', 'activityCount']
      );
    } finally {
      setIsExporting(false);
    }
  }

  function handleExportByDepartment() {
    setIsExporting(true);
    try {
      exportToCSV(
        byDepartment,
        'FTE-Analysis-By-Department',
        ['department', 'hours', 'fte', 'utilizationPct', 'activityCount']
      );
    } finally {
      setIsExporting(false);
    }
  }

  function handleExportAllActivities() {
    setIsExporting(true);
    try {
      exportToCSV(
        allActivities,
        'FTE-Analysis-All-Activities',
        ['name', 'tower', 'department', 'process', 'frequency', 'monthlyHours', 'fte', 'activityCategory']
      );
    } finally {
      setIsExporting(false);
    }
  }

  if (isLoading && !report) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[#1E5EAB]" />
            <span className="text-sm font-medium text-[#5D789A]">Loading FTE analysis...</span>
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-700">Unable to load FTE analysis</p>
              <p className="mt-1 text-xs text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => loadReport(departmentFilter)}
                className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
        <div className="flex items-start justify-between gap-4 flex-col sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2649]">FTE Analysis</h1>
            <p className="mt-1 text-sm text-[#5D789A]">Comprehensive FTE allocation by tower, department, and activity</p>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#617D9D]">Filter by Department</span>
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value as DepartmentFilter)}
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
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Clock3}
          label="Total Hours"
          value={safeNumber(summary.totalHours).toFixed(1)}
          helper="Monthly baseline 160h"
        />
        <KpiCard
          icon={TrendingUp}
          label="Total FTE"
          value={safeNumber(summary.totalFte).toFixed(2)}
          helper="From monthly hours"
        />
        <KpiCard
          icon={Users}
          label="Total Activities"
          value={String(safeNumber(summary.totalActivities))}
          helper="Unique work items"
        />
        <KpiCard
          icon={Building2}
          label="Departments"
          value={String(byDepartment.length)}
          helper="Active departments"
        />
      </section>

      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
        <div className="inline-flex rounded-xl border border-[#DDE7F3] bg-[#F8FBFF] p-1 mb-5">
          <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <TabButton label="By Tower" active={activeTab === 'byTower'} onClick={() => setActiveTab('byTower')} />
          <TabButton label="By Department" active={activeTab === 'byDepartment'} onClick={() => setActiveTab('byDepartment')} />
          <TabButton label="All Activities" active={activeTab === 'allActivities'} onClick={() => setActiveTab('allActivities')} />
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="text-sm text-[#5D789A]">
              <p>Total FTE allocation: <strong>{safeNumber(summary.totalFte).toFixed(2)}</strong> from <strong>{safeNumber(summary.totalHours).toFixed(1)}</strong> hours</p>
              <p className="mt-1">Baseline: <strong>{safeNumber(summary.baselineHours)} hours/month</strong></p>
              <p className="mt-1">Activities tracked: <strong>{safeNumber(summary.totalActivities)}</strong></p>
            </div>
          </div>
        )}

        {activeTab === 'byTower' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[#0F2649]">FTE by Tower</h3>
              <button
                type="button"
                onClick={handleExportByTower}
                disabled={isExporting}
                className="flex items-center gap-2 rounded-lg border border-[#D2DEED] bg-[#F7FAFF] px-3 py-1.5 text-xs font-semibold text-[#1E5EAB] hover:bg-[#EAF2FF] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            {byTower.length === 0 ? (
              <div className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4 text-center text-sm text-[#8AA0BA]">
                No tower data available for this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-180 border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                      <th className="px-5 py-3">Tower</th>
                      <th className="px-5 py-3 text-right">Hours</th>
                      <th className="px-5 py-3 text-right">FTE</th>
                      <th className="px-5 py-3 text-right">Utilization %</th>
                      <th className="px-5 py-3 text-center">Activities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byTower.map((row, idx) => (
                      <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                        <td className="px-5 py-3 font-medium text-[#0F2649]">{row.tower}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.hours}</td>
                        <td className="px-5 py-3 text-right text-[#1E5EAB] font-semibold">{row.fte}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.utilizationPct}%</td>
                        <td className="px-5 py-3 text-center text-[#5D789A]">{row.activityCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'byDepartment' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[#0F2649]">FTE by Department</h3>
              <button
                type="button"
                onClick={handleExportByDepartment}
                disabled={isExporting}
                className="flex items-center gap-2 rounded-lg border border-[#D2DEED] bg-[#F7FAFF] px-3 py-1.5 text-xs font-semibold text-[#1E5EAB] hover:bg-[#EAF2FF] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            {byDepartment.length === 0 ? (
              <div className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4 text-center text-sm text-[#8AA0BA]">
                No department data available for this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-180 border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                      <th className="px-5 py-3">Department</th>
                      <th className="px-5 py-3 text-right">Hours</th>
                      <th className="px-5 py-3 text-right">FTE</th>
                      <th className="px-5 py-3 text-right">Utilization %</th>
                      <th className="px-5 py-3 text-center">Activities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byDepartment.map((row, idx) => (
                      <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                        <td className="px-5 py-3 font-medium text-[#0F2649]">{row.department}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.hours}</td>
                        <td className="px-5 py-3 text-right text-[#1E5EAB] font-semibold">{row.fte}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.utilizationPct}%</td>
                        <td className="px-5 py-3 text-center text-[#5D789A]">{row.activityCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'allActivities' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[#0F2649]">All Activities ({allActivities.length})</h3>
              <button
                type="button"
                onClick={handleExportAllActivities}
                disabled={isExporting}
                className="flex items-center gap-2 rounded-lg border border-[#D2DEED] bg-[#F7FAFF] px-3 py-1.5 text-xs font-semibold text-[#1E5EAB] hover:bg-[#EAF2FF] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            {allActivities.length === 0 ? (
              <div className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4 text-center text-sm text-[#8AA0BA]">
                No activity data available for this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-200 border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                      <th className="px-5 py-3">Activity Name</th>
                      <th className="px-5 py-3">Tower</th>
                      <th className="px-5 py-3">Department</th>
                      <th className="px-5 py-3">Process</th>
                      <th className="px-5 py-3">Frequency</th>
                      <th className="px-5 py-3 text-right">Hours</th>
                      <th className="px-5 py-3 text-right">FTE</th>
                      <th className="px-5 py-3">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allActivities.map((row, idx) => (
                      <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                        <td className="px-5 py-3 font-medium text-[#0F2649]">{row.name}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{row.tower}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{row.department}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{row.process}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{row.frequency}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.monthlyHours}</td>
                        <td className="px-5 py-3 text-right text-[#1E5EAB] font-semibold">{row.fte}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{row.activityCategory}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
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
    <div className="rounded-xl border border-[#D9E4F2] bg-white p-4 shadow-[0_2px_8px_rgba(16,42,80,0.05)]">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8AA0BA]">{label}</p>
          <p className="mt-2 text-2xl font-bold text-[#0F2649]">{value}</p>
          <p className="mt-1 text-xs text-[#5D789A]">{helper}</p>
        </div>
        <Icon className="h-5 w-5 text-[#1E5EAB] opacity-50" />
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        active
          ? 'bg-white text-[#1E5EAB] shadow-sm'
          : 'bg-transparent text-[#8AA0BA] hover:text-[#5D789A]'
      }`}
    >
      {label}
    </button>
  );
}
