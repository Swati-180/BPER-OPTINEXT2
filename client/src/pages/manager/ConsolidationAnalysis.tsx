import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  Filter,
  TrendingDown,
  Target,
  DollarSign,
  Building2,
} from 'lucide-react';
import { getConsolidationAnalysisReport, exportToCSV } from '../../lib/api';
import { DashboardSkeleton } from '../../components/PortalSkeletons';

type TabType = 'overview' | 'byDepartment' | 'candidates';

type ConsolidationAnalysisReport = {
  generatedAt?: string;
  summary?: {
    totalActivities?: number;
    consolidateActivities?: number;
    consolidationRatePct?: number;
    savedFte?: number;
    estimatedSavingsCr?: number;
  };
  tabs?: {
    byDepartment?: Array<{
      department: string;
      totalActivities: number;
      consolidateActivities: number;
      consolidationRatePct: number;
      savedFte: number;
      estimatedSavingsCr: number;
    }>;
    allCandidates?: Array<{
      activityName: string;
      tower: string;
      department: string;
      process: string;
      frequency: string;
      monthlyHours: number;
      fte: number;
      savedFte: number;
      estimatedSavingsCr: number;
      consolidationSignal: string;
      comment: string;
    }>;
  };
};

type DepartmentFilter = 'All Departments' | string;

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function ConsolidationAnalysisPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>('All Departments');
  const [report, setReport] = useState<ConsolidationAnalysisReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function loadReport(department: DepartmentFilter) {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getConsolidationAnalysisReport(department);
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load consolidation analysis.');
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
  const byDepartment = Array.isArray(report?.tabs?.byDepartment) ? report!.tabs!.byDepartment! : [];
  const allCandidates = Array.isArray(report?.tabs?.allCandidates) ? report!.tabs!.allCandidates! : [];

  const departments = useMemo(() => {
    const options = byDepartment.map((item) => item.department).filter(Boolean);
    return ['All Departments', ...Array.from(new Set(options)).sort((a: string, b: string) => a.localeCompare(b))];
  }, [byDepartment]);

  function handleExportByDepartment() {
    setIsExporting(true);
    try {
      exportToCSV(
        byDepartment,
        'Consolidation-By-Department',
        ['department', 'totalActivities', 'consolidateActivities', 'consolidationRatePct', 'savedFte', 'estimatedSavingsCr']
      );
    } finally {
      setIsExporting(false);
    }
  }

  function handleExportCandidates() {
    setIsExporting(true);
    try {
      exportToCSV(
        allCandidates,
        'Consolidation-Candidates',
        ['activityName', 'tower', 'department', 'process', 'frequency', 'monthlyHours', 'fte', 'savedFte', 'estimatedSavingsCr', 'consolidationSignal', 'comment']
      );
    } finally {
      setIsExporting(false);
    }
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
              <p className="text-sm font-semibold text-red-700">Unable to load consolidation analysis</p>
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
            <h1 className="text-2xl font-bold text-[#0F2649]">Consolidation Analysis</h1>
            <p className="mt-1 text-sm text-[#5D789A]">Process consolidation opportunities and estimated savings</p>
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
          icon={Target}
          label="Consolidation Rate"
          value={`${safeNumber(summary.consolidationRatePct).toFixed(1)}%`}
          helper="Activities to consolidate"
        />
        <KpiCard
          icon={TrendingDown}
          label="Saved FTE"
          value={safeNumber(summary.savedFte).toFixed(2)}
          helper="From consolidation"
        />
        <KpiCard
          icon={DollarSign}
          label="Est. Savings"
          value={`₹${safeNumber(summary.estimatedSavingsCr).toFixed(2)}Cr`}
          helper="Annual estimate"
        />
        <KpiCard
          icon={Building2}
          label="Candidates"
          value={String(safeNumber(summary.consolidateActivities))}
          helper="Activities to review"
        />
      </section>

      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
        <div className="inline-flex rounded-xl border border-[#DDE7F3] bg-[#F8FBFF] p-1 mb-5">
          <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <TabButton label="By Department" active={activeTab === 'byDepartment'} onClick={() => setActiveTab('byDepartment')} />
          <TabButton label="Candidates" active={activeTab === 'candidates'} onClick={() => setActiveTab('candidates')} />
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="text-sm text-[#5D789A]">
              <p>Total activities analyzed: <strong>{safeNumber(summary.totalActivities)}</strong></p>
              <p className="mt-1">Consolidation candidates: <strong>{safeNumber(summary.consolidateActivities)}</strong></p>
              <p className="mt-1">Consolidation rate: <strong>{safeNumber(summary.consolidationRatePct).toFixed(1)}%</strong></p>
              <p className="mt-2 pt-2 border-t border-[#E3EAF4]" style={{color: '#1E5EAB'}}>Potential savings: <strong>₹{safeNumber(summary.estimatedSavingsCr).toFixed(2)} Cr</strong></p>
              <p className="mt-1 text-xs text-[#8AA0BA]">Based on 35% FTE reduction per consolidated activity</p>
            </div>
          </div>
        )}

        {activeTab === 'byDepartment' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[#0F2649]">Consolidation by Department</h3>
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
                      <th className="px-5 py-3 text-right">Total Activities</th>
                      <th className="px-5 py-3 text-right">Consolidate</th>
                      <th className="px-5 py-3 text-right">Rate %</th>
                      <th className="px-5 py-3 text-right">Saved FTE</th>
                      <th className="px-5 py-3 text-right">Est. Savings (Cr)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byDepartment.map((row, idx) => (
                      <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                        <td className="px-5 py-3 font-medium text-[#0F2649]">{row.department}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.totalActivities}</td>
                        <td className="px-5 py-3 text-right text-[#1E5EAB] font-semibold">{row.consolidateActivities}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.consolidationRatePct}%</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.savedFte}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">₹{row.estimatedSavingsCr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'candidates' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[#0F2649]">Consolidation Candidates ({allCandidates.length})</h3>
              <button
                type="button"
                onClick={handleExportCandidates}
                disabled={isExporting}
                className="flex items-center gap-2 rounded-lg border border-[#D2DEED] bg-[#F7FAFF] px-3 py-1.5 text-xs font-semibold text-[#1E5EAB] hover:bg-[#EAF2FF] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            {allCandidates.length === 0 ? (
              <div className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4 text-center text-sm text-[#8AA0BA]">
                No consolidation candidates available for this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-220 border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                      <th className="px-5 py-3">Activity Name</th>
                      <th className="px-5 py-3">Tower</th>
                      <th className="px-5 py-3">Department</th>
                      <th className="px-5 py-3">Process</th>
                      <th className="px-5 py-3 text-right">Hours</th>
                      <th className="px-5 py-3 text-right">Saved FTE</th>
                      <th className="px-5 py-3 text-right">Est. Savings (Cr)</th>
                      <th className="px-5 py-3">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allCandidates.map((row, idx) => (
                      <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                        <td className="px-5 py-3 font-medium text-[#0F2649]">{row.activityName}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{row.tower}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{row.department}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{row.process}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">{row.monthlyHours}</td>
                        <td className="px-5 py-3 text-right text-[#1E5EAB] font-semibold">{row.savedFte}</td>
                        <td className="px-5 py-3 text-right text-[#5D789A]">₹{row.estimatedSavingsCr}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${
                            row.consolidationSignal === 'Yes'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {row.consolidationSignal}
                          </span>
                        </td>
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
