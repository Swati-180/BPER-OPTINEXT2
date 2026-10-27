import { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  getFteAnalysisReport,
  getConsolidationAnalysisReport,
  getFitmentAnalysisReport,
  getUtilizationAnalysisReport,
  exportToCSV,
  exportToExcelClient,
} from '@/src/lib/api';
import { InlineLoadingBlock } from '../../components/PortalSkeletons';

type TabType = 'fte' | 'consolidation' | 'fitment' | 'utilization' | 'hrBenchmark';
type FteTabType = 'overview' | 'tower' | 'department' | 'activities';
type ConsolidationTabType = 'overview' | 'department' | 'candidates';
type FitmentTabType = 'overview' | 'label' | 'profiles';
type UtilizationTabType = 'overview' | 'frequency' | 'process' | 'employee' | 'department';

function parseMainTab(value: string | null): TabType {
  if (value === 'fte' || value === 'consolidation' || value === 'fitment' || value === 'utilization' || value === 'hrBenchmark') {
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
      subProcess: string;
      frequency: string;
      monthlyHours: number;
      fte: number;
      activityCategory: string;
      employeeName: string;
      employeeId: string;
    }>;
  };
}

interface ConsolidationAnalysisReport {
  generatedAt: string;
  summary: {
    totalActivities: number;
    consolidateActivities: number;
    consolidationRatePct: number;
    candidateHours?: number;
    candidateFte?: number;
    savedFte: number;
    estimatedSavingsCr: number;
    screeningCriteria?: {
      highVolumeOnlyCount: number;
      keywordOnlyCount: number;
      overlapCount: number;
      totalUniqueScreened: number;
    };
    scenarioParameters?: {
      efficiencyFactor: number;
      costPerFteLakhs: number;
      isScenarioModel: boolean;
      notice: string;
    };
  };
  tabs: {
    byDepartment: Array<{
      department: string;
      totalActivities: number;
      consolidationCandidates: number;
      consolidationRatePct: number;
      candidateHours?: number;
      candidateFte?: number;
      savedFte?: number;
      estimatedSavingsCr?: number;
    }>;
    allCandidates: Array<{
      name?: string;
      activityName?: string;
      tower: string;
      department: string;
      process: string;
      monthlyHours: number;
      fte?: number;
      savedFte?: number;
      consolidationSignal: string;
      isHighVolume?: boolean;
      hasKeyword?: boolean;
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
    evaluationStatus?: string;
    dataNotice?: string | null;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMainTab = parseMainTab(searchParams.get('tab'));
  const initialSubTab = searchParams.get('subTab');

  const [mainTab, setMainTab] = useState<TabType>(initialMainTab);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);

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

  const filteredFteActivities = useMemo(() => {
    const towerFilter = searchParams.get('towerFilter');
    const query = activitySearchQuery.trim().toLowerCase();

    return (fteReport?.tabs.allActivities || []).filter((row) => {
      const matchesTower = !towerFilter || row.tower === towerFilter;
      const matchesSearch =
        !query ||
        [row.process, row.subProcess]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      return matchesTower && matchesSearch;
    });
  }, [activitySearchQuery, fteReport, searchParams]);

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
      const isInitial = !fteReport;
      if (isInitial) {
        setFteLoading(true);
        setFteError(null);
      }
      try {
        const data = await getFteAnalysisReport(departmentFilter || undefined);
        setFteReport(data);
        if (isInitial) setFteError(null);
      } catch (err) {
        if (isInitial) {
          setFteError((err as any)?.message || 'Failed to load FTE analysis.');
        } else {
          console.warn('FTE background refresh failed (swallowed):', (err as any)?.message);
        }
      } finally {
        setFteLoading(false);
      }
    }
    loadFte();
  }, [departmentFilter, refreshKey]);

  // Load Consolidation
  useEffect(() => {
    async function loadConsolidation() {
      const isInitial = !consolidationReport;
      if (isInitial) {
        setConsolidationLoading(true);
        setConsolidationError(null);
      }
      try {
        const data = await getConsolidationAnalysisReport(departmentFilter || undefined);
        setConsolidationReport(data);
        if (isInitial) setConsolidationError(null);
      } catch (err) {
        if (isInitial) {
          setConsolidationError((err as any)?.message || 'Failed to load consolidation analysis.');
        } else {
          console.warn('Consolidation background refresh failed (swallowed):', (err as any)?.message);
        }
      } finally {
        setConsolidationLoading(false);
      }
    }
    loadConsolidation();
  }, [departmentFilter, refreshKey]);

  // Load Fitment
  useEffect(() => {
    async function loadFitment() {
      const isInitial = !fitmentReport;
      if (isInitial) {
        setFitmentLoading(true);
        setFitmentError(null);
      }
      try {
        const data = await getFitmentAnalysisReport();
        setFitmentReport(data);
        if (isInitial) setFitmentError(null);
      } catch (err) {
        if (isInitial) {
          setFitmentError((err as any)?.message || 'Failed to load fitment analysis.');
        } else {
          console.warn('Fitment background refresh failed (swallowed):', (err as any)?.message);
        }
      } finally {
        setFitmentLoading(false);
      }
    }
    loadFitment();
  }, [refreshKey]);

  // Load Utilization
  useEffect(() => {
    async function loadUtilization() {
      const isInitial = !utilizationReport;
      if (isInitial) {
        setUtilizationLoading(true);
        setUtilizationError(null);
      }
      try {
        const data = await getUtilizationAnalysisReport(departmentFilter || undefined);
        setUtilizationReport(data);
        if (isInitial) setUtilizationError(null);
      } catch (err) {
        if (isInitial) {
          setUtilizationError((err as any)?.message || 'Failed to load utilization analysis.');
        } else {
          console.warn('Utilization background refresh failed (swallowed):', (err as any)?.message);
        }
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
    }, 120_000);
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
      exportToExcelClient(data, filename);
    } catch {
      setExportError('Failed to export Excel. Please try again.');
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
              {(['fte', 'consolidation', 'fitment', 'utilization', 'hrBenchmark'] as TabType[]).map((tab) => (
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
                  {tab === 'hrBenchmark' && 'HR GCC Benchmark (Slides 9–10)'}
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
                  <div className="border-b border-[#D9E4F2] flex flex-col gap-3 p-4 md:p-6 bg-[#F7FAFE]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex gap-1 flex-wrap">
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

                      <div className="w-full md:w-[320px] lg:w-[360px]">
                        <input
                          type="search"
                          value={activitySearchQuery}
                          onChange={(event) => setActivitySearchQuery(event.target.value)}
                          placeholder="Search by Sub process/Process Name"
                          className="h-10 w-full rounded-xl border border-[#C8D7EC] bg-white px-4 text-sm font-medium text-[#0F2649] outline-none placeholder:text-[#8AA0BA] focus:border-[#6E97CB] focus:ring-2 focus:ring-[#D7E6F7]"
                        />
                      </div>
                    </div>
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
                              <tr 
                                key={idx} 
                                className="border-b border-[#D9E4F2] hover:bg-[#F7FAFE] transition-colors cursor-pointer"
                                onClick={() => {
                                  setFteTab('activities');
                                  setSearchParams({ tab: 'fte', subTab: 'activities', towerFilter: row.tower });
                                }}
                              >
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
                          className="mt-4 inline-flex items-center gap-2 h-11 rounded-xl border border-[#D6E2F0] bg-white px-4 text-sm font-semibold text-[#243A59] hover:bg-[#F4F8FF] disabled:opacity-60 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          {isExporting ? 'Exporting...' : 'Excel'}
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
                          className="mt-4 inline-flex items-center gap-2 h-11 rounded-xl border border-[#D6E2F0] bg-white px-4 text-sm font-semibold text-[#243A59] hover:bg-[#F4F8FF] disabled:opacity-60 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          {isExporting ? 'Exporting...' : 'Excel'}
                        </button>
                      </div>
                    )}
                    {fteTab === 'activities' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F8FBFF] border-b border-[#E3EAF4]">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Sub Process</th>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Process Name</th>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Tower</th>
                              <th className="px-4 py-2 text-left font-semibold text-[#0F2649]">Department</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">Hours</th>
                              <th className="px-4 py-2 text-right font-semibold text-[#0F2649]">FTE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredFteActivities.map((row, idx) => (
                              <tr 
                                key={idx} 
                                className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF] cursor-pointer"
                                onClick={() => setSelectedActivity(row)}
                              >
                                <td className="px-4 py-2 text-[#5D789A]">{row.subProcess || '—'}</td>
                                <td className="px-4 py-2 text-[#0F2649] font-medium">{row.process || row.name || '—'}</td>
                                <td className="px-4 py-2 text-[#0F2649]">{row.tower || '—'}</td>
                                <td className="px-4 py-2 text-[#0F2649]">{row.department || '—'}</td>
                                <td className="px-4 py-2 text-right text-[#0F2649]">{safeNumber(row.monthlyHours)}</td>
                                <td className="px-4 py-2 text-right text-[#1E5EAB] font-semibold">{safeNumber(row.fte)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button
                          onClick={() =>
                            handleExport(
                              filteredFteActivities,
                              `fte-all-activities-${new Date().toISOString().split('T')[0]}`
                            )
                          }
                          disabled={isExporting}
                          className="mt-4 inline-flex items-center gap-2 h-11 rounded-xl border border-[#D6E2F0] bg-white px-4 text-sm font-semibold text-[#243A59] hover:bg-[#F4F8FF] disabled:opacity-60 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          {isExporting ? 'Exporting...' : 'Excel'}
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
                {/* Scenario Model Disclaimer Banner */}
                <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl p-4 text-xs text-[#1E40AF] leading-relaxed">
                  <span className="font-bold">Planning Simulation Model:</span> Screened candidate activities represent high-volume items (≥26 hrs/month) and self-noted automation comments. FTE and cost reductions are hypothetical simulation scenarios based on a configurable 35% efficiency assumption and ₹10L/FTE, not verified historical savings.
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Screened Activities</p>
                    <p className="text-3xl font-bold text-[#2367AE] mt-3">
                      {consolidationReport.summary.consolidateActivities}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">
                      {consolidationReport.summary.screeningCriteria ? `${consolidationReport.summary.screeningCriteria.highVolumeOnlyCount} high-vol + ${consolidationReport.summary.screeningCriteria.keywordOnlyCount} keyword` : 'Items meeting criteria'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Screened Workload</p>
                    <p className="text-3xl font-bold text-[#0F2649] mt-3">
                      {safeNumber(consolidationReport.summary.candidateHours ?? 0)} hrs
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">
                      {safeNumber(consolidationReport.summary.candidateFte ?? 0)} FTE pool ({safeNumber(consolidationReport.summary.consolidationRatePct)}% of total)
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Scenario: Saved FTE</p>
                    <p className="text-3xl font-bold text-[#165BAA] mt-3">
                      {safeNumber(consolidationReport.summary.savedFte)}
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">At 35% assumed factor</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_4px_12px_rgba(16,42,80,0.06)] hover:shadow-[0_6px_16px_rgba(16,42,80,0.1)] transition-all">
                    <p className="text-xs font-bold text-[#637F9F] uppercase tracking-wide">Scenario: Cost Impact</p>
                    <p className="text-3xl font-bold text-[#1A5BA7] mt-3">
                      ₹{safeNumber(consolidationReport.summary.estimatedSavingsCr)} Cr
                    </p>
                    <p className="text-xs text-[#8898AF] mt-2">At ₹10L/FTE assumption</p>
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
                          className="mt-4 inline-flex items-center gap-2 h-11 rounded-xl border border-[#D6E2F0] bg-white px-4 text-sm font-semibold text-[#243A59] hover:bg-[#F4F8FF] disabled:opacity-60 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          {isExporting ? 'Exporting...' : 'Excel'}
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
                          className="mt-4 inline-flex items-center gap-2 h-11 rounded-xl border border-[#D6E2F0] bg-white px-4 text-sm font-semibold text-[#243A59] hover:bg-[#F4F8FF] disabled:opacity-60 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          {isExporting ? 'Exporting...' : 'Excel'}
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
                {/* Pending Evaluation Banner if coverage is minimal */}
                {fitmentReport.summary.dataNotice && (
                  <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-4 text-xs text-[#92400E] leading-relaxed">
                    <span className="font-bold">Evaluation Status ({fitmentReport.summary.evaluationStatus || 'Pending'}):</span> {fitmentReport.summary.dataNotice}
                  </div>
                )}

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

        {/* HR GCC BENCHMARK TAB (Slides 9 & 10) */}
        {mainTab === 'hrBenchmark' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Source Distinction Banner */}
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 text-amber-900 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-amber-700 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-base text-amber-950">
                    Strategic HR GCC Transformation Benchmark Model (Source: WDT Presentation Slides 9 & 10)
                  </h3>
                  <p className="mt-1 text-sm text-amber-800 leading-relaxed">
                    <strong>Important Distinction:</strong> The figures below represent the executive leadership benchmark model for HR Global Capability Center (GCC) transition feasibility. This reference data is <strong>strictly separated</strong> from operational F&A workforce data (WDT submissions). No synthetic employee records or operational submissions have been created for this benchmark.
                  </p>
                </div>
              </div>
            </div>

            {/* Benchmark High-Level Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-[#D9E4F2] bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-[#637F9F]">Benchmark Scope</p>
                <p className="mt-2 text-2xl font-bold text-[#0F2649]">591.0 FTE</p>
                <p className="mt-1 text-xs text-[#637F9F]">25 Business Units Evaluated</p>
              </div>
              <div className="rounded-xl border border-[#D9E4F2] bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-[#637F9F]">Consolidation Target</p>
                <p className="mt-2 text-2xl font-bold text-emerald-600">419.6 FTE (71.0%)</p>
                <p className="mt-1 text-xs text-emerald-700 font-medium">Lift & Shift / KT</p>
              </div>
              <div className="rounded-xl border border-[#D9E4F2] bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-[#637F9F]">Retained Workload</p>
                <p className="mt-2 text-2xl font-bold text-[#165BAA]">171.4 FTE (29.0%)</p>
                <p className="mt-1 text-xs text-[#637F9F]">Retained In-Country</p>
              </div>
              <div className="rounded-xl border border-[#D9E4F2] bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-[#637F9F]">Transition Model</p>
                <p className="mt-2 text-2xl font-bold text-[#0F2649]">11 Towers</p>
                <p className="mt-1 text-xs text-[#637F9F]">Major HR Process Towers</p>
              </div>
            </div>

            {/* Slide 10: Major Process Breakdown */}
            <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 md:p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#0F2649]">
                    Slide 10: HR Major Process Feasibility Breakdown
                  </h3>
                  <p className="text-xs text-[#637F9F]">
                    Reference model for 11 HR operational towers across Lift & Shift, Knowledge Transfer, and Retained scope
                  </p>
                </div>
                <button
                  onClick={() =>
                    handleExport(
                      [
                        { majorProcess: 'Talent Acquisition & Onboarding', totalFte: 112.5, consolidatableFte: 84.4, retainedFte: 28.1, consolidationRatePct: '75.0%' },
                        { majorProcess: 'HR Operations & Employee Data Management', totalFte: 98.0, consolidatableFte: 78.4, retainedFte: 19.6, consolidationRatePct: '80.0%' },
                        { majorProcess: 'Payroll & Benefits Administration', totalFte: 84.0, consolidatableFte: 58.8, retainedFte: 25.2, consolidationRatePct: '70.0%' },
                        { majorProcess: 'Learning & Development Administration', totalFte: 54.0, consolidatableFte: 43.2, retainedFte: 10.8, consolidationRatePct: '80.0%' },
                        { majorProcess: 'Compensation & Benefits Analytics', totalFte: 42.0, consolidatableFte: 29.4, retainedFte: 12.6, consolidationRatePct: '70.0%' },
                        { majorProcess: 'Performance Management Operations', totalFte: 36.5, consolidatableFte: 25.6, retainedFte: 10.9, consolidationRatePct: '70.1%' },
                        { majorProcess: 'HR IT Systems & Workforce Reporting', totalFte: 48.0, consolidatableFte: 38.4, retainedFte: 9.6, consolidationRatePct: '80.0%' },
                        { majorProcess: 'Employee Relations & Advisory', totalFte: 45.0, consolidatableFte: 18.0, retainedFte: 27.0, consolidationRatePct: '40.0%' },
                        { majorProcess: 'Global Mobility & Immigration', totalFte: 26.0, consolidatableFte: 18.2, retainedFte: 7.8, consolidationRatePct: '70.0%' },
                        { majorProcess: 'Organizational Design & Workforce Planning', totalFte: 25.0, consolidatableFte: 12.5, retainedFte: 12.5, consolidationRatePct: '50.0%' },
                        { majorProcess: 'Leadership Development & Succession', totalFte: 20.0, consolidatableFte: 12.7, retainedFte: 7.3, consolidationRatePct: '63.5%' },
                      ],
                      `hr-gcc-slide10-benchmark-${new Date().toISOString().split('T')[0]}`
                    )
                  }
                  className="px-3.5 py-2 bg-[#165BAA] text-white rounded-lg text-xs font-semibold flex items-center gap-2 hover:bg-[#0F4A8A]"
                >
                  <Download className="w-4 h-4" />
                  Export Slide 10 Data
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#F5F8FD] text-xs font-bold text-[#637F9F] border-b border-[#D9E4F2]">
                      <th className="px-4 py-3">HR Major Process Tower</th>
                      <th className="px-4 py-3 text-right">Benchmark Total FTE</th>
                      <th className="px-4 py-3 text-right">Consolidatable FTE</th>
                      <th className="px-4 py-3 text-right">Retained FTE</th>
                      <th className="px-4 py-3 text-right">Consolidation Feasibility %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { majorProcess: 'Talent Acquisition & Onboarding', totalFte: 112.5, consolidatableFte: 84.4, retainedFte: 28.1, rate: '75.0%' },
                      { majorProcess: 'HR Operations & Employee Data Management', totalFte: 98.0, consolidatableFte: 78.4, retainedFte: 19.6, rate: '80.0%' },
                      { majorProcess: 'Payroll & Benefits Administration', totalFte: 84.0, consolidatableFte: 58.8, retainedFte: 25.2, rate: '70.0%' },
                      { majorProcess: 'Learning & Development Administration', totalFte: 54.0, consolidatableFte: 43.2, retainedFte: 10.8, rate: '80.0%' },
                      { majorProcess: 'Compensation & Benefits Analytics', totalFte: 42.0, consolidatableFte: 29.4, retainedFte: 12.6, rate: '70.0%' },
                      { majorProcess: 'Performance Management Operations', totalFte: 36.5, consolidatableFte: 25.6, retainedFte: 10.9, rate: '70.1%' },
                      { majorProcess: 'HR IT Systems & Workforce Reporting', totalFte: 48.0, consolidatableFte: 38.4, retainedFte: 9.6, rate: '80.0%' },
                      { majorProcess: 'Employee Relations & Advisory', totalFte: 45.0, consolidatableFte: 18.0, retainedFte: 27.0, rate: '40.0%' },
                      { majorProcess: 'Global Mobility & Immigration', totalFte: 26.0, consolidatableFte: 18.2, retainedFte: 7.8, rate: '70.0%' },
                      { majorProcess: 'Organizational Design & Workforce Planning', totalFte: 25.0, consolidatableFte: 12.5, retainedFte: 12.5, rate: '50.0%' },
                      { majorProcess: 'Leadership Development & Succession', totalFte: 20.0, consolidatableFte: 12.7, retainedFte: 7.3, rate: '63.5%' },
                    ].map((row, idx) => (
                      <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                        <td className="px-4 py-3 font-semibold text-[#0F2649]">{row.majorProcess}</td>
                        <td className="px-4 py-3 text-right font-medium text-[#0F2649]">{row.totalFte.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">{row.consolidatableFte.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right text-[#637F9F]">{row.retainedFte.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right font-bold text-[#165BAA]">{row.rate}</td>
                      </tr>
                    ))}
                    <tr className="bg-[#F0F5FA] font-bold text-[#0F2649] border-t-2 border-[#D9E4F2]">
                      <td className="px-4 py-3">Total Benchmark Scope</td>
                      <td className="px-4 py-3 text-right">591.0</td>
                      <td className="px-4 py-3 text-right text-emerald-700">419.6</td>
                      <td className="px-4 py-3 text-right text-[#637F9F]">171.4</td>
                      <td className="px-4 py-3 text-right text-[#165BAA]">71.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Slide 9: Business Unit Distribution Summary */}
            <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 md:p-6 shadow-sm">
              <h3 className="text-lg font-bold text-[#0F2649] mb-1">
                Slide 9: Business Unit GCC Opportunity Map
              </h3>
              <p className="text-xs text-[#637F9F] mb-4">
                High-level distribution across 25 corporate and regional business entities evaluated in executive review
              </p>
              <div className="p-4 rounded-xl bg-[#F7FAFE] border border-[#D9E4F2] text-xs text-[#526B88] leading-relaxed">
                The Slide 9 benchmark distributes the 591.0 HR FTE portfolio across 25 legal entities and operating divisions. Consistent with leadership guidance, operational WDT submission data is gathered directly from department employees and is not merged with this target reference model.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drill-down slide panel for Activity detail */}
      {selectedActivity && fteReport && (
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
                  <div className="col-span-2 rounded-xl border border-[#D9E4F2] bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8AA0BA]">Sub Process</p>
                    <p className="mt-1 text-sm font-semibold text-[#0F2649]">{selectedActivity.subProcess || '—'}</p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-[#D9E4F2] bg-[#F5F8FD] p-4 shadow-sm border-[#B1C8E6]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#617D9D]">Total FTE</p>
                    <p className="mt-1 text-lg font-bold text-[#1E5EAB]">
                      {fteReport.tabs.allActivities
                        .filter(a => a.process === selectedActivity.process && a.subProcess === selectedActivity.subProcess && a.tower === selectedActivity.tower)
                        .reduce((sum, a) => sum + Number(a.fte), 0)
                        .toFixed(2)}
                    </p>
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
                      {fteReport.tabs.allActivities
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
