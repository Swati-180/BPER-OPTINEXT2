import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  Filter,
  TrendingUp,
  Clock3,
  Users,
  Building2,
} from 'lucide-react';
import { getFteAnalysisReport, exportToCSV, downloadExcel } from '../../lib/api';
import { DashboardSkeleton } from '../../components/PortalSkeletons';

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
      subProcess: string;
      frequency: string;
      monthlyHours: number;
      fte: number;
      activityCategory: string;
      employeeName: string;
      employeeId: string;
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
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);

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
    return ['All Departments', ...Array.from(new Set(options)).sort((a, b) => (a as string).localeCompare(b as string))];
  }, [byDepartment]);

  async function handleExcelExport() {
    setIsExporting(true);
    try {
      await downloadExcel('/export/fte-report', 'BPER-FTE-Analysis', {
        department: departmentFilter === 'All Departments' ? '' : departmentFilter
      });
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  function handleDrillDownToActivities(filterKey: 'tower' | 'department', filterValue: string) {
    setActiveTab('allActivities');
    // Logic to further filter within the tab if needed, 
    // but for now, switching tabs provides the drill-down experience.
  }

  if (isLoading && !report) {
    return <DashboardSkeleton />;
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
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <label className="flex flex-col gap-1 flex-1 sm:flex-initial">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#617D9D]">Department</span>
              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value as DepartmentFilter)}
                className="h-10 w-full rounded-xl border border-[#D6E2F0] bg-white px-3 text-sm font-medium text-[#243A59] outline-none focus:border-[#6E97CB] focus:ring-2 focus:ring-[#D7E6F7]"
              >
                {departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleExcelExport}
              disabled={isExporting}
              className="mt-5 flex items-center gap-2 rounded-xl bg-[#1E5EAB] px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-[#194F8D] hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Export Excel'}
            </button>
          </div>
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
              <p className="text-[10px] text-[#8AA0BA]">Tip: Click a row to drill down into activities</p>
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
                      <tr 
                        key={idx} 
                        className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF] cursor-pointer"
                        onClick={() => handleDrillDownToActivities('tower', row.tower)}
                      >
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
              <p className="text-[10px] text-[#8AA0BA]">Tip: Click a row to drill down into activities</p>
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
                      <tr 
                        key={idx} 
                        className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF] cursor-pointer"
                        onClick={() => handleDrillDownToActivities('department', row.department)}
                      >
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
                      <th className="px-5 py-3">Sub Process</th>
                      <th className="px-5 py-3">Process Name</th>
                      <th className="px-5 py-3">Tower</th>
                      <th className="px-5 py-3">Department</th>
                      <th className="px-5 py-3 text-right">Hours</th>
                      <th className="px-5 py-3 text-right">FTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allActivities.map((row, idx) => (
                      <tr 
                        key={idx} 
                        className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF] cursor-pointer"
                        onClick={() => setSelectedActivity(row)}
                      >
                        <td className="px-5 py-3 text-[#5D789A]">{row.subProcess || '—'}</td>
                        <td className="px-5 py-3 font-medium text-[#0F2649]">{row.process || row.name || '—'}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{row.tower || '—'}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{row.department || '—'}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.monthlyHours}</td>
                        <td className="px-5 py-3 text-right text-[#1E5EAB] font-semibold">{row.fte}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Drill-down slide panel for Activity detail */}
      {selectedActivity && (
        <>
          <div className="fixed inset-0 bg-[#0F2649]/20 backdrop-blur-sm z-40 transition-opacity" onClick={() => setSelectedActivity(null)} />
          <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white shadow-2xl z-50 transform transition-transform duration-300 flex flex-col border-l border-[#D9E4F2]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#E3EAF4] bg-[#F8FBFF]">
              <div>
                <h2 className="text-lg font-bold text-[#0F2649]">Activity Details</h2>
                <p className="text-xs text-[#5D789A] mt-1">{selectedActivity.process || selectedActivity.name}</p>
              </div>
              <button 
                onClick={() => setSelectedActivity(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#D9E4F2] text-[#5D789A] hover:bg-[#F0F5FA] hover:text-[#0F2649] transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-[#D9E4F2] bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8AA0BA]">Tower</p>
                    <p className="mt-1 text-sm font-semibold text-[#0F2649]">{selectedActivity.tower || '—'}</p>
                  </div>
                  <div className="rounded-xl border border-[#D9E4F2] bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8AA0BA]">Department</p>
                    <p className="mt-1 text-sm font-semibold text-[#0F2649]">{selectedActivity.department || '—'}</p>
                  </div>
                  <div className="rounded-xl border border-[#D9E4F2] bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8AA0BA]">Sub Process</p>
                    <p className="mt-1 text-sm font-semibold text-[#0F2649]">{selectedActivity.subProcess || '—'}</p>
                  </div>
                  <div className="rounded-xl border border-[#D9E4F2] bg-[#F5F8FD] p-4 shadow-sm border-[#B1C8E6]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#617D9D]">Total FTE</p>
                    <p className="mt-1 text-lg font-bold text-[#1E5EAB]">{selectedActivity.fte}</p>
                  </div>
                </div>
              </div>

              {/* Employees who submitted this activity */}
              <div className="rounded-xl border border-[#D9E4F2] bg-white overflow-hidden shadow-sm">
                <div className="bg-[#F8FBFF] px-4 py-3 border-b border-[#E3EAF4]">
                  <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-[#617D9D]">Employees Contributing</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="bg-[#F5F8FD] text-[10px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                        <th className="px-4 py-2">Employee</th>
                        <th className="px-4 py-2 text-right">Hours</th>
                        <th className="px-4 py-2 text-right">FTE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allActivities
                        .filter(a => a.process === selectedActivity.process && a.subProcess === selectedActivity.subProcess && a.tower === selectedActivity.tower)
                        .map((a, i) => (
                        <tr key={i} className="border-b border-[#E3EAF4] last:border-0 hover:bg-[#F8FBFF]">
                          <td className="px-4 py-2">
                            <p className="font-medium text-[#0F2649]">{a.employeeName}</p>
                            <p className="text-[10px] text-[#5D789A]">{a.employeeId}</p>
                          </td>
                          <td className="px-4 py-2 text-right text-[#5D789A]">{a.monthlyHours}</td>
                          <td className="px-4 py-2 text-right text-[#1E5EAB] font-semibold">{a.fte}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
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
