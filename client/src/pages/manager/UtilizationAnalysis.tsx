import { useNavigate, useSearchParams } from 'react-router-dom';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  Filter,
  Clock3,
  Users,
  Briefcase,
  Building2,
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import { getUtilizationAnalysisReport, exportToCSV } from '../../lib/api';
import { DashboardSkeleton } from '../../components/PortalSkeletons';

type TabType = 'overview' | 'waterfall' | 'byFrequency' | 'byProcess' | 'byEmployee' | 'byDepartment';

export type WaterfallStage = {
  stage: number;
  id: string;
  label: string;
  type: 'base' | 'addition' | 'subtotal' | 'total';
  hours: number;
  fte: number;
  runningTotalHours: number;
  runningTotalFte: number;
  description: string;
};

type UtilizationAnalysisReport = {
  generatedAt?: string;
  summary?: {
    totalHours?: number;
    totalSubmissions?: number;
    totalFte?: number;
    baselineHours?: number;
    departments?: number;
    filledEmployeesCount?: number;
    vacantPositionsCount?: number;
    availableStaffedCapacityHours?: number;
    additionalStaffedWorkloadHours?: number;
    actualStaffedWorkloadHours?: number;
    plannedVacancyWorkloadHours?: number;
    totalOrganizationalWorkloadHours?: number;
  };
  capacityWaterfall?: WaterfallStage[];
  tabs?: {
    byFrequency?: Array<{
      frequency: string;
      hours: number;
      activityCount: number;
      fte: number;
    }>;
    byProcess?: Array<{
      process: string;
      hours: number;
      activityCount: number;
      fte: number;
    }>;
    byEmployee?: Array<{
      employeeId: string;
      employeeName: string;
      department: string;
      hours: number;
      fte: number;
      activityCount: number;
    }>;
    byDepartment?: Array<{
      department: string;
      hours: number;
      fte: number;
      submissionCount: number;
    }>;
  };
};

type DepartmentFilter = 'All Departments' | string;

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function UtilizationAnalysisPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'waterfall' ? 'waterfall' : 'overview';
  const initialDepartment = searchParams.get('department') || 'All Departments';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>(initialDepartment);
  const [report, setReport] = useState<UtilizationAnalysisReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function loadReport(department: DepartmentFilter, isSilent = false) {
    if (!isSilent) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const data = await getUtilizationAnalysisReport(department);
      setReport(data);
    } catch (err: any) {
      if (!isSilent) {
        setError(err?.message || 'Failed to load utilization analysis.');
      } else {
        console.warn('Utilization background refresh failed (swallowed):', err?.message);
      }
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    loadReport(departmentFilter);
  }, [departmentFilter]);

  useEffect(() => {
    const refreshOnDataUpdate = () => {
      loadReport(departmentFilter, true);
    };

    const refreshInterval = window.setInterval(() => {
      loadReport(departmentFilter, true);
    }, 30000);

    window.addEventListener('bper:data-updated', refreshOnDataUpdate as EventListener);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener('bper:data-updated', refreshOnDataUpdate as EventListener);
    };
  }, [departmentFilter]);

  const summary = report?.summary || {};
  const byFrequency = Array.isArray(report?.tabs?.byFrequency) ? report!.tabs!.byFrequency! : [];
  const byProcess = Array.isArray(report?.tabs?.byProcess) ? report!.tabs!.byProcess! : [];
  const byEmployee = Array.isArray(report?.tabs?.byEmployee) ? report!.tabs!.byEmployee! : [];
  const byDepartment = Array.isArray(report?.tabs?.byDepartment) ? report!.tabs!.byDepartment! : [];

  const departments = useMemo(() => {
    const canonical = ['Finance & Accounting', 'HR', 'Logistics', 'SCM'];
    const options = byDepartment.map((item) => String(item.department || '')).filter(Boolean);
    const combined = Array.from(new Set([...canonical, ...options])).filter(Boolean);
    return ['All Departments', ...combined.sort((a: string, b: string) => a.localeCompare(b))];
  }, [byDepartment]);

  function handleExportByFrequency() {
    setIsExporting(true);
    try {
      exportToCSV(
        byFrequency,
        'Utilization-By-Frequency',
        ['frequency', 'hours', 'activityCount', 'fte']
      );
    } finally {
      setIsExporting(false);
    }
  }

  function handleExportByProcess() {
    setIsExporting(true);
    try {
      exportToCSV(
        byProcess,
        'Utilization-By-Process',
        ['process', 'hours', 'activityCount', 'fte']
      );
    } finally {
      setIsExporting(false);
    }
  }

  function handleExportByEmployee() {
    setIsExporting(true);
    try {
      exportToCSV(
        byEmployee,
        'Utilization-By-Employee',
        ['employeeId', 'employeeName', 'department', 'hours', 'fte', 'activityCount']
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
        'Utilization-By-Department',
        ['department', 'hours', 'fte', 'submissionCount']
      );
    } finally {
      setIsExporting(false);
    }
  }

  if (isLoading && !report) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">Unable to load utilization analysis</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
              <button
                type="button"
                onClick={() => loadReport(departmentFilter)}
                className="mt-2 text-xs font-semibold text-red-700 underline hover:text-red-800"
              >
                Retry
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Header and Department Filter */}
      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                const query = departmentFilter && departmentFilter !== 'All Departments'
                  ? `&department=${encodeURIComponent(departmentFilter)}`
                  : '';
                navigate(`/admin/deep-analysis?tab=utilization${query}`);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E5EAB] hover:text-[#164B8A] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Deep Analysis</span>
            </button>
            <h1 className="text-2xl font-bold text-[#0F2649]">Utilization Analysis</h1>
            <p className="mt-1 text-sm text-[#5D789A]">Detailed work utilization breakdown by multiple dimensions</p>
          </div>

          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-[#718BAA]" />
            <select
              aria-label="Filter by department"
              value={departmentFilter}
              onChange={(e) => {
                const nextDept = e.target.value;
                setDepartmentFilter(nextDept);
                const nextParams = new URLSearchParams(searchParams);
                if (nextDept && nextDept !== 'All Departments') {
                  nextParams.set('department', nextDept);
                } else {
                  nextParams.delete('department');
                }
                setSearchParams(nextParams, { replace: true });
              }}
              className="rounded-lg border border-[#D0DFEE] bg-white px-3 py-2 text-xs font-semibold text-[#0F2649] shadow-xs focus:border-[#1E5EAB] focus:outline-none"
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Summary KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Clock3}
          label="Total Tracked Hours"
          value={safeNumber(summary.totalHours).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          helper="Monthly utilization"
        />
        <KpiCard
          icon={Users}
          label="FTE Equivalent"
          value={safeNumber(summary.totalFte).toFixed(2)}
          helper={`${summary?.baselineHours || 160} hrs/month baseline`}
        />
        <KpiCard
          icon={Briefcase}
          label="Total Submissions"
          value={String(summary.totalSubmissions || 0)}
          helper="Approved WDT profiles"
        />
        <KpiCard
          icon={Building2}
          label="Departments"
          value={String(byDepartment.length)}
          helper="Active departments"
        />
      </section>

      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
        <div className="inline-flex rounded-xl border border-[#DDE7F3] bg-[#F8FBFF] p-1 mb-5 flex-wrap gap-1">
          <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <TabButton label="Capacity Waterfall" active={activeTab === 'waterfall'} onClick={() => setActiveTab('waterfall')} />
          <TabButton label="By Frequency" active={activeTab === 'byFrequency'} onClick={() => setActiveTab('byFrequency')} />
          <TabButton label="By Process" active={activeTab === 'byProcess'} onClick={() => setActiveTab('byProcess')} />
          <TabButton label="By Employee" active={activeTab === 'byEmployee'} onClick={() => setActiveTab('byEmployee')} />
          <TabButton label="By Department" active={activeTab === 'byDepartment'} onClick={() => setActiveTab('byDepartment')} />
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="text-sm text-[#5D789A]">
              <p>Total hours tracked: <strong>{safeNumber(summary.totalHours).toFixed(1)}</strong></p>
              <p className="mt-1">Total submissions: <strong>{safeNumber(summary.totalSubmissions)}</strong></p>
              <p className="mt-1">Average per submission: <strong>{safeNumber(summary.totalSubmissions) > 0 ? (safeNumber(summary.totalHours) / safeNumber(summary.totalSubmissions)).toFixed(1) : '0'} hours</strong></p>
              <p className="mt-2 pt-2 border-t border-[#E3EAF4]">Total FTE equivalent: <strong>{safeNumber(summary.totalFte).toFixed(2)}</strong> (based on {summary?.baselineHours || 160}h/month baseline)</p>
            </div>

            {/* Compact Executive Capacity Summary Card */}
            <CompactCapacitySummaryCard
              summary={summary}
              baselineHours={summary?.baselineHours || 160}
              onNavigateToWaterfall={() => setActiveTab('waterfall')}
            />
          </div>
        )}

        {activeTab === 'waterfall' && (
          <div className="space-y-4">
            <WorkforceCapacityWaterfall
              waterfall={report?.capacityWaterfall}
              summary={summary}
              baselineHours={summary?.baselineHours || 160}
            />
          </div>
        )}

        {activeTab === 'byFrequency' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[#0F2649]">Utilization by Frequency</h3>
              <button
                type="button"
                onClick={handleExportByFrequency}
                disabled={isExporting}
                className="flex items-center gap-2 rounded-lg border border-[#D2DEED] bg-[#F7FAFF] px-3 py-1.5 text-xs font-semibold text-[#1E5EAB] hover:bg-[#EAF2FF] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            {byFrequency.length === 0 ? (
              <div className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4 text-center text-sm text-[#8AA0BA]">
                No frequency data available for this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-140 border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                      <th className="px-5 py-3">Frequency</th>
                      <th className="px-5 py-3 text-right">Hours</th>
                      <th className="px-5 py-3 text-right">FTE</th>
                      <th className="px-5 py-3 text-center">Activities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byFrequency.map((row, idx) => (
                      <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                        <td className="px-5 py-3 font-medium text-[#0F2649]">{row.frequency}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.hours}</td>
                        <td className="px-5 py-3 text-right text-[#1E5EAB] font-semibold">{row.fte}</td>
                        <td className="px-5 py-3 text-center text-[#5D789A]">{row.activityCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'byProcess' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[#0F2649]">Utilization by Process</h3>
              <button
                type="button"
                onClick={handleExportByProcess}
                disabled={isExporting}
                className="flex items-center gap-2 rounded-lg border border-[#D2DEED] bg-[#F7FAFF] px-3 py-1.5 text-xs font-semibold text-[#1E5EAB] hover:bg-[#EAF2FF] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            {byProcess.length === 0 ? (
              <div className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4 text-center text-sm text-[#8AA0BA]">
                No process data available for this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-140 border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                      <th className="px-5 py-3">Process</th>
                      <th className="px-5 py-3 text-right">Hours</th>
                      <th className="px-5 py-3 text-right">FTE</th>
                      <th className="px-5 py-3 text-center">Activities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProcess.map((row, idx) => (
                      <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                        <td className="px-5 py-3 font-medium text-[#0F2649]">{row.process}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.hours}</td>
                        <td className="px-5 py-3 text-right text-[#1E5EAB] font-semibold">{row.fte}</td>
                        <td className="px-5 py-3 text-center text-[#5D789A]">{row.activityCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'byEmployee' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[#0F2649]">Utilization by Employee</h3>
              <button
                type="button"
                onClick={handleExportByEmployee}
                disabled={isExporting}
                className="flex items-center gap-2 rounded-lg border border-[#D2DEED] bg-[#F7FAFF] px-3 py-1.5 text-xs font-semibold text-[#1E5EAB] hover:bg-[#EAF2FF] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            {byEmployee.length === 0 ? (
              <div className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4 text-center text-sm text-[#8AA0BA]">
                No employee data available for this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-180 border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                      <th className="px-5 py-3">Employee ID</th>
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Department</th>
                      <th className="px-5 py-3 text-right">Hours</th>
                      <th className="px-5 py-3 text-right">FTE</th>
                      <th className="px-5 py-3 text-center">Activities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byEmployee.map((row, idx) => (
                      <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                        <td className="px-5 py-3 font-mono text-[#5D789A]">{row.employeeId}</td>
                        <td className="px-5 py-3 font-medium text-[#0F2649]">{row.employeeName}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{row.department}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.hours}</td>
                        <td className="px-5 py-3 text-right text-[#1E5EAB] font-semibold">{row.fte}</td>
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
              <h3 className="font-semibold text-[#0F2649]">Utilization by Department</h3>
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
                      <th className="px-5 py-3 text-center">Submissions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byDepartment.map((row, idx) => (
                      <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                        <td className="px-5 py-3 font-medium text-[#0F2649]">{row.department}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.hours}</td>
                        <td className="px-5 py-3 text-right text-[#1E5EAB] font-semibold">{row.fte}</td>
                        <td className="px-5 py-3 text-center text-[#5D789A]">{row.submissionCount}</td>
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
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
        active
          ? 'bg-white text-[#1E5EAB] shadow-sm'
          : 'bg-transparent text-[#8AA0BA] hover:text-[#5D789A]'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Compact Executive Summary Card for the Overview tab.
 * Summarizes the 3 key pillars (Staffed Baseline Capacity, Actual Staffed Workload, Total Workload)
 * and provides a direct CTA link/button to switch to the full Capacity Waterfall tab.
 */
function CompactCapacitySummaryCard({
  summary,
  baselineHours = 160,
  onNavigateToWaterfall,
}: {
  summary: any;
  baselineHours?: number;
  onNavigateToWaterfall: () => void;
}) {
  const staffedCapacityHours = summary?.availableStaffedCapacityHours ?? 0;
  const staffedCapacityFte = staffedCapacityHours / baselineHours;

  const actualStaffedHours = summary?.actualStaffedWorkloadHours ?? 0;
  const actualStaffedFte = actualStaffedHours / baselineHours;

  const totalWorkloadHours = summary?.totalOrganizationalWorkloadHours ?? 0;
  const totalWorkloadFte = totalWorkloadHours / baselineHours;

  const vacancyHours = summary?.plannedVacancyWorkloadHours ?? 0;
  const vacancyFte = vacancyHours / baselineHours;

  const filledCount = summary?.filledEmployeesCount ?? 0;
  const vacantCount = summary?.vacantPositionsCount ?? 0;

  return (
    <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 md:p-6 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAF0F8] pb-4">
        <div>
          <h2 className="text-base font-bold text-[#0F2649] flex items-center gap-2">
            Workforce Capacity vs. Demand Summary
            <span className="text-xs font-normal text-[#1E5EAB] px-2 py-0.5 rounded-full bg-[#EDF4FD] border border-[#D0E2F7]">
              Executive Overview
            </span>
          </h2>
          <p className="mt-1 text-xs text-[#5D789A]">
            Core capacity transition pillars based on a <strong>{baselineHours}h</strong> monthly baseline.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateToWaterfall}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1E5EAB] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#164b8a] transition-all"
        >
          <span>Open Full Waterfall</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pillar 1 */}
        <div className="rounded-xl border border-[#DCE7F5] bg-[#F9FBFF] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#718BAA]">
              1. Staffed Capacity
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              Contracted Base
            </span>
          </div>
          <div className="text-2xl font-extrabold text-[#0F2649]">
            {staffedCapacityHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h
          </div>
          <div className="flex justify-between items-center text-xs pt-1 border-t border-[#E3EBF7]">
            <span className="text-[#617D9D]">FTE Equivalent:</span>
            <span className="font-bold text-[#1E5EAB]">{staffedCapacityFte.toFixed(2)} FTE</span>
          </div>
          <p className="text-[11px] text-[#718BAA] mt-1">
            {filledCount} active filled staff Ã— {baselineHours} standard hours.
          </p>
        </div>

        {/* Pillar 2 */}
        <div className="rounded-xl border border-[#C7D9F8] bg-[#F2F6FE] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E5EAB]">
              2. Actual Staffed Workload
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
              Active Demand
            </span>
          </div>
          <div className="text-2xl font-extrabold text-[#1E5EAB]">
            {actualStaffedHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h
          </div>
          <div className="flex justify-between items-center text-xs pt-1 border-t border-[#D9E4F5]">
            <span className="text-[#617D9D]">FTE Equivalent:</span>
            <span className="font-bold text-[#1E5EAB]">{actualStaffedFte.toFixed(2)} FTE</span>
          </div>
          <p className="text-[11px] text-[#718BAA] mt-1">
            Total actual logged process workload ({actualStaffedHours >= staffedCapacityHours ? '+' : ''}{(actualStaffedHours - staffedCapacityHours).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h vs base).
          </p>
        </div>

        {/* Pillar 3 */}
        <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#334155]">
              3. Total Organizational Workload
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-300">
              Staffed + Vacancy
            </span>
          </div>
          <div className="text-2xl font-extrabold text-[#0F2649]">
            {totalWorkloadHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h
          </div>
          <div className="flex justify-between items-center text-xs pt-1 border-t border-[#E2E8F0]">
            <span className="text-[#617D9D]">FTE Equivalent:</span>
            <span className="font-bold text-[#0F2649]">{totalWorkloadFte.toFixed(2)} FTE</span>
          </div>
          <p className="text-[11px] text-[#718BAA] mt-1">
            Staffed Workload ({actualStaffedFte.toFixed(2)} FTE) + {vacantCount} Planned Vacancies ({vacancyHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h / {vacancyFte.toFixed(2)} FTE).
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Genuine Floating-Bar Waterfall Chart Component
 * Features true floating SVG rects with connecting bridge dashed lines,
 * top value callouts, and bottom axis labels.
 */
export function WorkforceCapacityWaterfall({
  waterfall,
  summary,
  baselineHours = 160,
}: {
  waterfall?: WaterfallStage[];
  summary?: any;
  baselineHours?: number;
}) {
  const stages = waterfall || [];
  const plannedVacancyHours = summary?.plannedVacancyWorkloadHours ?? 0;
  const plannedVacancyFte = plannedVacancyHours / baselineHours;
  const vacantPositionsCount = summary?.vacantPositionsCount ?? 0;

  if (stages.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 md:p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAF0F8] pb-4">
        <div>
          <h2 className="text-base font-bold text-[#0F2649] flex items-center gap-2">
            Workforce Capacity vs. Demand Waterfall
            <span className="text-xs font-normal text-[#1E5EAB] px-2 py-0.5 rounded-full bg-[#EDF4FD] border border-[#D0E2F7]">
              Cumulative Floating Bridge
            </span>
          </h2>
          <p className="mt-1 text-xs text-[#5D789A]">
            Cumulative transition showing staffed capacity, operational volume additions, actual staffed workload, planned vacancies, and total organizational workload ({baselineHours}h standard month).
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-[#1E5EAB]" />
            <span className="text-[#355173]">Baseline Capacity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-[#F59E0B]" />
            <span className="text-[#355173]">Additional Staffed Workload (+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-[#2563EB]" />
            <span className="text-[#355173]">Actual Staffed Subtotal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-[#8B5CF6]" />
            <span className="text-[#355173]">Planned Vacancy (+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-[#0F2649]" />
            <span className="text-[#355173]">Total Enterprise Total</span>
          </div>
        </div>
      </div>

      {/* Genuine Floating-Bar Waterfall Chart */}
      <div className="space-y-4 pt-2">
        <GenuineWaterfallChart stages={stages} baselineHours={baselineHours} />

        {/* Detailed Reconciled Stage Breakdown Table */}
        <div className="overflow-x-auto rounded-xl border border-[#DCE7F5] mt-6">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F5F8FD] text-[#556987] font-semibold border-b border-[#DCE7F5]">
              <tr>
                <th className="py-2.5 px-4 w-12">#</th>
                <th className="py-2.5 px-4">Stage / Component</th>
                <th className="py-2.5 px-4 text-right">Workload Hours</th>
                <th className="py-2.5 px-4 text-right">FTE ({baselineHours}h)</th>
                <th className="py-2.5 px-4 text-right">Running Total (Hours)</th>
                <th className="py-2.5 px-4 text-right">Running Total (FTE)</th>
                <th className="py-2.5 px-4">Operational Context & Rules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF0F8]">
              {stages.map((stage) => {
                const isSubtotal = stage.type === 'subtotal' || stage.type === 'total';
                return (
                  <tr
                    key={stage.id}
                    className={`hover:bg-[#F9FBFE] transition-colors ${
                      isSubtotal ? 'bg-[#F5F8FD]/60 font-semibold' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4 text-[#718BAA] font-mono">{stage.stage}</td>
                    <td className="py-2.5 px-4 text-[#0F2649]">
                      <div className="font-bold">{stage.label}</div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#0F2649]">
                      {stage.type === 'addition' ? '+' : ''}
                      {stage.hours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#1E5EAB] font-bold">
                      {stage.type === 'addition' ? '+' : ''}{stage.fte.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#0F2649] font-bold">
                      {stage.runningTotalHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#1E5EAB] font-extrabold">
                      {stage.runningTotalFte.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-[#5D789A]">
                      {stage.description}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Institutional Governance Notice */}
        <div className="rounded-xl border border-[#E0E7FF] bg-[#F5F7FF] p-3.5 text-xs text-[#3730A3] leading-relaxed flex items-start gap-2.5">
          <div className="h-5 w-5 rounded-full bg-[#E0E7FF] flex items-center justify-center shrink-0 text-[#4338CA] font-bold text-[10px]">
            i
          </div>
          <div>
            <span className="font-bold">Planned Vacancy Clarification:</span>{' '}
            Stage 4 (Planned Vacancy Workload: {plannedVacancyHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h Â· {plannedVacancyFte.toFixed(2)} FTE) represents budgeted, documented process requirements designated for {vacantPositionsCount} open positions. It is planned operational demand awaiting staffing, and is strictly distinguished from currently active staffed capacity.
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Responsive SVG implementation of the conventional Floating-Bar Waterfall Chart.
 *
 * Computes:
 * - Stage 1 (Base): from 0 to 39,680h
 * - Stage 2 (Positive floating bar): from 39,680h to 60,611.64h
 * - Stage 3 (Subtotal): from 0 to 60,611.64h
 * - Stage 4 (Positive floating bar): from 60,611.64h to 79,913.91h
 * - Stage 5 (Final total): from 0 to 79,913.91h
 *
 * Includes dotted connecting bridge lines between contiguous transitions,
 * crisp value labels, and hover tooltips.
 */
function GenuineWaterfallChart({
  stages,
  baselineHours,
}: {
  stages: WaterfallStage[];
  baselineHours: number;
}) {
  // SVG Dimensions & Margins
  const svgWidth = 1000;
  const svgHeight = 440;
  const margin = { top: 40, right: 30, bottom: 95, left: 75 };
  const plotWidth = svgWidth - margin.left - margin.right;
  const plotHeight = svgHeight - margin.top - margin.bottom;

  // Maximum scale value (round up to 90,000 for breathing room)
  const yMax = 90000;
  const yTicks = [0, 20000, 40000, 60000, 80000];

  const yScale = (val: number) => {
    return plotHeight - (val / yMax) * plotHeight;
  };

  const colWidth = plotWidth / stages.length;
  const barWidth = Math.min(108, colWidth * 0.68);

  // Derive start/end values for each stage
  const barData = stages.map((s, idx) => {
    let startY = 0;
    let endY = 0;
    let isFloating = false;

    if (s.id === 'available_capacity') {
      startY = 0;
      endY = s.hours;
    } else if (s.id === 'additional_staffed') {
      const prev = stages[idx - 1];
      startY = prev ? prev.hours : 0;
      endY = startY + s.hours;
      isFloating = true;
    } else if (s.id === 'actual_staffed') {
      startY = 0;
      endY = s.hours;
    } else if (s.id === 'planned_vacancy') {
      const prev = stages[idx - 1];
      startY = prev ? prev.hours : 0;
      endY = startY + s.hours;
      isFloating = true;
    } else if (s.id === 'total_workload') {
      startY = 0;
      endY = s.hours;
    }

    // Palette
    let barFill = '#1E5EAB';
    let barBorder = '#164B8A';
    if (s.id === 'additional_staffed') {
      barFill = '#F59E0B';
      barBorder = '#D97706';
    } else if (s.id === 'actual_staffed') {
      barFill = '#2563EB';
      barBorder = '#1D4ED8';
    } else if (s.id === 'planned_vacancy') {
      barFill = '#8B5CF6';
      barBorder = '#7C3AED';
    } else if (s.id === 'total_workload') {
      barFill = '#0F2649';
      barBorder = '#081528';
    }

    return {
      ...s,
      startY,
      endY,
      isFloating,
      barFill,
      barBorder,
    };
  });

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-[#DCE7F5] bg-[#FBFDFF] p-4">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto min-w-[720px] select-none"
        style={{ fontFamily: 'inherit' }}
      >
        <defs>
          <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.08" />
          </filter>
        </defs>

        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Grid lines and Y-axis labels */}
          {yTicks.map((tick) => {
            const y = yScale(tick);
            return (
              <g key={tick} className="text-gray-400">
                <line
                  x1={0}
                  y1={y}
                  x2={plotWidth}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={-12}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#718BAA"
                  fontWeight="600"
                >
                  {tick.toLocaleString()}h
                </text>
              </g>
            );
          })}

          {/* Baseline zero line */}
          <line
            x1={0}
            y1={plotHeight}
            x2={plotWidth}
            y2={plotHeight}
            stroke="#CBD5E1"
            strokeWidth="1.5"
          />

          {/* Connecting Transition Bridge Lines */}
          {barData.map((d, idx) => {
            if (idx === barData.length - 1) return null;
            const next = barData[idx + 1];
            const xCenterCurrent = idx * colWidth + colWidth / 2;
            const xRightCurrent = xCenterCurrent + barWidth / 2;
            const xCenterNext = (idx + 1) * colWidth + colWidth / 2;
            const xLeftNext = xCenterNext - barWidth / 2;

            // Connect from end of current to start of next
            const connectorY = yScale(d.endY);

            return (
              <line
                key={`connector-${idx}`}
                x1={xRightCurrent}
                y1={connectorY}
                x2={xLeftNext}
                y2={connectorY}
                stroke="#64748B"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            );
          })}

          {/* Floating and Grounded Bars */}
          {barData.map((d, idx) => {
            const xCenter = idx * colWidth + colWidth / 2;
            const xLeft = xCenter - barWidth / 2;
            const yTop = yScale(Math.max(d.startY, d.endY));
            const yBottom = yScale(Math.min(d.startY, d.endY));
            const h = Math.max(3, yBottom - yTop);

            return (
              <g key={d.id} className="transition-all duration-200">
                {/* Bar Rectangle */}
                <rect
                  x={xLeft}
                  y={yTop}
                  width={barWidth}
                  height={h}
                  rx={6}
                  fill={d.barFill}
                  stroke={d.barBorder}
                  strokeWidth="1.5"
                  filter="url(#shadow)"
                  className="hover:opacity-90 cursor-pointer"
                />

                {/* Top Value Label: Hours */}
                <text
                  x={xCenter}
                  y={yTop - 18}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="800"
                  fill="#0F2649"
                >
                  {d.type === 'addition' ? '+' : ''}
                  {d.hours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h
                </text>

                {/* Top Secondary Label: FTE */}
                <text
                  x={xCenter}
                  y={yTop - 5}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={d.type === 'addition' ? '#B45309' : '#1E5EAB'}
                >
                  {d.type === 'addition' ? '+' : ''}{d.fte.toFixed(2)} FTE
                </text>

                {/* Inside bar sub-label for tall bars */}
                {h > 50 && (
                  <text
                    x={xCenter}
                    y={yTop + h / 2 + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="#FFFFFF"
                    opacity="0.95"
                  >
                    {d.isFloating ? 'Transition' : 'Total'}
                  </text>
                )}

                {/* Bottom X-axis Stage Badge */}
                <rect
                  x={xCenter - 28}
                  y={plotHeight + 12}
                  width="56"
                  height="18"
                  rx="9"
                  fill="#EDF4FD"
                  stroke="#CFE2FA"
                  strokeWidth="1"
                />
                <text
                  x={xCenter}
                  y={plotHeight + 25}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="800"
                  fill="#1E5EAB"
                >
                  Stage {d.stage}
                </text>

                {/* Bottom X-axis Multi-line Stage Name */}
                <text
                  x={xCenter}
                  y={plotHeight + 46}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill="#0F2649"
                >
                  {d.label.length > 20 ? d.label.split(' ').slice(0, 2).join(' ') : d.label}
                </text>
                {d.label.length > 20 && (
                  <text
                    x={xCenter}
                    y={plotHeight + 60}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="#0F2649"
                  >
                    {d.label.split(' ').slice(2).join(' ')}
                  </text>
                )}

                {/* Running total tag at the bottom */}
                <text
                  x={xCenter}
                  y={plotHeight + 78}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="#64748B"
                >
                  Total: {d.runningTotalHours.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}h
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
