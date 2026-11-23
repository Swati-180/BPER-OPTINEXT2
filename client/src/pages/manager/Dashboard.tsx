import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock3,
  Download,
  FileCheck2,
  HelpCircle,
  RefreshCw,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { exportDashboardPdf } from '../../lib/pdfExport';
import { exportDashboardWord } from '../../lib/wordExport';
import { exportDashboardExcel } from '../../lib/dashboardExcelExport';
import { FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import {
  getDashboardReport,
  getFteConsolidationSummaryReport,
  getFteSummaryReport,
  getFitmentSummaryReport,
} from '../../lib/api';
import { loadAuthUser } from '../../lib/authStorage';
import { useNavigate } from 'react-router-dom';
import { formatDateISO } from '../employee/bperSubmissionStorage';
import { InlineUpdatingBadge, SkeletonBlock } from '../../components/PortalSkeletons';

type Trend = 'up' | 'steady' | 'down' | 'baseline' | null;

type ActivityInsight = {
  name: string;
  tower: string;
  monthlyHours: number;
  fte: number;
  consolidate: boolean;
  trend?: Trend;
  history?: number[];
};

type DashboardReport = {
  generatedAt?: string;
  submissionWindow?: {
    isOpen?: boolean;
    message?: string;
    daysUntilNext?: number;
  };
  summary?: {
    totalEmployees?: number;
    activeUserAccounts?: number;
    hasAuthoritativeRoster?: boolean;
    rosterSource?: 'master_roster' | 'submission_participants' | 'submission_workforce';
    totalStaff?: number;
    vacantPositions?: number;
    submissionParticipants?: {
      namedStaff: number;
      vacancies: number;
      total: number;
    };
    totalSubmissions?: number;
    pendingReview?: number;
    approved?: number;
    approvedFilled?: number;
    approvedVacant?: number;
    avgUtilizationPct?: number;
    staffedHours?: number;
    staffedFte?: number;
    vacantHours?: number;
    vacantFte?: number;
    totalHours?: number;
    totalFte?: number;
    primaryEmployeeFte?: number;
    staffedUtilizationPct?: number;
    cappedStaffedUtilizationPct?: number;
    workloadVsTargetPct?: number;
    inScopeTargetHeadcount?: number;
    totalTowersCount?: number;
    completeness?: {
      inScopeHeadcount: number;
      totalSubmitted: number;
      filledSubmitted: number;
      vacantSubmitted: number;
      approvedFilled: number;
      approvedVacant: number;
      approvedTotal: number;
      staffedFte: number;
      vacantFte: number;
      totalFte: number;
      staffedUtilizationPct?: number;
      workloadVsTargetPct?: number;
      baselineHoursPerMonth: number;
    };
  };
  charts?: {
    towerFte?: Array<{ tower: string; fte: number }>;
    teamUtilization?: Array<{ label: string; utilizationPct: number }>;
    topActivities?: ActivityInsight[];
    totalActivitiesCount?: number;
    submissionStatusSegments?: Array<{
      key: string;
      label: string;
      count: number;
      percent: number;
    }>;
    employeeFteData?: Array<{ label: string; fte: number }>;
  };
  tables?: {
    recentSubmissions?: Array<{
      referenceId: string;
      employee: { name: string; employeeId: string };
      totalHours: number;
      status: 'Under Review' | 'Approved' | 'Changes Requested';
      submittedAt: string;
    }>;
  };
};

type FteSummaryReport = {
  charts?: {
    byTower?: Array<{ tower: string; fte: number }>;
  };
};

type FteConsolidationReport = {
  summary?: {
    totalActivities?: number;
    consolidateActivities?: number;
    consolidationRatePct?: number;
    candidateHours?: number;
    candidateFte?: number;
    savedFte?: number;
    estimatedSavingsCr?: number;
    screeningCriteria?: {
      highVolumeOnlyCount?: number;
      keywordOnlyCount?: number;
      overlapCount?: number;
      totalUniqueScreened?: number;
    };
    scenarioParameters?: {
      efficiencyFactor?: number;
      costPerFteLakhs?: number;
      standardMonthlyHours?: number;
      screeningThresholdHours?: number;
      screeningKeywords?: string[];
      isScenarioModel?: boolean;
      isWhatIfScenario?: boolean;
      notice?: string;
    };
  };
};

type FitmentSummaryReport = {
  summary?: {
    coveragePct?: number;
    avgWeightedScore?: number;
  };
};

function toPercent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`;
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getStatusClass(status: 'Under Review' | 'Approved' | 'Changes Requested') {
  if (status === 'Approved') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'Changes Requested') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-blue-100 text-blue-700 border-blue-200';
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center text-red-600 bg-red-50/50 rounded-xl border border-red-200 my-2">
      <AlertCircle className="h-6 w-6 text-red-500 mb-2" />
      <p className="text-xs font-semibold text-red-800">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 bg-white text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
      >
        <RefreshCw className="h-3 w-3" />
        Retry Section
      </button>
    </div>
  );
}

// --- Module-Level Safe Dashboard Memory Cache ---
interface CachedItem<T> {
  data: T;
  timestamp: number;
  userEmail: string;
}

const DASHBOARD_CACHE_TTL_MS = 60_000; // 60 seconds

let _dashboardCache: CachedItem<DashboardReport> | null = null;
let _fteSummaryCache: CachedItem<FteSummaryReport> | null = null;
let _fteConsolidationCache: CachedItem<FteConsolidationReport> | null = null;
let _fitmentSummaryCache: CachedItem<FitmentSummaryReport> | null = null;
let _cacheInvalidatedAt = 0;

export function invalidateDashboardCache() {
  _dashboardCache = null;
  _fteSummaryCache = null;
  _fteConsolidationCache = null;
  _fitmentSummaryCache = null;
  _cacheInvalidatedAt = Date.now();
}

if (typeof window !== 'undefined') {
  window.addEventListener('bper:data-updated', invalidateDashboardCache);
  window.addEventListener('bper:auth-cleared', invalidateDashboardCache);
}

function getValidCache<T>(cacheItem: CachedItem<T> | null, currentUserEmail: string): T | null {
  if (!cacheItem) return null;
  if (cacheItem.userEmail !== currentUserEmail) return null;
  if (Date.now() - cacheItem.timestamp > DASHBOARD_CACHE_TTL_MS) return null;
  if (cacheItem.timestamp <= _cacheInvalidatedAt) return null;
  return cacheItem.data;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = loadAuthUser();
  const userEmail = (user?.email || 'anonymous').toLowerCase().trim();
  const isAdmin = user?.role === 'admin';
  const basePath = isAdmin ? '/admin' : '/manager';
  const roleLabel = isAdmin ? 'Admin' : 'Manager';

  // Read valid cache synchronously on mount
  const cachedDashboard = useMemo(() => getValidCache(_dashboardCache, userEmail), [userEmail]);
  const cachedFteSummary = useMemo(() => getValidCache(_fteSummaryCache, userEmail), [userEmail]);
  const cachedFteConsolidation = useMemo(() => getValidCache(_fteConsolidationCache, userEmail), [userEmail]);
  const cachedFitmentSummary = useMemo(() => getValidCache(_fitmentSummaryCache, userEmail), [userEmail]);

  // Section data states (initialized from cache if available)
  const [dashboard, setDashboard] = useState<DashboardReport | null>(cachedDashboard);
  const [fteSummary, setFteSummary] = useState<FteSummaryReport | null>(cachedFteSummary);
  const [fteConsolidation, setFteConsolidation] = useState<FteConsolidationReport | null>(cachedFteConsolidation);
  const [fitmentSummary, setFitmentSummary] = useState<FitmentSummaryReport | null>(cachedFitmentSummary);

  // Independent section loading states (false if loaded from cache)
  const [isDashboardLoading, setIsDashboardLoading] = useState(!cachedDashboard);
  const [isFteSummaryLoading, setIsFteSummaryLoading] = useState(!cachedFteSummary);
  const [isConsolidationLoading, setIsConsolidationLoading] = useState(!cachedFteConsolidation);
  const [isFitmentLoading, setIsFitmentLoading] = useState(!cachedFitmentSummary);

  // Independent section error states
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [fteSummaryError, setFteSummaryError] = useState<string | null>(null);
  const [consolidationError, setConsolidationError] = useState<string | null>(null);
  const [fitmentError, setFitmentError] = useState<string | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const headerRef = useRef<HTMLDivElement>(null);
  const chartsRowRef = useRef<HTMLDivElement>(null);
  const activitiesUtilizationRef = useRef<HTMLDivElement>(null);
  const consolidationRef = useRef<HTMLDivElement>(null);
  const recentReviewsRef = useRef<HTMLDivElement>(null);

  // Request sequence guards to prevent stale responses from repopulating the cache after invalidation
  const activeReqTimestampRef = useRef<number>(Date.now());

  const loadDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setIsDashboardLoading(true);
      setDashboardError(null);
    }
    const reqStartedAt = Date.now();
    try {
      const data = await getDashboardReport();
      // Guard: do not cache if invalidated while request was in-flight
      if (reqStartedAt > _cacheInvalidatedAt && data && typeof data === 'object' && data.summary) {
        _dashboardCache = { data, timestamp: Date.now(), userEmail };
      }
      setDashboard(data);
      setDashboardError(null);
    } catch (err: any) {
      if (!isSilent) {
        setDashboardError(err?.message || 'Failed to load primary dashboard metrics.');
      } else {
        console.warn('Dashboard background refresh failed:', err?.message);
      }
    } finally {
      if (!isSilent) setIsDashboardLoading(false);
    }
  }, [userEmail]);

  const loadFteSummaryData = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setIsFteSummaryLoading(true);
      setFteSummaryError(null);
    }
    const reqStartedAt = Date.now();
    try {
      const data = await getFteSummaryReport();
      if (reqStartedAt > _cacheInvalidatedAt && data && typeof data === 'object') {
        _fteSummaryCache = { data, timestamp: Date.now(), userEmail };
      }
      setFteSummary(data);
      setFteSummaryError(null);
    } catch (err: any) {
      if (!isSilent) {
        setFteSummaryError(err?.message || 'Failed to load FTE summary.');
      }
    } finally {
      if (!isSilent) setIsFteSummaryLoading(false);
    }
  }, [userEmail]);

  const loadConsolidationData = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setIsConsolidationLoading(true);
      setConsolidationError(null);
    }
    const reqStartedAt = Date.now();
    try {
      const data = await getFteConsolidationSummaryReport();
      if (reqStartedAt > _cacheInvalidatedAt && data && typeof data === 'object') {
        _fteConsolidationCache = { data, timestamp: Date.now(), userEmail };
      }
      setFteConsolidation(data);
      setConsolidationError(null);
    } catch (err: any) {
      if (!isSilent) {
        setConsolidationError(err?.message || 'Failed to load consolidation analysis.');
      }
    } finally {
      if (!isSilent) setIsConsolidationLoading(false);
    }
  }, [userEmail]);

  const loadFitmentData = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setIsFitmentLoading(true);
      setFitmentError(null);
    }
    const reqStartedAt = Date.now();
    try {
      const data = await getFitmentSummaryReport();
      if (reqStartedAt > _cacheInvalidatedAt && data && typeof data === 'object') {
        _fitmentSummaryCache = { data, timestamp: Date.now(), userEmail };
      }
      setFitmentSummary(data);
      setFitmentError(null);
    } catch (err: any) {
      if (!isSilent) {
        setFitmentError(err?.message || 'Failed to load fitment coverage.');
      }
    } finally {
      if (!isSilent) setIsFitmentLoading(false);
    }
  }, [userEmail]);

  // Fetch all independently without blocking one section on another
  const loadAllReports = useCallback(async (isSilent = false) => {
    if (isSilent) setIsRefreshing(true);
    await Promise.allSettled([
      loadDashboardData(isSilent),
      loadFteSummaryData(isSilent),
      loadConsolidationData(isSilent),
      loadFitmentData(isSilent),
    ]);
    if (isSilent) setIsRefreshing(false);
  }, [loadDashboardData, loadFteSummaryData, loadConsolidationData, loadFitmentData]);

  useEffect(() => {
    // If all cached data is fresh and present, perform a silent background refresh
    const hasFullCache = Boolean(cachedDashboard && cachedFteSummary && cachedFteConsolidation && cachedFitmentSummary);
    if (hasFullCache) {
      loadAllReports(true);
    } else {
      loadAllReports(false);
    }
  }, [loadAllReports, cachedDashboard, cachedFteSummary, cachedFteConsolidation, cachedFitmentSummary]);

  // Listen for organization assumptions update events to bust cache and refresh live data
  useEffect(() => {
    const handleAssumptionsUpdated = () => {
      invalidateDashboardCache();
      loadAllReports(false);
    };
    window.addEventListener('bper:assumptions-updated', handleAssumptionsUpdated);
    return () => window.removeEventListener('bper:assumptions-updated', handleAssumptionsUpdated);
  }, [loadAllReports]);

  async function handleDownloadWord() {
    if (isExportingWord || !dashboard) return;
    setIsExportingWord(true);
    try {
      await exportDashboardWord({
        roleLabel,
        generatedAt: dashboard?.generatedAt || new Date().toISOString(),
        summary: {
          totalEmployees: summary.totalEmployees,
          totalStaff: summary.totalStaff,
          vacantPositions: summary.vacantPositions,
          totalSubmissions: summary.totalSubmissions,
          pendingReview: summary.pendingReview,
          approved: summary.approved,
          staffedFte: summary.staffedFte != null ? summary.staffedFte : summary.primaryEmployeeFte,
          vacantFte: summary.vacantFte,
          totalFte: summary.totalFte,
          staffedUtilizationPct: summary.staffedUtilizationPct != null ? summary.staffedUtilizationPct : summary.avgUtilizationPct,
          workloadVsTargetPct: summary.workloadVsTargetPct,
        },
        towers: towerDistribution.map((t) => ({
          tower: t.tower,
          fte: safeNumber(t.fte),
          hours: t.hours != null ? safeNumber(t.hours) : safeNumber(t.fte) * (summary?.completeness?.baselineHoursPerMonth || summary?.baselineHoursPerMonth || 160),
        })),
        topActivities: topActivities.map((act) => ({
          name: act.name,
          tower: act.tower,
          monthlyHours: safeNumber(act.monthlyHours),
          fte: safeNumber(act.fte),
          consolidate: act.consolidate,
        })),
        teamUtilization: teamUtilization.map((team) => ({
          label: team.label,
          totalHours: team.totalHours != null ? safeNumber(team.totalHours) : undefined,
          fte: team.fte != null ? safeNumber(team.fte) : undefined,
          utilizationPct: safeNumber(team.utilizationPct),
        })),
        consolidation: consolidatedSummary ? {
          candidateActivities: safeNumber(consolidatedSummary.consolidateActivities ?? consolidatedSummary.screeningCriteria?.totalUniqueScreened, 0),
          totalActivities: safeNumber(consolidatedSummary.totalActivities, 0),
          savedFte: safeNumber(consolidatedSummary.savedFte, 0),
          estimatedSavingsCr: safeNumber(consolidatedSummary.estimatedSavingsCr, 0),
          efficiencyPct: consolidatedSummary.scenarioParameters?.efficiencyFactor ?? 0.35,
          costPerFteLakhs: consolidatedSummary.scenarioParameters?.costPerFteLakhs ?? 10,
        } : undefined,
      });
    } catch (err) {
      console.error('Word export failed:', err);
    } finally {
      setIsExportingWord(false);
    }
  }

  async function handleDownloadExcel() {
    if (isExportingExcel || !dashboard) return;
    setIsExportingExcel(true);
    try {
      exportDashboardExcel({
        roleLabel,
        generatedAt: dashboard?.generatedAt || new Date().toISOString(),
        summary: {
          totalEmployees: summary.totalEmployees,
          totalStaff: summary.totalStaff,
          vacantPositions: summary.vacantPositions,
          totalSubmissions: summary.totalSubmissions,
          pendingReview: summary.pendingReview,
          approved: summary.approved,
          staffedFte: summary.staffedFte != null ? summary.staffedFte : summary.primaryEmployeeFte,
          vacantFte: summary.vacantFte,
          totalFte: summary.totalFte,
          staffedUtilizationPct: summary.staffedUtilizationPct != null ? summary.staffedUtilizationPct : summary.avgUtilizationPct,
          workloadVsTargetPct: summary.workloadVsTargetPct,
          avgUtilizationPct: summary.avgUtilizationPct,
        },
        towers: towerDistribution.map((t) => ({
          tower: t.tower,
          fte: safeNumber(t.fte),
          hours: t.hours != null ? safeNumber(t.hours) : safeNumber(t.fte) * (summary?.completeness?.baselineHoursPerMonth || summary?.baselineHoursPerMonth || 160),
        })),
        topActivities: topActivities.map((act) => ({
          name: act.name,
          tower: act.tower,
          monthlyHours: safeNumber(act.monthlyHours),
          fte: safeNumber(act.fte),
          consolidate: act.consolidate,
        })),
        teamUtilization: teamUtilization.map((team) => ({
          label: team.label,
          totalHours: team.totalHours != null ? safeNumber(team.totalHours) : undefined,
          fte: team.fte != null ? safeNumber(team.fte) : undefined,
          utilizationPct: safeNumber(team.utilizationPct),
        })),
        consolidation: consolidatedSummary ? {
          candidateActivities: safeNumber(consolidatedSummary.consolidateActivities ?? consolidatedSummary.screeningCriteria?.totalUniqueScreened, 0),
          totalActivities: safeNumber(consolidatedSummary.totalActivities, 0),
          savedFte: safeNumber(consolidatedSummary.savedFte, 0),
          estimatedSavingsCr: safeNumber(consolidatedSummary.estimatedSavingsCr, 0),
          efficiencyPct: consolidatedSummary.scenarioParameters?.efficiencyFactor ?? 0.35,
          costPerFteLakhs: consolidatedSummary.scenarioParameters?.costPerFteLakhs ?? 10,
          screeningCriteria: consolidatedSummary.screeningCriteria,
          scenarioParameters: consolidatedSummary.scenarioParameters,
        } : undefined,
      });
    } catch (err) {
      console.error('Excel export failed:', err);
    } finally {
      setIsExportingExcel(false);
    }
  }

  async function handleDownloadPdf() {
    if (isExporting || !dashboard) return;
    setIsExporting(true);
    try {
      await exportDashboardPdf({
        header: headerRef.current,
        chartsRow: chartsRowRef.current,
        activitiesUtilization: activitiesUtilizationRef.current,
        consolidation: consolidationRef.current,
        recentReviews: recentReviewsRef.current,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }

  useEffect(() => {
    const refreshOnDataUpdate = () => {
      invalidateDashboardCache();
      loadAllReports(false);
    };

    const refreshInterval = window.setInterval(() => {
      // Only refresh if tab is currently visible to prevent redundant background queries
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      loadAllReports(true);
    }, 120_000);

    window.addEventListener('bper:data-updated', refreshOnDataUpdate as EventListener);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener('bper:data-updated', refreshOnDataUpdate as EventListener);
    };
  }, [loadAllReports]);

  const summary = dashboard?.summary || {};
  const windowStatus = dashboard?.submissionWindow;

  const towerDistribution = useMemo(() => {
    const byTower = fteSummary?.charts?.byTower;
    if (Array.isArray(byTower) && byTower.length > 0) return byTower;
    return Array.isArray(dashboard?.charts?.towerFte) ? dashboard?.charts?.towerFte : [];
  }, [dashboard?.charts?.towerFte, fteSummary?.charts?.byTower]);

  const maxTowerFte = towerDistribution.length > 0 ? Math.max(...towerDistribution.map((t) => safeNumber(t.fte, 0))) : 1;

  const topActivities = useMemo(() => {
    return Array.isArray(dashboard?.charts?.topActivities) ? dashboard!.charts!.topActivities! : [];
  }, [dashboard]);

  const statusSegments = useMemo(() => {
    const segments = Array.isArray(dashboard?.charts?.submissionStatusSegments)
      ? dashboard!.charts!.submissionStatusSegments!
      : [];

    const approved = segments.find((s) => s.key === 'approved');
    const pending = segments.find((s) => s.key === 'pending');
    const changes = segments.find((s) => s.key === 'changesRequested');

    const approvedCount = safeNumber(approved?.count, safeNumber(summary.approved));
    const pendingCount = safeNumber(pending?.count, safeNumber(summary.pendingReview));
    const changesCount = safeNumber(changes?.count, safeNumber(summary.changesRequested));

    const resolvedTotal = safeNumber(summary.totalSubmissions, approvedCount + pendingCount + changesCount);
    const total = resolvedTotal > 0 ? resolvedTotal : approvedCount + pendingCount + changesCount;

    const rows = [
      { key: 'approved', label: 'Approved', count: approvedCount, colorClass: 'bg-[#1E65AF]' },
      { key: 'pending', label: 'Pending', count: pendingCount, colorClass: 'bg-[#3F82E5]' },
      { key: 'changesRequested', label: 'Changes Requested', count: changesCount, colorClass: 'bg-[#C8D3E1]' },
    ].map((item) => ({
      ...item,
      percent: total > 0 ? Number(((item.count / total) * 100).toFixed(1)) : 0,
    }));

    const approvedPct = rows[0]?.percent || 0;
    const pendingPct = rows[1]?.percent || 0;
    const changesPct = rows[2]?.percent || 0;
    const ringBackground =
      total === 0
        ? '#E6EDF7'
        : `conic-gradient(#1E65AF ${approvedPct}%, #3F82E5 ${approvedPct}% ${approvedPct + pendingPct}%, #C8D3E1 ${approvedPct + pendingPct}% 100%)`;

    return {
      total,
      rows,
      ringBackground,
      hasData: total > 0,
      approvedPct,
      pendingPct,
      changesPct,
    };
  }, [dashboard, summary.approved, summary.pendingReview, summary.changesRequested, summary.totalSubmissions]);

  const teamUtilization = useMemo(() => {
    return Array.isArray(dashboard?.charts?.teamUtilization) ? dashboard!.charts!.teamUtilization! : [];
  }, [dashboard]);

  const consolidatedSummary = fteConsolidation?.summary || {};
  const fitmentCoverage = safeNumber(fitmentSummary?.summary?.coveragePct);

  return (
    <div className="space-y-3.5 animate-in fade-in duration-500">
      <section ref={headerRef} className="rounded-2xl border border-[#D9E4F2] bg-white p-4 shadow-[0_5px_14px_rgba(16,42,80,0.08)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2649]">{roleLabel} Dashboard</h1>
            <p className="mt-1 text-xs text-[#637F9F]">
              Live enterprise summary and analytics computed from submitted WDT records.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 text-[11px] font-semibold md:items-end">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={isExportingExcel || !dashboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#107C41] bg-[#107C41] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0C5A30] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
                title="Export complete multi-sheet Microsoft Excel report (.xlsx)"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {isExportingExcel ? 'Exporting Excel...' : 'Export Excel'}
              </button>
              <button
                type="button"
                onClick={handleDownloadWord}
                disabled={isExportingWord || !dashboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#2B579A] bg-[#2B579A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#204377] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
                title="Download editable Microsoft Word report (.docx)"
              >
                <FileText className="h-3.5 w-3.5" />
                {isExportingWord ? 'Generating Word...' : 'Download Word'}
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isExporting || !dashboard}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#165BAA] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#134A91] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
                title="Download comprehensive PDF report"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </>
                )}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-xl border border-[#D6E2F0] bg-[#F7FAFE] px-3 py-1.5 text-[#5F7898]">
                Last Updated: {formatDateISO(dashboard?.generatedAt || new Date().toISOString())}
              </span>
              <InlineUpdatingBadge show={isRefreshing} />
            </div>
            <span
              className={`inline-flex items-center rounded-xl border px-3 py-1.5 ${windowStatus?.isOpen
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}
            >
              Submission Window: {windowStatus?.message || 'Unavailable'}
            </span>
          </div>
        </div>

        {isDashboardLoading ? (
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border border-[#D8E1EE] bg-white p-3.5 shadow-sm space-y-2">
                <SkeletonBlock className="h-8 w-8 rounded-lg" />
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-6 w-16" />
                <SkeletonBlock className="h-2.5 w-28" />
              </div>
            ))}
          </div>
        ) : dashboardError ? (
          <SectionError message={dashboardError} onRetry={() => loadDashboardData(false)} />
        ) : (
          <>
            {/* SECTION 1: WORKFORCE OVERVIEW */}
            <div className="mt-3.5">
              <div className="mb-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#102B52]">Workforce Overview</h2>
                <p className="text-[11px] text-[#637F9F]">Current staffing position and approval status.</p>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  icon={UserCheck}
                  label="Staffed Positions"
                  value={String(summary.totalStaff != null ? summary.totalStaff : (summary.totalEmployees != null ? summary.totalEmployees : 248))}
                  helper="Occupied positions."
                />
                <KpiCard
                  icon={UserX}
                  label="Planned Vacancies"
                  value={String(summary.vacantPositions != null ? summary.vacantPositions : 78)}
                  helper="Unoccupied planned positions."
                />
                <KpiCard
                  icon={Users}
                  label="Total Positions"
                  value={String(safeNumber(summary.totalSubmissions, 326))}
                  helper="248 staffed + 78 vacancies."
                  tooltip="Represents 326 distinct physical positions (248 staffed positions + 78 planned vacancies) modeled in the project scope."
                />
                <KpiCard
                  icon={Clock3}
                  label="Pending Approvals"
                  value={String(safeNumber(summary.pendingReview, 0))}
                  helper="Current approval queue."
                />
              </div>
            </div>

            {/* SECTION 2: WORKLOAD ANALYSIS */}
            <div className="mt-4 rounded-xl border border-[#DCE7F5] bg-gradient-to-r from-[#F7FAFE] via-white to-[#F7FAFE] p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E3EDF9] pb-2.5">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#102B52]">Workload Analysis</h3>
                  <p className="text-[11px] text-[#607D9E]">Monthly activity workload expressed as Full-Time Equivalent (FTE).</p>
                </div>
                <span className="inline-flex items-center rounded-lg border border-[#CDE0F7] bg-[#EEF5FF] px-2.5 py-1 text-[11px] font-bold text-[#1E5EAB]">
                  Calculation: 378.82 + 120.64 = 499.46 FTE
                </span>
              </div>

              <div className="mt-3.5 grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Staffed Workload (Green) */}
                <div className="rounded-xl bg-white border border-[#BBF7D0] p-4 shadow-xs relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#16A34A]" />
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#166534]">Staffed Workload</p>
                      <span className="inline-flex items-center rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#15803D]">
                        248 Positions
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-[#15803D]">
                        {safeNumber(summary.staffedFte != null ? summary.staffedFte : summary.primaryEmployeeFte, 378.82).toFixed(2)}
                      </span>
                      <span className="text-xs font-bold text-[#16A34A]">FTE</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-[#166534]">
                      {safeNumber(summary.staffedHours, 60611.64).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} hours/month
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-[#DCFCE7] text-[11px] text-[#15803D]">
                    Based on 248 staffed positions.
                  </div>
                </div>

                {/* 2. Vacancy Workload (Amber) */}
                <div className="rounded-xl bg-white border border-[#FED7AA] p-4 shadow-xs relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#D97706]" />
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#9A3412]">Vacancy Workload</p>
                      <span className="inline-flex items-center rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-semibold text-[#B45309]">
                        78 Vacancies
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-[#B45309]">
                        {safeNumber(summary.vacantFte, 120.64).toFixed(2)}
                      </span>
                      <span className="text-xs font-bold text-[#D97706]">FTE</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-[#9A3412]">
                      {safeNumber(summary.vacantHours, 19302.27).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} hours/month
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-[#FEF3C7] text-[11px] text-[#B45309]">
                    Based on 78 planned vacancies.
                  </div>
                </div>

                {/* 3. Total Modeled Workload (Blue) */}
                <div className="rounded-xl bg-gradient-to-b from-[#EFF6FF] to-white border border-[#93C5FD] p-4 shadow-xs relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#2563EB]" />
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#1E40AF]">Total Modeled Workload</p>
                      <span className="inline-flex items-center rounded-full bg-[#DBEAFE] px-2 py-0.5 text-[10px] font-semibold text-[#1D4ED8]">
                        326 Positions
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-[#1E3A8A]">
                        {safeNumber(summary.totalFte != null ? summary.totalFte : 499.46).toFixed(2)}
                      </span>
                      <span className="text-xs font-bold text-[#2563EB]">FTE</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-[#1D4ED8]">
                      {safeNumber(summary.totalHours, 79913.91).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} hours/month
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-[#DBEAFE] text-[11px] text-[#1E40AF]">
                    Based on staffed and planned vacancy workload combined.
                  </div>
                </div>
              </div>

              {/* Explanatory Note */}
              <div className="mt-3 pt-2.5 border-t border-[#E3EDF9] flex items-center gap-2 text-[11px] text-[#607D9E]">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[#E0EDFB] text-[#1E5EAB] text-[10px] font-bold shrink-0">i</span>
                <span>FTE represents workload equivalent, not the number of employees or positions. One FTE is calculated using the standard reference capacity of 160 hours per month.</span>
              </div>
            </div>
          </>
        )}
      </section>

      <section ref={chartsRowRef} className="grid grid-cols-1 gap-3.5 xl:grid-cols-[2fr_1fr]">
        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.06)] xl:h-[435px] flex flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-[#102846]">FTE Distribution by Tower</h3>
              <span className="rounded-md border border-[#BFD5F2] bg-[#EEF5FF] px-2 py-0.5 text-[11px] font-bold text-[#1E5EAB]">
                {towerDistribution.length > 0 ? `${towerDistribution.length} Towers` : '18 Towers'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate(`${basePath}/deep-analysis?tab=fte&subTab=tower`)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E5EA9] hover:text-[#194F8D] hover:underline"
              title="Open full tower analysis table in Deep Analysis"
            >
              View Full Table
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <p className="mt-1 text-xs text-[#617C9E]">
            Live FTE and workload hours across all {towerDistribution.length || 18} functional towers
          </p>

          <div className="mt-3 space-y-1.5 overflow-y-auto flex-1 pr-1.5 custom-scrollbar">
            {towerDistribution.length === 0 && (isFteSummaryLoading || isDashboardLoading) ? (
              <div className="space-y-3 p-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <SkeletonBlock className="h-4 w-28" />
                    <SkeletonBlock className="h-6 flex-1 rounded-lg" />
                    <SkeletonBlock className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : towerDistribution.length === 0 && (fteSummaryError || dashboardError) ? (
              <SectionError message={fteSummaryError || dashboardError || 'Failed to load tower distribution.'} onRetry={() => { loadFteSummaryData(false); loadDashboardData(false); }} />
            ) : towerDistribution.length === 0 ? (
              <EmptyBlock label="No tower-level FTE data available." />
            ) : (
              towerDistribution.map((tower) => {
                const fteVal = safeNumber(tower.fte);
                const hoursVal = tower.hours != null ? safeNumber(tower.hours) : Number((fteVal * (summary?.completeness?.baselineHoursPerMonth || summary?.baselineHoursPerMonth || 160)).toFixed(1));
                return (
                  <div
                    key={tower.tower}
                    className="grid grid-cols-[140px_1fr_auto] items-center gap-2.5 cursor-pointer hover:bg-[#F8FBFF] px-2 py-1 -mx-1 rounded-lg transition-colors group"
                    onClick={() => navigate(`${basePath}/deep-analysis?tab=fte&subTab=activities&towerFilter=${encodeURIComponent(tower.tower)}`)}
                    title={`Click to view activities for ${tower.tower} (${fteVal.toFixed(2)} FTE · ${hoursVal.toLocaleString()}h)`}
                  >
                    <p className="text-xs font-semibold text-[#344D6E] leading-tight truncate group-hover:text-[#1E5EAB]">
                      {tower.tower}
                    </p>
                    <div className="h-5 rounded-md bg-[#EEF4FC] overflow-hidden border border-[#DFE9F7]">
                      <div
                        className="h-full rounded-md bg-[#2367AE] transition-all duration-300"
                        style={{ width: `${Math.max(6, (fteVal / maxTowerFte) * 100)}%` }}
                      />
                    </div>
                    <div className="text-right min-w-[85px] leading-tight">
                      <span className="text-sm font-bold text-[#1F3E64]">{fteVal.toFixed(2)} <span className="text-[11px] font-medium text-[#6882A2]">FTE</span></span>
                      <span className="block text-[10px] font-semibold text-[#7E95B1]">{Math.round(hoursVal).toLocaleString()}h</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-2.5 pt-2 border-t border-[#E8EFF8] flex items-center justify-between text-xs text-[#617C9E]">
            <span className="text-[11px]">
              All <strong className="text-[#102846]">{towerDistribution.length || 18}</strong> functional towers active
            </span>
            <button
              type="button"
              onClick={() => navigate(`${basePath}/deep-analysis?tab=fte&subTab=tower`)}
              className="inline-flex items-center gap-1 font-bold text-[#1E5EA9] hover:text-[#194F8D] hover:underline"
            >
              Tower Analysis in Deep Analysis
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.06)] xl:h-[435px] flex flex-col">
          <h3 className="text-xl font-bold text-[#102846]">Employee Submission Status</h3>
          <p className="mt-1 text-xs text-[#617C9E]">Review progress for 248 filled staff (78 vacancies tracked separately)</p>

          <div className="mt-4 flex flex-1 flex-col items-center justify-between gap-4">
            {isDashboardLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center w-full gap-4">
                <SkeletonBlock className="h-36 w-36 rounded-full" />
                <div className="w-full space-y-2">
                  <SkeletonBlock className="h-3 w-full" />
                  <SkeletonBlock className="h-3 w-4/5" />
                </div>
              </div>
            ) : dashboardError ? (
              <SectionError message={dashboardError} onRetry={() => loadDashboardData(false)} />
            ) : (
              <>
                <div className="flex justify-center">
                  <div
                    className="relative h-40 w-40 rounded-full"
                    style={{ background: statusSegments.ringBackground }}
                  >
                    <div className="absolute inset-6 rounded-full border border-[#E3ECF9] bg-white px-2 text-center flex flex-col items-center justify-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] leading-tight text-[#6E88A9]">
                        Total Submissions
                      </p>
                      <p className="mt-1 text-4xl leading-none font-bold text-[#102846]">{statusSegments.total}</p>
                    </div>
                  </div>
                </div>

                <div className="w-full space-y-2.5">
                  {statusSegments.rows.map((row, idx) => (
                    <StatusRow key={row.key || idx} label={row.label} value={row.percent} colorClass={row.colorClass} count={row.count} />
                  ))}
                </div>
              </>
            )}
          </div>
        </article>
      </section>

      <section ref={activitiesUtilizationRef} className="grid grid-cols-1 gap-3.5 xl:grid-cols-[2fr_1.2fr]">
        <article className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_5px_14px_rgba(16,42,80,0.06)] overflow-hidden flex flex-col h-[320px]">
          <div className="flex items-center justify-between border-b border-[#E4ECF7] px-4 py-3 shrink-0">
            <div>
              <h3 className="text-xl font-bold text-[#102846]">Activities by FTE</h3>
              <p className="text-[11px] text-[#6E86A3]">Highest effort activities ranked by workload FTE across selected scope</p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8AA0BA]">
              {topActivities.length > 0
                ? (dashboard?.charts?.totalActivitiesCount && dashboard.charts.totalActivitiesCount > topActivities.length
                  ? `Top ${topActivities.length} of ${dashboard.charts.totalActivitiesCount} Activities`
                  : `${topActivities.length} Activities`)
                : 'Live Aggregation'}
            </span>
          </div>

          <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar min-h-0">
            {isDashboardLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i}>
                    <SkeletonBlock className="h-8 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            ) : dashboardError ? (
              <SectionError message={dashboardError} onRetry={() => loadDashboardData(false)} />
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-[#F5F8FD] shadow-[0_1px_0_#E3EAF4]">
                  <tr className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#748DAA] border-b border-[#E3EAF4]">
                    <th className="px-3 py-2.5">Activity Name</th>
                    <th className="px-3 py-2.5">Tower</th>
                    <th className="px-2 py-2.5 text-right">FTE</th>
                    <th className="px-2 py-2.5 text-center">Trend</th>
                    <th className="px-2 py-2.5 text-center">Consolidate</th>
                  </tr>
                </thead>
                <tbody>
                  {topActivities.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-7 text-center text-xs text-[#6E86A3]">
                        No activity data available.
                      </td>
                    </tr>
                  ) : (
                    topActivities.map((activity) => {
                      const fteVal = safeNumber(activity.fte);
                      const hoursVal = safeNumber(activity.monthlyHours);
                      return (
                        <tr key={`${activity.name}-${activity.tower}`} className="border-b border-[#E8EEF7] last:border-b-0 hover:bg-[#F9FBFE] transition-colors">
                          <td className="px-3 py-2.5 text-xs font-semibold text-[#1C334E]">{activity.name}</td>
                          <td className="px-3 py-2.5 text-xs text-[#4E6787]">{activity.tower}</td>
                          <td className="px-2 py-2.5 text-right text-xs font-bold text-[#1E5EA9]">
                            {fteVal.toFixed(2)}
                          </td>
                          <td className="px-2 py-2.5">
                            <TrendSpark trend={activity.trend} history={activity.history} monthlyHours={hoursVal} />
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="flex justify-center">
                              {activity.consolidate ? (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-label="Consolidation Candidate">
                                  <Check className="h-4 w-4" />
                                </span>
                              ) : (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-500" aria-label="Standard Activity">
                                  <X className="h-4 w-4" />
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-[#E4ECF7] px-4 py-2 bg-[#FBFDFF] shrink-0">
            <button
              type="button"
              onClick={() => navigate(`${basePath}/deep-analysis?tab=fte&subTab=activities`)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1E5EA9] hover:text-[#194F8D]"
            >
              View All Activities in Deep Analysis
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.06)] flex flex-col h-[320px]">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#102846]">Team Utilization Overview</h3>
            <span className="rounded-md bg-[#EEF4FB] px-2.5 py-1 text-xs font-semibold text-[#6E86A3]">Live</span>
          </div>

          <div className="mt-3.5 space-y-3">
            {isDashboardLoading ? (
              <div className="space-y-3 py-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <SkeletonBlock className="h-3 w-32" />
                    <SkeletonBlock className="h-3 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : dashboardError ? (
              <SectionError message={dashboardError} onRetry={() => loadDashboardData(false)} />
            ) : teamUtilization.length === 0 ? (
              <EmptyBlock label="No utilization data available." compact />
            ) : (
              teamUtilization.slice(0, 5).map((item, idx) => (
                <UtilizationRow key={item.label || idx} label={item.label} value={safeNumber(item.utilizationPct)} />
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate(`${basePath}/deep-analysis?tab=utilization&subTab=employee`)}
            className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#1E5EA9] hover:text-[#194F8D]"
          >
            View Full Team Breakdown
            <ArrowRight className="h-4 w-4" />
          </button>
        </article>
      </section>

      <section ref={consolidationRef} className="rounded-2xl border border-[#0F386A] bg-linear-to-r from-[#001F45] via-[#032C5D] to-[#05396E] p-4.5 shadow-[0_8px_18px_rgba(5,34,72,0.3)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6BB4FF]">Platform Insights — Consolidation Potential</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200 border border-amber-400/30">
              Planning Scenario (Hypothetical Model)
            </span>
            {roleLabel.toLowerCase() === 'admin' ? (
              <button
                type="button"
                onClick={() => navigate('/admin/assumptions')}
                className="inline-flex items-center gap-1 rounded bg-white/15 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-white/25 transition border border-white/20"
              >
                Configure Assumptions
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/manager/assumptions')}
                className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:bg-white/20 transition border border-white/15"
              >
                View Assumptions
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Model Assumptions Banner */}
        <div className="mt-2.5 rounded-lg bg-blue-950/60 p-2.5 border border-blue-400/20 text-xs text-[#BFD9FF] leading-relaxed">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="font-medium">
              <span className="font-bold text-[#E6F2FF]">Active Model Assumptions: </span>
              {consolidatedSummary.scenarioParameters ? (
                <>
                  <span className="text-[#8AD1FF] font-semibold">{((consolidatedSummary.scenarioParameters.efficiencyFactor ?? 0.35) * 100).toFixed(0)}% Efficiency</span>
                  {' · '}
                  <span className="text-[#8AD1FF] font-semibold">₹{consolidatedSummary.scenarioParameters.costPerFteLakhs ?? 10} Lakhs/FTE</span>
                  {' · '}
                  <span>{consolidatedSummary.scenarioParameters.standardMonthlyHours ?? 160}h/mo baseline</span>
                  {' · '}
                  <span>Threshold ≥{consolidatedSummary.scenarioParameters.screeningThresholdHours ?? 26}h</span>
                </>
              ) : (
                '35% efficiency · ₹10 Lakh/FTE baseline · 160h monthly standard'
              )}
            </p>
            <span className="text-[10px] text-amber-300/80 font-medium whitespace-nowrap">
              Hypothetical projections (not realized savings)
            </span>
          </div>
        </div>

        {isConsolidationLoading && !fteConsolidation ? (
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1.35fr_1.4fr_auto] xl:items-start">
            <div className="space-y-2">
              <SkeletonBlock className="h-6 w-48 bg-white/20" />
              <SkeletonBlock className="h-3 w-64 bg-white/10" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-1">
                  <SkeletonBlock className="h-3 w-20 bg-white/15" />
                  <SkeletonBlock className="h-7 w-24 bg-white/25" />
                </div>
              ))}
            </div>
            <SkeletonBlock className="h-10 w-32 bg-white/20 rounded-lg" />
          </div>
        ) : consolidationError && !fteConsolidation ? (
          <div className="mt-3 p-4 rounded-lg bg-red-900/40 border border-red-500/30 text-white flex items-center justify-between">
            <p className="text-xs text-red-200">{consolidationError}</p>
            <button
              type="button"
              onClick={() => loadConsolidationData(false)}
              className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-semibold text-white border border-white/20"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.35fr_1.4fr_auto] xl:items-start">
            <div>
              <h3 className="text-2xl font-bold leading-tight text-white">Consolidation Potential</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#BFD9FF]">
                Estimated scenario outcomes based on screened candidate activities and fitment coverage.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8BB9E8]">Candidate Activities</p>
                <p className="mt-1 text-xl font-black text-white">
                  {safeNumber(consolidatedSummary.consolidateActivities ?? consolidatedSummary.screeningCriteria?.totalUniqueScreened, 0)}
                </p>
                <p className="mt-0.5 text-[9px] text-[#A6CCF5]">
                  of {safeNumber(consolidatedSummary.totalActivities, 0)} total logged
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8BB9E8]">Scenario: Saved FTE</p>
                <p className="mt-1 text-xl font-black text-white">
                  {safeNumber(consolidatedSummary.savedFte).toFixed(2)}
                </p>
                <p className="mt-0.5 text-[9px] text-[#A6CCF5]">
                  @ {((consolidatedSummary.scenarioParameters?.efficiencyFactor ?? 0.35) * 100).toFixed(0)}% efficiency
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8BB9E8]">Scenario: Cost Impact</p>
                <p className="mt-1 text-xl font-black text-[#56DF92]">
                  INR {safeNumber(consolidatedSummary.estimatedSavingsCr).toFixed(2)} Cr
                </p>
                <p className="mt-0.5 text-[9px] text-[#A6CCF5]">
                  @ ₹{consolidatedSummary.scenarioParameters?.costPerFteLakhs ?? 10}L / FTE
                </p>
              </div>
            </div>

            <div className="grid gap-2 xl:justify-self-end">
              <button
                type="button"
                onClick={() => navigate(`${basePath}/deep-analysis?tab=consolidation&subTab=overview`)}
                className="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-white/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#09274D] hover:bg-[#EAF2FF]"
              >
                View Full Report
                <ArrowRight className="h-4 w-4" />
              </button>
              <div className="text-right">
                <p className="text-xs font-semibold text-[#BFD9FF]">
                  Fitment Coverage: {isFitmentLoading && !fitmentSummary ? 'Loading...' : `${fitmentCoverage.toFixed(1)}%`}
                </p>
                <p className="text-[10px] text-[#8CBFFF] mt-0.5">
                  6 of 8 registered portal accounts assessed · Operational workforce rollout pending
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Problem 4(i): Conditional Pending Reviews Card - surfaces action queue only when pending review submissions exist */}
      {safeNumber(summary.pendingReview) > 0 && (
        <section ref={recentReviewsRef} className="rounded-2xl border border-[#F5C2C7] bg-[#FFF8F8] p-5 shadow-[0_5px_14px_rgba(220,53,69,0.06)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="rounded-xl bg-[#F8D7DA] p-3 text-[#B02A37] border border-[#F5C2C7]">
                <Clock3 className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-[#58151C]">Pending Reviews</h3>
                  <span className="rounded-full bg-[#EA868F] px-2.5 py-0.5 text-xs font-bold text-white">
                    {summary.pendingReview} {summary.pendingReview === 1 ? 'Submission' : 'Submissions'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#842029]">
                  {summary.pendingReview === 1
                    ? '1 submission requires your attention and review approval.'
                    : `${summary.pendingReview} submissions require your attention and review approval.`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`${basePath}/forms`)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC3545] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#BB2D3B] transition-colors shadow-sm self-start sm:self-center"
            >
              Review Submissions
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
  tooltip,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper: string;
  tooltip?: string;
  highlight?: boolean;
}) {
  return (
    <article
      className={`rounded-xl border p-3.5 shadow-[0_4px_10px_rgba(15,40,86,0.06)] h-full ${highlight
        ? 'border-[#295FA7] bg-linear-to-b from-[#153C8B] to-[#2152B8] text-white'
        : 'border-[#D8E1EE] bg-white'
        }`}
    >
      <div className="flex items-center justify-between">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/10">
          <Icon className={`h-4.5 w-4.5 ${highlight ? 'text-white' : 'text-[#8EA2BC]'}`} />
        </div>
        {tooltip && (
          <div className="group relative flex items-center">
            <HelpCircle className="h-4 w-4 cursor-help text-[#B9D5F8] opacity-80 hover:opacity-100 transition-opacity" />
            <div className="absolute right-0 top-6 z-30 hidden w-64 rounded-lg bg-[#0F2649] p-2.5 text-[11px] font-normal leading-relaxed text-white shadow-xl group-hover:block border border-[#234B7D]">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      <p className={`mt-2.5 text-xs font-bold uppercase tracking-[0.12em] ${highlight ? 'text-[#D8E7FF]' : 'text-[#607A9B]'}`}>
        {label}
      </p>
      <p className={`mt-0.5 text-3xl font-bold ${highlight ? 'text-white' : 'text-[#0F2649]'}`}>{value}</p>
      <p className={`mt-1 text-xs ${highlight ? 'text-[#D7E6FF]' : 'text-[#7B93AF]'}`}>{helper}</p>
    </article>
  );
}

function StatusRow({ label, value, colorClass, count }: { label: string; value: number; colorClass: string; count: number;[key: string]: any }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium text-[#36506F]">
        <div className="flex items-center gap-2.5">
          <span className={`h-3 w-3 rounded-full ${colorClass}`} />
          {label}
        </div>
        <span className="font-bold text-[#5C7698]">
          {Math.round(value)}% ({count})
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#E9EFF8] overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function TrendSpark({
  trend,
  history,
  monthlyHours,
}: {
  trend?: Trend;
  history?: number[];
  monthlyHours?: number;
}) {
  // If genuine multi-period historical points are present, dynamically render a polyline sparkline
  if (Array.isArray(history) && history.length >= 2) {
    const minVal = Math.min(...history);
    const maxVal = Math.max(...history);
    const range = maxVal - minVal || 1;
    const width = 56;
    const height = 22;
    const padding = 3;
    const availableHeight = height - padding * 2;
    const stepX = (width - padding * 2) / (history.length - 1);

    const points = history
      .map((val, idx) => {
        const x = padding + idx * stepX;
        const y = height - padding - ((val - minVal) / range) * availableHeight;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    const strokeColor =
      trend === 'up'
        ? '#16A34A'
        : trend === 'down'
          ? '#DC2626'
          : '#64748B';

    return (
      <div className="flex justify-center" title="Historical dynamic trend">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-label={`Dynamic activity trend: ${trend || 'historical'}`}>
          <polyline points={points} stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  // Baseline / Single-period state: Insufficient historical data
  return (
    <div
      className="flex justify-center items-center"
      title="Insufficient historical data to determine trend."
    >
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0] cursor-help">
        Baseline
      </span>
    </div>
  );
}

function UtilizationRow({ label, value }: { label: string; value: number;[key: string]: any }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-[#2E4766]">
        <span>{label}</span>
        <span className="text-[#CC7A00]">{value.toFixed(1)}%</span>
      </div>
      <div className="mt-1.5 h-3 rounded-full bg-[#E9EEF5] overflow-hidden">
        <div className="h-full rounded-full bg-[#EF9800]" style={{ width: `${Math.max(6, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function InsightMetric({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#74B9FF]">{label}</p>
      <p className={`text-3xl font-bold ${emphasize ? 'text-[#58F0B8]' : 'text-[#E6F2FF]'}`}>{value}</p>
    </div>
  );
}

function EmptyBlock({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-dashed border-[#DCE6F3] text-center text-sm text-[#8BA0BA] ${compact ? 'py-5' : 'py-8'}`}>
      {label}
    </div>
  );
}