import { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  getFteAnalysisReport,
  getConsolidationAnalysisReport,
  getFitmentAnalysisReport,
  getUtilizationAnalysisReport,
  exportToCSV,
} from '@/src/lib/api';
import { InlineLoadingBlock } from '../../components/PortalSkeletons';

type TabType = 'fte' | 'consolidation' | 'fitment' | 'utilization';
type FteTabType = 'overview' | 'tower' | 'department' | 'activities';
type ConsolidationTabType = 'overview' | 'department' | 'candidates';
type FitmentTabType = 'overview' | 'label' | 'profiles';
type UtilizationTabType = 'overview' | 'frequency' | 'process' | 'employee' | 'department';

function parseMainTab(value: string | null): TabType {
  if (value === 'fte' || value === 'consolidation' || value === 'fitment' || value === 'utilization') {
    return value;
  }
  return 'fte';
}

function parseFteTab(value: string | null): FteTabType {
  if (value === 'overview' || value === 'tower' || value === 'department' || value === 'activities') {
    return value;
  }
  return 'overview';
}

function parseConsolidationTab(value: string | null): ConsolidationTabType {
  if (value === 'overview' || value === 'department' || value === 'candidates') {
    return value;
  }
  return 'overview';
}

function parseFitmentTab(value: string | null): FitmentTabType {
  if (value === 'overview' || value === 'label' || value === 'profiles') {
    return value;
  }
  return 'overview';
}

function parseUtilizationTab(value: string | null): UtilizationTabType {
  if (value === 'overview' || value === 'frequency' || value === 'process' || value === 'employee' || value === 'department') {
    return value;
  }
  return 'overview';
}

interface FteAnalysisReport {
  generatedAt: string;
  summary: {
    totalHours: number;
    totalFte: number;
    baselineHours: number;
    totalActivities: number;
    departments: number;
  };
  tabs: {
    byTower: Array<{
      tower: string;
      hours: number;
      fte: number;
      utilizationPct: number;
      activityCount: number;
    }>;
    byDepartment: Array<{
      department: string;
      hours: number;
      fte: number;
      utilizationPct: number;
      activityCount: number;
    }>;
    allActivities: Array<{
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
}

interface ConsolidationAnalysisReport {
  generatedAt: string;
  summary: {
    totalActivities: number;
    consolidateActivities: number;
    consolidationRatePct: number;
    savedFte: number;
    estimatedSavingsCr: number;
  };
  tabs: {
    byDepartment: Array<{
      department: string;
      totalActivities: number;
      consolidationCandidates: number;
      consolidationRatePct: number;
    }>;
    allCandidates: Array<{
      name: string;
      tower: string;
      department: string;
      process: string;
      monthlyHours: number;
      consolidationSignal: string;
      estimatedSavingsCr: number;
    }>;
  };
}

interface FitmentAnalysisReport {
  generatedAt: string;
  summary: {
    profiles: number;
    totalEmployees: number;
    coveragePct: number;
    avgWeightedScore: number;
    labelBreakdown: {
      fit: number;
      trainToFit: number;
      unfit: number;
    };
  };
  charts: {
    scoreDistribution: Array<{
      range: string;
      count: number;
    }>;
  };
  tabs: {
    byLabel: Array<{
      label: string;
      profiles: Array<{
        employeeId: string;
        name: string;
        designation: string;
        band: string;
        department: string;
        weightedScore: number;
        fitmentLabel: string;
        lastEvaluatedAt: string;
      }>;
    }>;
    allProfiles: Array<{
      employeeId: string;
      name: string;
      designation: string;
      band: string;
      department: string;
      weightedScore: number;
      fitmentLabel: string;
      lastEvaluatedAt: string;
    }>;
  };
}

interface UtilizationAnalysisReport {
  generatedAt: string;
  summary: {
    totalHours: number;
    totalSubmissions: number;
    totalFte: number;
    departments: number;
  };
  tabs: {
    byFrequency: Array<{
      frequency: string;
      hours: number;
      fte: number;
      activities: number;
    }>;
    byProcess: Array<{
      process: string;
      hours: number;
      fte: number;
      activities: number;
    }>;
    byEmployee: Array<{
      employeeName: string;
      department: string;
      hours: number;
      fte: number;
      activities: number;
    }>;
    byDepartment: Array<{
      department: string;
      hours: number;
      fte: number;
      activities: number;
    }>;
  };
}

const safeNumber = (val: any): string => {
  const num = parseFloat(val);
  return isNaN(num) ? '0' : num.toFixed(2);
};

export default function DeepAnalysis() {
  const [searchParams] = useSearchParams();
  const initialMainTab = parseMainTab(searchParams.get('tab'));
  const initialSubTab = searchParams.get('subTab');

  const [mainTab, setMainTab] = useState<TabType>(initialMainTab);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // FTE State
  const [fteTab, setFteTab] = useState<FteTabType>(
    initialMainTab === 'fte' ? parseFteTab(initialSubTab) : 'overview'
  );
  const [fteReport, setFteReport] = useState<FteAnalysisReport | null>(null);
  const [fteLoading, setFteLoading] = useState(true);
  const [fteError, setFteError] = useState<string | null>(null);
  const fteDepartments = useMemo(
    () => (fteReport?.tabs.byDepartment || []).map((d) => d.department),
    [fteReport]
  );

  // Consolidation State
  const [consolidationTab, setConsolidationTab] = useState<ConsolidationTabType>(
    initialMainTab === 'consolidation' ? parseConsolidationTab(initialSubTab) : 'overview'
  );
  const [consolidationReport, setConsolidationReport] = useState<ConsolidationAnalysisReport | null>(null);
  const [consolidationLoading, setConsolidationLoading] = useState(true);
  const [consolidationError, setConsolidationError] = useState<string | null>(null);
  const consolidationDepartments = useMemo(
    () => (consolidationReport?.tabs.byDepartment || []).map((d) => d.department),
    [consolidationReport]
  );

  // Fitment State
  const [fitmentTab, setFitmentTab] = useState<FitmentTabType>(
    initialMainTab === 'fitment' ? parseFitmentTab(initialSubTab) : 'overview'
  );
  const [fitmentReport, setFitmentReport] = useState<FitmentAnalysisReport | null>(null);
  const [fitmentLoading, setFitmentLoading] = useState(true);
  const [fitmentError, setFitmentError] = useState<string | null>(null);

  // Utilization State
  const [utilizationTab, setUtilizationTab] = useState<UtilizationTabType>(
    initialMainTab === 'utilization' ? parseUtilizationTab(initialSubTab) : 'overview'
  );
  const [utilizationReport, setUtilizationReport] = useState<UtilizationAnalysisReport | null>(null);
  const [utilizationLoading, setUtilizationLoading] = useState(true);
  const [utilizationError, setUtilizationError] = useState<string | null>(null);
  const utilizationDepartments = useMemo(
    () => (utilizationReport?.tabs.byDepartment || []).map((d) => d.department),
    [utilizationReport]
  );

  // Load FTE
  useEffect(() => {
    async function loadFte() {
      setFteLoading(true);
      setFteError(null);
      try {
        const data = await getFteAnalysisReport(departmentFilter || undefined);
        setFteReport(data);
      } catch (err) {
        setFteError((err as any)?.message || 'Failed to load FTE analysis.');
      } finally {
        setFteLoading(false);
      }
    }
    loadFte();
  }, [departmentFilter, refreshKey]);

  // Load Consolidation
  useEffect(() => {
    async function loadConsolidation() {
      setConsolidationLoading(true);
      setConsolidationError(null);
      try {
        const data = await getConsolidationAnalysisReport(departmentFilter || undefined);
        setConsolidationReport(data);
      } catch (err) {
        setConsolidationError((err as any)?.message || 'Failed to load consolidation analysis.');
      } finally {
        setConsolidationLoading(false);
      }
    }
    loadConsolidation();
  }, [departmentFilter, refreshKey]);

  // Load Fitment
  useEffect(() => {
    async function loadFitment() {
      setFitmentLoading(true);
      setFitmentError(null);
      try {
        const data = await getFitmentAnalysisReport();
        setFitmentReport(data);
      } catch (err) {
        setFitmentError((err as any)?.message || 'Failed to load fitment analysis.');
      } finally {
        setFitmentLoading(false);
      }
    }
    loadFitment();
  }, [refreshKey]);

  // Load Utilization
  useEffect(() => {
    async function loadUtilization() {
      setUtilizationLoading(true);
      setUtilizationError(null);
      try {
        const data = await getUtilizationAnalysisReport(departmentFilter || undefined);
        setUtilizationReport(data);
      } catch (err) {
        setUtilizationError((err as any)?.message || 'Failed to load utilization analysis.');
      } finally {
        setUtilizationLoading(false);
      }
    }
    loadUtilization();
  }, [departmentFilter, refreshKey]);

  useEffect(() => {
    const nextMainTab = parseMainTab(searchParams.get('tab'));
    const nextSubTab = searchParams.get('subTab');

    setMainTab(nextMainTab);

    if (nextMainTab === 'fte') {
      setFteTab(parseFteTab(nextSubTab));
    } else if (nextMainTab === 'consolidation') {
      setConsolidationTab(parseConsolidationTab(nextSubTab));
    } else if (nextMainTab === 'fitment') {
      setFitmentTab(parseFitmentTab(nextSubTab));
    } else {
      setUtilizationTab(parseUtilizationTab(nextSubTab));
    }
  }, [searchParams]);

  // Auto-refresh on data updates
  useEffect(() => {
    const refreshOnDataUpdate = () => {
      setRefreshKey((prev) => prev + 1);
    };
    const refreshInterval = window.setInterval(() => {
      refreshOnDataUpdate();
    }, 30000);
    window.addEventListener('bper:data-updated', refreshOnDataUpdate);
    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener('bper:data-updated', refreshOnDataUpdate);
    };
  }, []);

  const handleExport = async (data: any[], filename: string) => {
    setExportError(null);

    if (!data || data.length === 0) {
      setExportError('No data available to export for this view.');
      return;
    }

    setIsExporting(true);
    try {
      exportToCSV(data, filename);
    } catch {
      setExportError('Failed to export CSV. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7FAFE] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 md:p-6 shadow-[0_6px_18px_rgba(16,42,80,0.08)] animate-in fade-in duration-500">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-[#0F2649]">Deep Analysis Reports</h1>
              <p className="mt-2 text-sm text-[#637F9F]">
                Comprehensive analysis views with detailed breakdowns and multi-dimensional reporting
              </p>
            </div>
            <div className="inline-flex items-center rounded-xl border border-[#D6E2F0] bg-[#F7FAFE] px-4 py-2 text-xs font-semibold text-[#5F7898]">
              Last Updated: {new Date().toISOString().split('T')[0]}
            </div>
          </div>
        </section>

        {exportError && (
          <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {exportError}
          </section>
        )}

        {/* Main Tabs Navigation */}
        <section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
          <div className="border-b border-[#D9E4F2] p-5 md:p-6">
            <div className="flex gap-2 flex-wrap">
              {(['fte', 'consolidation', 'fitment', 'utilization'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMainTab(tab)}
                  className={`px-4 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 ${
                    mainTab === tab
                      ? 'bg-[#165BAA] text-white shadow-[0_4px_12px_rgba(22,91,170,0.3)]'
                      : 'bg-[#F7FAFE] text-[#637F9F] hover:bg-[#EEF4FC] border border-[#D9E4F2]'
                  }`}
                >
                  {tab === 'fte' && 'FTE Analysis'}
                  {tab === 'consolidation' && 'Consolidation'}
                  {tab === 'fitment' && 'Fitment Analysis'}
                  {tab === 'utilization' && 'Utilization'}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Department Filter (for applicable tabs) */}
        {(mainTab === 'fte' || mainTab === 'consolidation' || mainTab === 'utilization') && (
          <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 md:p-6 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
            <div className="max-w-xs">
              <label className="block text-sm font-bold text-[#0F2649] mb-2">Filter by Department</label>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full px-4 py-2.5 border border-[#D9E4F2] rounded-lg bg-white text-[#0F2649] font-semibold focus:outline-none focus:ring-2 focus:ring-[#165BAA] focus:border-transparent transition-all"
              >
                <option value="">All Departments</option>
                {(mainTab === 'fte'
                  ? fteDepartments
                  : mainTab === 'consolidation'
                  ? consolidationDepartments
                  : utilizationDepartments
                ).map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {/* FTE ANALYSIS TAB */}
        {mainTab === 'fte' && (
          <div>
            {fteError ? (
              <div className="bg-[#FEE5E5] border border-[#FACAC9] rounded-lg p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-[#DC2626]" />
                <span className="text-[#DC2626]">{fteError}</span>
                <button
                  onClick={() => setDepartmentFilter(departmentFilter)}
                  className="ml-auto px-3 py-1 bg-[#DC2626] text-white rounded text-sm hover:bg-[#BB1B1B]"
                >
                  Retry
                </button>
              </div>
            ) : fteLoading ? (
              <div className="py-6">
                <InlineLoadingBlock className="mx-auto max-w-xl" />
              </div>
            ) : !fteReport ? (
              <div className="bg-[#F7FAFE] border border-[#D9E4F2] rounded-2xl p-8 text-center">
                <p className="text-[#637F9F] font-semibold">No FTE analysis data available.</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Total Hours</p>
                    <p className="text-3xl font-bold text-[#0F2649] mt-3">
                      {safeNumber(fteReport.summary.totalHours)}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">Monthly allocation</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Total FTE</p>
                    <p className="text-3xl font-bold text-[#165BAA] mt-3">
                      {safeNumber(fteReport.summary.totalFte)}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">Headcount equivalent</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Activities</p>
                    <p className="text-3xl font-bold text-[#1A5BA7] mt-3">{fteReport.summary.totalActivities}</p>
                    <p className="text-xs text-[#8898AF] mt-2">Total work items</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Departments</p>
                    <p className="text-3xl font-bold text-[#2367AE] mt-3">{fteReport.summary.departments ?? fteReport.tabs.byDepartment.length}</p>
                    <p className="text-xs text-[#8898AF] mt-2">Active departments</p>
                  </div>
                </div>

                {/* Sub Tabs */}
                <div className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_6px_18px_rgba(16,42,80,0.08)] overflow-hidden">
                  <div className="border-b border-[#D9E4F2] flex gap-1 p-4 md:p-6 flex-wrap bg-[#F7FAFE]">
                    {(['overview', 'tower', 'department', 'activities'] as FteTabType[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setFteTab(tab)}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                          fteTab === tab
                            ? 'bg-[#165BAA] text-white shadow-[0_4px_12px_rgba(22,91,170,0.3)]'
                            : 'bg-white text-[#637F9F] hover:bg-[#EEF4FC] border border-[#D9E4F2]'
                        }`}
                      >
                        {tab === 'overview' && 'Overview'}
                        {tab === 'tower' && 'By Tower'}
                        {tab === 'department' && 'By Department'}
                        {tab === 'activities' && 'All Activities'}
                      </button>
                    ))}
                  </div>
                  <div className="p-6">
                    {fteTab === 'overview' && (
                      <div className="text-[#637F9F] text-sm leading-relaxed">
                        <p>
                          Overview of FTE allocation across <span className="font-bold text-[#0F2649]">{fteReport.summary.departments}</span> departments with{' '}
                          <span className="font-bold text-[#0F2649]">{fteReport.summary.totalActivities}</span> activities totaling <span className="font-bold text-[#165BAA]">{safeNumber(fteReport.summary.totalFte)}</span> FTE.
                        </p>
                      </div>
                    )}
                    {fteTab === 'tower' && (
                      <div className="space-y-4 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F7FAFE] border-b border-[#D9E4F2]">
                            <tr>
                              <th className="px-4 py-3 text-left font-bold text-[#0F2649]">Tower</th>
                              <th className="px-4 py-3 text-right font-bold text-[#0F2649]">Hours</th>
                              <th className="px-4 py-3 text-right font-bold text-[#0F2649]">FTE</th>
                              <th className="px-4 py-3 text-right font-bold text-[#0F2649]">Utilization %</th>
                              <th className="px-4 py-3 text-right font-bold text-[#0F2649]">Activities</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fteReport.tabs.byTower.map((row, idx) => (
                              <tr key={idx} className="border-b border-[#D9E4F2] hover:bg-[#F7FAFE] transition-colors">
                                <td className="px-4 py-3 text-[#0F2649] font-semibold">{row.tower}</td>
                                <td className="px-4 py-3 text-right text-[#637F9F]">{safeNumber(row.hours)}</td>
                                <td className="px-4 py-3 text-right text-[#165BAA] font-semibold">{safeNumber(row.fte)}</td>
                                <td className="px-4 py-3 text-right text-[#637F9F]">{safeNumber(row.utilizationPct)}%</td>
                                <td className="px-4 py-3 text-right text-[#637F9F]">{row.activityCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          onClick={() =>
                            handleExport(
                              fteReport.tabs.byTower,
                              `fte-by-tower-${new Date().toISOString().split('T')[0]}`
                            )
                          }
                          disabled={isExporting}
                          className="mt-4 px-5 py-2.5 bg-[#165BAA] text-white rounded-lg flex items-center gap-2 hover:bg-[#124a8a] disabled:opacity-50 font-semibold text-sm shadow-[0_4px_12px_rgba(22,91,170,0.3)] transition-all"
                        >
                          <Download className="w-4 h-4" />
                          Export CSV
                        </button>
                      </div>
                    )}
                    {fteTab === 'department' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F8FBFF] border-b border-[#E3EAF4]">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Department</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Hours</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">FTE</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Utilization %</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Activities</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fteReport.tabs.byDepartment.map((row, idx) => (
                              <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                                <td className="px-4 py-2 text-[#0F2649]">{row.department}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.hours)}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.fte)}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.utilizationPct)}%</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{row.activityCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          onClick={() =>
                            handleExport(
                              fteReport.tabs.byDepartment,
                              `fte-by-department-${new Date().toISOString().split('T')[0]}`
                            )
                          }
                          disabled={isExporting}
                          className="mt-4 px-4 py-2 bg-[#165BAA] text-white rounded flex items-center gap-2 hover:bg-[#0F4A8A] disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                      </div>
                    )}
                    {fteTab === 'activities' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F8FBFF] border-b border-[#E3EAF4]">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Activity</th>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Tower</th>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Department</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Hours</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">FTE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fteReport.tabs.allActivities.map((row, idx) => (
                              <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                                <td className="px-4 py-2 text-[#0F2649]">{row.name}</td>
                                <td className="px-4 py-2 text-[#0F2649]">{row.tower}</td>
                                <td className="px-4 py-2 text-[#0F2649]">{row.department}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.monthlyHours)}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.fte)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          onClick={() =>
                            handleExport(
                              fteReport.tabs.allActivities,
                              `fte-all-activities-${new Date().toISOString().split('T')[0]}`
                            )
                          }
                          disabled={isExporting}
                          className="mt-4 px-4 py-2 bg-[#165BAA] text-white rounded flex items-center gap-2 hover:bg-[#0F4A8A] disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONSOLIDATION ANALYSIS TAB */}
        {mainTab === 'consolidation' && (
          <div>
            {consolidationError ? (
              <div className="bg-[#FEE5E5] border border-[#FACAC9] rounded-2xl p-4 md:p-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#DC2626] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[#DC2626] font-semibold">{consolidationError}</p>
                  <button
                    onClick={() => setDepartmentFilter(departmentFilter)}
                    className="mt-3 px-3 py-1.5 bg-[#DC2626] text-white rounded-lg text-sm font-semibold hover:bg-[#BB1B1B]"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : consolidationLoading ? (
              <div className="py-6">
                <InlineLoadingBlock className="mx-auto max-w-xl" />
              </div>
            ) : !consolidationReport ? (
              <div className="bg-[#F7FAFE] border border-[#D9E4F2] rounded-2xl p-8 text-center">
                <p className="text-[#637F9F] font-semibold">No consolidation analysis data available.</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Consolidation Rate</p>
                    <p className="text-3xl font-bold text-[#0F2649] mt-3">
                      {safeNumber(consolidationReport.summary.consolidationRatePct)}%
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">Consolidation ratio</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Saved FTE</p>
                    <p className="text-3xl font-bold text-[#165BAA] mt-3">
                      {safeNumber(consolidationReport.summary.savedFte)}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">Potential reduction</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Est. Savings (₹Cr)</p>
                    <p className="text-3xl font-bold text-[#1A5BA7] mt-3">
                      {safeNumber(consolidationReport.summary.estimatedSavingsCr)}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">Cost reduction</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Candidates</p>
                    <p className="text-3xl font-bold text-[#2367AE] mt-3">
                      {consolidationReport.summary.consolidateActivities}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">Items for review</p>
                  </div>
                </div>

                {/* Sub Tabs */}
                <div className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_6px_18px_rgba(16,42,80,0.08)] overflow-hidden">
                  <div className="border-b border-[#D9E4F2] flex gap-1 p-4 md:p-6 flex-wrap bg-[#F7FAFE]">
                    {(['overview', 'department', 'candidates'] as ConsolidationTabType[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setConsolidationTab(tab)}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                          consolidationTab === tab
                            ? 'bg-[#165BAA] text-white shadow-[0_4px_12px_rgba(22,91,170,0.3)]'
                            : 'bg-white text-[#637F9F] hover:bg-[#EEF4FC] border border-[#D9E4F2]'
                        }`}
                      >
                        {tab === 'overview' && 'Overview'}
                        {tab === 'department' && 'By Department'}
                        {tab === 'candidates' && 'Candidates'}
                      </button>
                    ))}
                  </div>
                  <div className="p-6">
                    {consolidationTab === 'overview' && (
                      <div className="text-[#637F9F] text-sm leading-relaxed">
                        <p>
                          <span className="font-bold text-[#0F2649]">{consolidationReport.summary.consolidateActivities}</span> out of{' '}
                          <span className="font-bold text-[#0F2649]">{consolidationReport.summary.totalActivities}</span> activities identified for consolidation,
                          representing <span className="font-bold text-[#165BAA]">{safeNumber(consolidationReport.summary.consolidationRatePct)}%</span> of total workload
                          and potential savings of <span className="font-bold text-[#1A5BA7]">₹{safeNumber(consolidationReport.summary.estimatedSavingsCr)}Cr</span>.
                        </p>
                      </div>
                    )}
                    {consolidationTab === 'department' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F8FBFF] border-b border-[#E3EAF4]">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Department</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Total Activities</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Consolidation Candidates</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Rate %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {consolidationReport.tabs.byDepartment.map((row, idx) => (
                              <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                                <td className="px-4 py-2 text-[#0F2649]">{row.department}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{row.totalActivities}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{row.consolidationCandidates}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.consolidationRatePct)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          onClick={() =>
                            handleExport(
                              consolidationReport.tabs.byDepartment,
                              `consolidation-by-department-${new Date().toISOString().split('T')[0]}`
                            )
                          }
                          disabled={isExporting}
                          className="mt-4 px-4 py-2 bg-[#165BAA] text-white rounded flex items-center gap-2 hover:bg-[#0F4A8A] disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                      </div>
                    )}
                    {consolidationTab === 'candidates' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F8FBFF] border-b border-[#E3EAF4]">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Activity</th>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Department</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Hours</th>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Signal</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Est. Savings (₹Cr)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {consolidationReport.tabs.allCandidates.map((row, idx) => (
                              <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                                <td className="px-4 py-2 text-[#0F2649]">{row.name}</td>
                                <td className="px-4 py-2 text-[#0F2649]">{row.department}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.monthlyHours)}</td>
                                <td className="px-2 py-1 text-[#0F2649] text-xs bg-[#FEF3E5] rounded">
                                  {row.consolidationSignal}
                                </td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">
                                  {safeNumber(row.estimatedSavingsCr)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          onClick={() =>
                            handleExport(
                              consolidationReport.tabs.allCandidates,
                              `consolidation-candidates-${new Date().toISOString().split('T')[0]}`
                            )
                          }
                          disabled={isExporting}
                          className="mt-4 px-4 py-2 bg-[#165BAA] text-white rounded flex items-center gap-2 hover:bg-[#0F4A8A] disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FITMENT ANALYSIS TAB */}
        {mainTab === 'fitment' && (
          <div>
            {fitmentError ? (
              <div className="bg-[#FEE5E5] border border-[#FACAC9] rounded-2xl p-4 md:p-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#DC2626] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[#DC2626] font-semibold">{fitmentError}</p>
                  <button
                    onClick={() => setFitmentLoading(true)}
                    className="mt-3 px-3 py-1.5 bg-[#DC2626] text-white rounded-lg text-sm font-semibold hover:bg-[#BB1B1B]"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : fitmentLoading ? (
              <div className="py-6">
                <InlineLoadingBlock className="mx-auto max-w-xl" />
              </div>
            ) : !fitmentReport ? (
              <div className="bg-[#F7FAFE] border border-[#D9E4F2] rounded-2xl p-8 text-center">
                <p className="text-[#637F9F] font-semibold">No fitment analysis data available.</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Profiles Analyzed</p>
                    <p className="text-3xl font-bold text-[#0F2649] mt-3">{fitmentReport.summary.profiles}</p>
                    <p className="text-xs text-[#8898AF] mt-2">Employees evaluated</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Avg Score</p>
                    <p className="text-3xl font-bold text-[#165BAA] mt-3">
                      {safeNumber(fitmentReport.summary.avgWeightedScore)}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">On scale of 100</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Coverage %</p>
                    <p className="text-3xl font-bold text-[#1A5BA7] mt-3">
                      {safeNumber(fitmentReport.summary.coveragePct)}%
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">Org evaluation rate</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">FIT Profiles</p>
                    <p className="text-3xl font-bold text-[#2367AE] mt-3">
                      {safeNumber(fitmentReport.summary.labelBreakdown.fit)}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">Strong role alignment</p>
                  </div>
                </div>

                {/* Sub Tabs */}
                <div className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_6px_18px_rgba(16,42,80,0.08)] overflow-hidden">
                  <div className="border-b border-[#D9E4F2] flex gap-1 p-4 md:p-6 flex-wrap bg-[#F7FAFE]">
                    {(['overview', 'label', 'profiles'] as FitmentTabType[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setFitmentTab(tab)}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                          fitmentTab === tab
                            ? 'bg-[#165BAA] text-white shadow-[0_4px_12px_rgba(22,91,170,0.3)]'
                            : 'bg-white text-[#637F9F] hover:bg-[#EEF4FC] border border-[#D9E4F2]'
                        }`}
                      >
                        {tab === 'overview' && 'Overview'}
                        {tab === 'label' && 'By Label'}
                        {tab === 'profiles' && 'All Profiles'}
                      </button>
                    ))}
                  </div>
                  <div className="p-6">
                    {fitmentTab === 'overview' && (
                      <div className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-[#0F2649]">FIT</span>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 flex-1 bg-linear-to-r from-[#169F54] to-[#0F9C5E] rounded-full"
                                style={{ width: '100px' }}
                              ></div>
                              <span className="text-sm font-bold text-[#169F54]">
                                {safeNumber(fitmentReport.summary.labelBreakdown.fit)}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-[#0F2649]">TRAIN TO FIT</span>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 flex-1 bg-linear-to-r from-[#F59E0B] to-[#FCD34D] rounded-full"
                                style={{ width: '70px' }}
                              ></div>
                              <span className="text-sm font-bold text-[#D97706]">
                                {safeNumber(fitmentReport.summary.labelBreakdown.trainToFit)}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold text-[#0F2649]">UNFIT</span>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 flex-1 bg-linear-to-r from-[#DC2626] to-[#EF4444] rounded-full"
                                style={{ width: '50px' }}
                              ></div>
                              <span className="text-sm font-bold text-[#DC2626]">
                                {safeNumber(fitmentReport.summary.labelBreakdown.unfit)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {fitmentTab === 'label' && (
                      <div className="space-y-4">
                        {fitmentReport.tabs.byLabel.map((group, gIdx) => (
                          <div key={gIdx} className="border border-[#E3EAF4] rounded-lg overflow-hidden">
                            <div className="bg-[#F8FBFF] px-4 py-2 font-semibold text-[#0F2649]">{group.label}</div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-white border-t border-b border-[#E3EAF4]">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Name</th>
                                    <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Designation</th>
                                    <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Department</th>
                                    <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Score</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.profiles.map((profile, pIdx) => (
                                    <tr key={pIdx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                                      <td className="px-4 py-2 text-[#0F2649]">{profile.name}</td>
                                      <td className="px-4 py-2 text-[#0F2649]">{profile.designation}</td>
                                      <td className="px-4 py-2 text-[#0F2649]">{profile.department}</td>
                                      <td className="px-4 py-2 text-right text-[#0F2649] font-semibold">
                                        {safeNumber(profile.weightedScore)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {fitmentTab === 'profiles' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F8FBFF] border-b border-[#E3EAF4]">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Name</th>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Designation</th>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Department</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Score</th>
                              <th className="px-4 py-2 text-center font-semibold text-[#0F2649]">Label</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fitmentReport.tabs.allProfiles.map((profile, idx) => (
                              <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                                <td className="px-4 py-2 text-[#0F2649]">{profile.name}</td>
                                <td className="px-4 py-2 text-[#0F2649]">{profile.designation}</td>
                                <td className="px-4 py-2 text-[#0F2649]">{profile.department}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649] font-semibold">
                                  {safeNumber(profile.weightedScore)}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <span
                                    className={`px-2 py-1 text-xs font-semibold rounded ${
                                      profile.fitmentLabel === 'FIT'
                                        ? 'bg-[#DCFCE7] text-[#169F54]'
                                        : profile.fitmentLabel === 'TRAIN TO FIT'
                                        ? 'bg-[#FEF3E5] text-[#D97706]'
                                        : 'bg-[#FEE5E5] text-[#DC2626]'
                                    }`}
                                  >
                                    {profile.fitmentLabel}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          onClick={() =>
                            handleExport(
                              fitmentReport.tabs.allProfiles,
                              `fitment-all-profiles-${new Date().toISOString().split('T')[0]}`
                            )
                          }
                          disabled={isExporting}
                          className="mt-4 px-4 py-2 bg-[#165BAA] text-white rounded flex items-center gap-2 hover:bg-[#0F4A8A] disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* UTILIZATION ANALYSIS TAB */}
        {mainTab === 'utilization' && (
          <div>
            {utilizationError ? (
              <div className="bg-[#FEE5E5] border border-[#FACAC9] rounded-2xl p-4 md:p-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#DC2626] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[#DC2626] font-semibold">{utilizationError}</p>
                  <button
                    onClick={() => setDepartmentFilter(departmentFilter)}
                    className="mt-3 px-3 py-1.5 bg-[#DC2626] text-white rounded-lg text-sm font-semibold hover:bg-[#BB1B1B]"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : utilizationLoading ? (
              <div className="py-6">
                <InlineLoadingBlock className="mx-auto max-w-xl" />
              </div>
            ) : !utilizationReport ? (
              <div className="bg-[#F7FAFE] border border-[#D9E4F2] rounded-2xl p-8 text-center">
                <p className="text-[#637F9F] font-semibold">No utilization analysis data available.</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Total Hours</p>
                    <p className="text-3xl font-bold text-[#0F2649] mt-3">
                      {safeNumber(utilizationReport.summary.totalHours)}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">Monthly allocation</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Total FTE</p>
                    <p className="text-3xl font-bold text-[#165BAA] mt-3">
                      {safeNumber(utilizationReport.summary.totalFte)}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">Headcount equivalent</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Submissions</p>
                    <p className="text-3xl font-bold text-[#1A5BA7] mt-3">
                      {utilizationReport.summary.totalSubmissions}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">Records counted</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Departments</p>
                    <p className="text-3xl font-bold text-[#2367AE] mt-3">{utilizationReport.summary.departments ?? utilizationReport.tabs.byDepartment.length}</p>
                    <p className="text-xs text-[#8898AF] mt-2">Active departments</p>
                  </div>
                </div>

                {/* Sub Tabs */}
                <div className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_6px_18px_rgba(16,42,80,0.08)] overflow-hidden">
                  <div className="border-b border-[#D9E4F2] flex gap-1 p-4 md:p-6 flex-wrap bg-[#F7FAFE]">
                    {(['overview', 'frequency', 'process', 'employee', 'department'] as UtilizationTabType[]).map(
                      (tab) => (
                        <button
                          key={tab}
                          onClick={() => setUtilizationTab(tab)}
                          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                            utilizationTab === tab
                              ? 'bg-[#165BAA] text-white shadow-[0_4px_12px_rgba(22,91,170,0.3)]'
                              : 'bg-white text-[#637F9F] hover:bg-[#EEF4FC] border border-[#D9E4F2]'
                          }`}
                        >
                          {tab === 'overview' && 'Overview'}
                          {tab === 'frequency' && 'By Frequency'}
                          {tab === 'process' && 'By Process'}
                          {tab === 'employee' && 'By Employee'}
                          {tab === 'department' && 'By Department'}
                        </button>
                      )
                    )}
                  </div>
                  <div className="p-6">
                    {utilizationTab === 'overview' && (
                      <div className="text-[#637F9F] text-sm leading-relaxed">
                        <p>
                          Overview of work utilization across <span className="font-bold text-[#0F2649]">{utilizationReport.summary.departments}</span> departments with{' '}
                          <span className="font-bold text-[#0F2649]">{utilizationReport.summary.totalSubmissions}</span> submissions totaling{' '}
                          <span className="font-bold text-[#165BAA]">{safeNumber(utilizationReport.summary.totalFte)}</span> FTE.
                        </p>
                      </div>
                    )}
                    {utilizationTab === 'frequency' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F8FBFF] border-b border-[#E3EAF4]">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Frequency</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Hours</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">FTE</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Activities</th>
                            </tr>
                          </thead>
                          <tbody>
                            {utilizationReport.tabs.byFrequency.map((row, idx) => (
                              <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                                <td className="px-4 py-2 text-[#0F2649]">{row.frequency}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.hours)}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.fte)}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{row.activities}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          onClick={() =>
                            handleExport(
                              utilizationReport.tabs.byFrequency,
                              `utilization-by-frequency-${new Date().toISOString().split('T')[0]}`
                            )
                          }
                          disabled={isExporting}
                          className="mt-4 px-4 py-2 bg-[#165BAA] text-white rounded flex items-center gap-2 hover:bg-[#0F4A8A] disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                      </div>
                    )}
                    {utilizationTab === 'process' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F8FBFF] border-b border-[#E3EAF4]">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Process</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Hours</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">FTE</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Activities</th>
                            </tr>
                          </thead>
                          <tbody>
                            {utilizationReport.tabs.byProcess.map((row, idx) => (
                              <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                                <td className="px-4 py-2 text-[#0F2649]">{row.process}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.hours)}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.fte)}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{row.activities}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          onClick={() =>
                            handleExport(
                              utilizationReport.tabs.byProcess,
                              `utilization-by-process-${new Date().toISOString().split('T')[0]}`
                            )
                          }
                          disabled={isExporting}
                          className="mt-4 px-4 py-2 bg-[#165BAA] text-white rounded flex items-center gap-2 hover:bg-[#0F4A8A] disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                      </div>
                    )}
                    {utilizationTab === 'employee' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F8FBFF] border-b border-[#E3EAF4]">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Employee</th>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Department</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Hours</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">FTE</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Activities</th>
                            </tr>
                          </thead>
                          <tbody>
                            {utilizationReport.tabs.byEmployee.map((row, idx) => (
                              <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                                <td className="px-4 py-2 text-[#0F2649]">{row.employeeName}</td>
                                <td className="px-4 py-2 text-[#0F2649]">{row.department}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.hours)}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.fte)}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{row.activities}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          onClick={() =>
                            handleExport(
                              utilizationReport.tabs.byEmployee,
                              `utilization-by-employee-${new Date().toISOString().split('T')[0]}`
                            )
                          }
                          disabled={isExporting}
                          className="mt-4 px-4 py-2 bg-[#165BAA] text-white rounded flex items-center gap-2 hover:bg-[#0F4A8A] disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                      </div>
                    )}
                    {utilizationTab === 'department' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F8FBFF] border-b border-[#E3EAF4]">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Department</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Hours</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">FTE</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Activities</th>
                            </tr>
                          </thead>
                          <tbody>
                            {utilizationReport.tabs.byDepartment.map((row, idx) => (
                              <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                                <td className="px-4 py-2 text-[#0F2649]">{row.department}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.hours)}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.fte)}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{row.activities}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          onClick={() =>
                            handleExport(
                              utilizationReport.tabs.byDepartment,
                              `utilization-by-department-${new Date().toISOString().split('T')[0]}`
                            )
                          }
                          disabled={isExporting}
                          className="mt-4 px-4 py-2 bg-[#165BAA] text-white rounded flex items-center gap-2 hover:bg-[#0F4A8A] disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
