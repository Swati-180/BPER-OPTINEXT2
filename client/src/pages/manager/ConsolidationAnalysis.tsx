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

type TabType = 'overview' | 'majorProcess' | 'liftVsKt' | 'byDepartment' | 'candidates';

type MajorProcessConsolidationItem = {
  majorProcess: string;
  totalHours: number;
  totalFte: number;
  consolidatableFte: number;
  retainedFte: number;
  pendingAssessmentFte?: number;
  consolidationPct: number;
  activityCount: number;
  consolidatableActivitiesCount: number;
  retainedActivitiesCount?: number;
  pendingActivitiesCount?: number;
};

type LiftVsKtItem = {
  majorProcess: string;
  totalEmployees: number;
  liftAndShift: { count: number; pct: number; fte: number };
  ktRequired: { count: number; pct: number; fte: number };
};

type ProcessDetailItem = {
  process: string;
  totalFte: number;
  consolidationPotential: number;
  retained: number;
  consolidationPct: number;
  cumulativePct: number;
  isTop80: boolean;
};

type OfficialPamSummary = {
  isAuditedPamBaseline?: boolean;
  totalHours?: number;
  totalFte?: number;
  consolidatableHours?: number;
  consolidatableFte?: number;
  consolidatableCount?: number;
  retainedHours?: number;
  retainedFte?: number;
  retainedCount?: number;
  pendingAssessmentHours?: number;
  pendingAssessmentFte?: number;
  pendingAssessmentCount?: number;
  assessedConsolidationRatePct?: number;
};

type ConsolidationAnalysisReport = {
  generatedAt?: string;
  summary?: {
    totalActivities?: number;
    consolidateActivities?: number;
    consolidationRatePct?: number;
    savedFte?: number;
    estimatedSavingsCr?: number;
  };
  officialPamSummary?: OfficialPamSummary;
  majorProcessConsolidation?: MajorProcessConsolidationItem[];
  majorProcessLiftVsKt?: Record<string, LiftVsKtItem>;
  majorProcessDetail?: Record<string, ProcessDetailItem[]>;
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

  async function loadReport(department: DepartmentFilter, blocking = false) {
    if (blocking || !report) {
      setIsLoading(true);
    }
    if (blocking) setError(null);
    try {
      const data = await getConsolidationAnalysisReport(department);
      setReport(data);
    } catch (err: any) {
      if (blocking || !report) {
        setError(err?.message || 'Failed to load consolidation analysis.');
      } else {
        console.warn('Consolidation background refresh failed (swallowed):', err?.message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReport(departmentFilter, true);
  }, [departmentFilter]);

  useEffect(() => {
    const refreshOnDataUpdate = () => {
      loadReport(departmentFilter);
    };

    const refreshInterval = window.setInterval(() => {
      loadReport(departmentFilter);
    }, 120_000);

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

      {/* Section 1: Official PAM 6x6 Audited Baseline (Slide 7 & 10 Rules) */}
      <section className="rounded-2xl border border-[#C5D9F2] bg-gradient-to-r from-[#F0F6FD] to-[#FFFFFF] p-5 shadow-[0_4px_16px_rgba(16,42,80,0.06)]">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#103058] text-white">
                Official PAM™ 6×6 Audited Baseline
              </span>
              <span className="text-xs text-[#5D789A]">
                Evaluated against Slide 7 PAM Framework (Score ≥ 7 & Checkpoints A/B)
              </span>
            </div>
            <p className="mt-1 text-xs text-[#6B85A6]">
              Workload classified deterministically from verified Process Assessment records. Pending activities are tracked explicitly.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[#D0E2F5] bg-white p-4">
            <span className="text-xs font-semibold text-[#5D789A]">Consolidatable Workload</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#166534]">
                {safeNumber(report?.officialPamSummary?.consolidatableFte).toFixed(2)} FTE
              </span>
              <span className="text-xs text-[#166534] font-medium">
                ({safeNumber(report?.officialPamSummary?.consolidatableCount)} activities)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#6B85A6]">
              {safeNumber(report?.officialPamSummary?.consolidatableHours).toFixed(1)} hrs/month
            </p>
          </div>

          <div className="rounded-xl border border-[#D0E2F5] bg-white p-4">
            <span className="text-xs font-semibold text-[#5D789A]">Retained Workload</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#92400E]">
                {safeNumber(report?.officialPamSummary?.retainedFte).toFixed(2)} FTE
              </span>
              <span className="text-xs text-[#92400E] font-medium">
                ({safeNumber(report?.officialPamSummary?.retainedCount)} activities)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#6B85A6]">
              {safeNumber(report?.officialPamSummary?.retainedHours).toFixed(1)} hrs/month (Excluded by score/exceptions)
            </p>
          </div>

          <div className="rounded-xl border border-[#D0E2F5] bg-white p-4">
            <span className="text-xs font-semibold text-[#5D789A]">Pending Assessment</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#4B5563]">
                {safeNumber(report?.officialPamSummary?.pendingAssessmentFte).toFixed(2)} FTE
              </span>
              <span className="text-xs text-[#4B5563] font-medium">
                ({safeNumber(report?.officialPamSummary?.pendingAssessmentCount)} activities)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#6B85A6]">
              {safeNumber(report?.officialPamSummary?.pendingAssessmentHours).toFixed(1)} hrs/month (Awaiting criteria rating)
            </p>
          </div>

          <div className="rounded-xl border border-[#D0E2F5] bg-white p-4">
            <span className="text-xs font-semibold text-[#5D789A]">Assessed Consolidation Rate</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#0F2649]">
                {safeNumber(report?.officialPamSummary?.assessedConsolidationRatePct).toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#6B85A6]">
              Consolidatable ÷ Assessed workload (excluding pending)
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Heuristic Screening & Scenario Planning (Volume/Keywords) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#5D789A] text-white">
            Heuristic Scenario Screening
          </span>
          <span className="text-xs text-[#5D789A]">
            Hypothetical planning model based on screening rules (Volume &gt; 100 hrs or repetitive keywords)
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={Target}
            label="Screening Rate"
            value={`${safeNumber(summary.consolidationRatePct).toFixed(1)}%`}
            helper="Screened candidate activities"
          />
          <KpiCard
            icon={TrendingDown}
            label="Estimated Saved FTE"
            value={safeNumber(summary.savedFte).toFixed(2)}
            helper="At 35% efficiency factor"
          />
          <KpiCard
            icon={DollarSign}
            label="Scenario Savings"
            value={`₹${safeNumber(summary.estimatedSavingsCr).toFixed(2)}Cr`}
            helper="Annual planning estimate"
          />
          <KpiCard
            icon={Building2}
            label="Screened Candidates"
            value={String(safeNumber(summary.consolidateActivities))}
            helper="Activities meeting screening threshold"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
        <div className="inline-flex rounded-xl border border-[#DDE7F3] bg-[#F8FBFF] p-1 mb-5 flex-wrap gap-1">
          <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <TabButton label="Major Process (Slide 10)" active={activeTab === 'majorProcess'} onClick={() => setActiveTab('majorProcess')} />
          <TabButton label="Lift & Shift vs. KT (Slides 11-30)" active={activeTab === 'liftVsKt'} onClick={() => setActiveTab('liftVsKt')} />
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

        {/* Slide 10: Consolidation Potential by Major Process */}
        {activeTab === 'majorProcess' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-[#102846]">Overall Consolidation Potential: Major Process View</h3>
                <p className="text-xs text-[#6E86A3]">Slide 10 Specification: Consolidatable vs. Retained FTE across major functional towers</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
                    <th className="px-4 py-3">Major Process</th>
                    <th className="px-4 py-3 text-right">Consolidatable (FTE)</th>
                    <th className="px-4 py-3 text-right">Retained (FTE)</th>
                    <th className="px-4 py-3 text-right">Pending Assessment (FTE)</th>
                    <th className="px-4 py-3 text-right">Total FTE</th>
                    <th className="px-4 py-3 text-right">% Consolidation</th>
                    <th className="px-4 py-3 text-center">Visual Split</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-sm">
                  {(!report?.majorProcessConsolidation || report.majorProcessConsolidation.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-xs text-[#94A3B8]">
                        No major process consolidation records found.
                      </td>
                    </tr>
                  ) : (
                    report.majorProcessConsolidation.map((item) => (
                      <tr key={item.majorProcess} className="hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 font-semibold text-[#1E293B]">{item.majorProcess}</td>
                        <td className="px-4 py-3 text-right font-bold text-[#059669]">{item.consolidatableFte.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-[#92400E] font-medium">{item.retainedFte.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-[#64748B]">{safeNumber(item.pendingAssessmentFte).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold text-[#0F172A]">{item.totalFte.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                            item.consolidationPct >= 70 ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-[#EFF6FF] text-[#1D4ED8]'
                          }`}>
                            {item.consolidationPct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="w-32 mx-auto h-3 bg-[#E2E8F0] rounded-full overflow-hidden flex">
                            <div className="bg-[#10B981] h-full" style={{ width: `${item.consolidationPct}%` }} title={`Consolidation: ${item.consolidationPct}%`} />
                            <div className="bg-[#94A3B8] h-full" style={{ width: `${100 - item.consolidationPct}%` }} title={`Retained: ${(100 - item.consolidationPct).toFixed(1)}%`} />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Slides 11-30 & 32-48: Lift & Shift vs KT & Pareto Process Breakdown */}
        {activeTab === 'liftVsKt' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-[#102846]">Consolidation Analysis: Lift & Shift vs. Knowledge Transfer</h3>
              <p className="text-xs text-[#6E86A3]">
                Slides 11–30 Specification: Employees with $\ge 70\%$ workload in a process qualify for Lift & Shift; otherwise fractional time requires KT. Slides 32–48: Cumulative Pareto splits.
              </p>
            </div>

            {(!report?.majorProcessLiftVsKt || Object.keys(report.majorProcessLiftVsKt).length === 0) ? (
              <div className="p-8 text-center text-sm text-[#94A3B8] border rounded-xl">
                No major process Lift & Shift records available for this filter.
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(report.majorProcessLiftVsKt).map(([major, lktVal]) => {
                  const lkt = lktVal as LiftVsKtItem;
                  const procs = report.majorProcessDetail?.[major] || [];
                  return (
                    <div key={major} className="rounded-xl border border-[#D9E4F2] p-4 bg-[#F8FAFC]">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E2E8F0] gap-2">
                        <div>
                          <h4 className="text-base font-bold text-[#0F2649]">{major}</h4>
                          <p className="text-xs text-[#64748B]">Workforce Scope: {lkt.totalEmployees} employees contributing workload</p>
                        </div>
                        {/* Lift & Shift vs KT Summary Chips */}
                        <div className="flex items-center gap-2">
                          <div className="rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] px-3 py-1.5 text-center">
                            <span className="text-[10px] uppercase font-bold text-[#1D4ED8]">Lift & Shift (≥70%)</span>
                            <p className="text-sm font-extrabold text-[#1E40AF]">
                              {lkt.liftAndShift.count} ({lkt.liftAndShift.pct}%) • {lkt.liftAndShift.fte} FTE
                            </p>
                          </div>
                          <div className="rounded-lg bg-[#FFF7ED] border border-[#FED7AA] px-3 py-1.5 text-center">
                            <span className="text-[10px] uppercase font-bold text-[#C2410C]">KT Required (&lt;70%)</span>
                            <p className="text-sm font-extrabold text-[#9A3412]">
                              {lkt.ktRequired.count} ({lkt.ktRequired.pct}%) • {lkt.ktRequired.fte} FTE
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Process-Level Pareto Split Table (Slides 32, 34, 36, etc.) */}
                      {procs.length > 0 && (
                        <div className="mt-3 overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-[#F1F5F9] text-[10px] font-bold uppercase tracking-wider text-[#475569] border-b border-[#E2E8F0]">
                                <th className="px-3 py-2">Process / Activity</th>
                                <th className="px-3 py-2 text-right">Consolidation Potential</th>
                                <th className="px-3 py-2 text-right">Retained</th>
                                <th className="px-3 py-2 text-right">Total FTE</th>
                                <th className="px-3 py-2 text-right">% Consolidation</th>
                                <th className="px-3 py-2 text-right">Cumulative %</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E2E8F0]">
                              {procs.map((p) => (
                                <tr key={p.process} className={`hover:bg-[#F8FAFC] ${p.isTop80 ? 'bg-[#F0FDF4]/40 font-medium' : ''}`}>
                                  <td className="px-3 py-2 text-[#1E293B]">
                                    {p.process}
                                    {p.isTop80 && <span className="ml-2 text-[9px] bg-[#DCFCE7] text-[#15803D] px-1.5 py-0.5 rounded font-bold">Top 80%</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-[#059669]">{p.consolidationPotential.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right text-[#64748B]">{p.retained.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right font-bold text-[#0F172A]">{p.totalFte.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-[#2563EB]">{p.consolidationPct.toFixed(1)}%</td>
                                  <td className="px-3 py-2 text-right font-mono text-[#475569]">{p.cumulativePct.toFixed(1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
