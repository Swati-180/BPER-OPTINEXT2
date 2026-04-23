import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock3,
  FileCheck2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  getDashboardReport,
  getFteConsolidationSummaryReport,
  getFteSummaryReport,
  getFitmentSummaryReport,
} from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import { formatDateISO } from '../employee/bperSubmissionStorage';
import { DashboardSkeleton, InlineUpdatingBadge } from '../../components/PortalSkeletons';
import { FTEBandChart } from '../../components/charts/FTECharts';

type Trend = 'up' | 'steady' | 'down';

type ActivityInsight = {
  name: string;
  tower: string;
  monthlyHours: number;
  fte: number;
  consolidate: boolean;
  trend: Trend;
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
    totalSubmissions?: number;
    pendingReview?: number;
    approved?: number;
    avgUtilizationPct?: number;
    totalFte?: number;
  };
  charts?: {
    towerFte?: Array<{ tower: string; fte: number }>;
    teamUtilization?: Array<{ label: string; utilizationPct: number }>;
    topActivities?: ActivityInsight[];
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
    savedFte?: number;
    estimatedSavingsCr?: number;
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

export default function Dashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardReport | null>(null);
  const [fteSummary, setFteSummary] = useState<FteSummaryReport | null>(null);
  const [fteConsolidation, setFteConsolidation] = useState<FteConsolidationReport | null>(null);
  const [fitmentSummary, setFitmentSummary] = useState<FitmentSummaryReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReports(blocking = false) {
    if (blocking || !dashboard) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    try {
      const [dashboardData, fteSummaryData, consolidationData, fitmentData] = await Promise.all([
        getDashboardReport(),
        getFteSummaryReport(),
        getFteConsolidationSummaryReport(),
        getFitmentSummaryReport(),
      ]);

      setDashboard(dashboardData);
      setFteSummary(fteSummaryData);
      setFteConsolidation(consolidationData);
      setFitmentSummary(fitmentData);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard reports.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadReports(true);
  }, []);

  useEffect(() => {
    const refreshOnDataUpdate = () => {
      loadReports(false);
    };

    const refreshInterval = window.setInterval(() => {
      loadReports(false);
    }, 30000);

    window.addEventListener('bper:data-updated', refreshOnDataUpdate as EventListener);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener('bper:data-updated', refreshOnDataUpdate as EventListener);
    };
  }, []);

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

  const recentSubmissions = useMemo(() => {
    return Array.isArray(dashboard?.tables?.recentSubmissions) ? dashboard!.tables!.recentSubmissions! : [];
  }, [dashboard]);

  const consolidatedSummary = fteConsolidation?.summary || {};
  const fitmentCoverage = safeNumber(fitmentSummary?.summary?.coveragePct);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          <div>
            <p className="text-sm font-semibold">Unable to load dashboard reports</p>
            <p className="mt-1 text-xs">{error}</p>
            <button
              type="button"
              onClick={loadReports}
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
    <div className="space-y-3.5 animate-in fade-in duration-500">
      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-4 shadow-[0_5px_14px_rgba(16,42,80,0.08)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2649]">Manager Dashboard</h1>
            <p className="mt-1 text-xs text-[#637F9F]">
              Live enterprise summary and analytics computed from submitted WDT records.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 text-[11px] font-semibold md:items-end">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-xl border border-[#D6E2F0] bg-[#F7FAFE] px-3 py-1.5 text-[#5F7898]">
                Last Updated: {formatDateISO(dashboard?.generatedAt || new Date().toISOString())}
              </span>
              <InlineUpdatingBadge show={isRefreshing} />
            </div>
            <span
              className={`inline-flex items-center rounded-xl border px-3 py-1.5 ${
                windowStatus?.isOpen
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}
            >
              Submission Window: {windowStatus?.message || 'Unavailable'}
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard icon={Users} label="Total Employees" value={String(safeNumber(summary.totalEmployees))} helper="Active employee accounts" />
          <KpiCard icon={FileCheck2} label="Forms Submitted" value={String(safeNumber(summary.totalSubmissions))} helper="Records in current report scope" />
          <KpiCard icon={Clock3} label="Pending Review" value={String(safeNumber(summary.pendingReview))} helper={safeNumber(summary.pendingReview) > 0 ? 'Needs manager action' : 'No active queue'} />
          <KpiCard icon={Check} label="Approved" value={String(safeNumber(summary.approved))} helper={safeNumber(summary.approved) > 0 ? 'Review completed' : 'Awaiting approvals'} />
          <KpiCard
            icon={TrendingUp}
            label="Total FTE"
            value={safeNumber(summary.totalFte).toFixed(2)}
            helper={`${toPercent(safeNumber(summary.avgUtilizationPct))} Avg Utilization`}
            highlight
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3.5 xl:grid-cols-[2fr_1fr]">
        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.06)]">
          <h3 className="text-xl font-bold text-[#102846]">FTE Distribution by Tower</h3>
          <p className="mt-1 text-xs text-[#617C9E]">Live FTE split from monthly activity effort</p>

          <div className="mt-4 space-y-2.5">
            {towerDistribution.length === 0 ? (
              <EmptyBlock label="No tower-level FTE data available." />
            ) : (
              towerDistribution.map((tower) => (
                <div 
                  key={tower.tower} 
                  className="grid grid-cols-[130px_1fr_auto] items-center gap-2.5 cursor-pointer hover:bg-[#F8FBFF] p-1.5 -mx-1.5 rounded-lg transition-colors"
                  onClick={() => navigate(`/manager/deep-analysis?tab=fte&subTab=activities&towerFilter=${encodeURIComponent(tower.tower)}`)}
                >
                  <p className="text-xs font-semibold text-[#5E7594] leading-tight">{tower.tower}</p>
                  <div className="h-7 rounded-lg bg-[#EEF4FC] overflow-hidden border border-[#DFE9F7]">
                    <div
                      className="h-full rounded-lg bg-[#2367AE]"
                      style={{ width: `${Math.max(10, (safeNumber(tower.fte) / maxTowerFte) * 100)}%` }}
                    />
                  </div>
                  <p className="text-lg font-bold text-[#244161]">{safeNumber(tower.fte).toFixed(2)}</p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.06)]">
          <h3 className="text-xl font-bold text-[#102846]">Submission Status</h3>
          <p className="mt-1 text-xs text-[#617C9E]">Current review progress</p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[170px_1fr] md:items-center">
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

            <div className="space-y-2.5">
              {statusSegments.rows.map((row, idx) => (
                <StatusRow key={row.key || idx} label={row.label} value={row.percent} colorClass={row.colorClass} count={row.count} />
              ))}
            </div>
          </div>
        </article>
      </section>

      {dashboard?.charts?.employeeFteData && dashboard.charts.employeeFteData.length > 0 && (
        <section className="rounded-2xl border border-[#D9E4F2] bg-white p-4 shadow-[0_5px_14px_rgba(16,42,80,0.06)]">
          <h3 className="text-xl font-bold text-[#102846]">FTE Band Distribution</h3>
          <p className="mt-1 text-xs text-[#6E86A3]">Distribution of employee FTE values across 5 utilization bands (based on 160h/month baseline)</p>
          <div className="mt-4">
            <FTEBandChart data={dashboard.charts.employeeFteData} height={200} />
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-3.5 xl:grid-cols-[2fr_1.2fr]">
        <article className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_5px_14px_rgba(16,42,80,0.06)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#E4ECF7] px-4 py-3">
            <h3 className="text-xl font-bold text-[#102846]">Top Activities by FTE</h3>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8AA0BA]">Live Aggregation</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#748DAA] border-b border-[#E3EAF4]">
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
                  topActivities.map((activity) => (
                    <tr key={`${activity.name}-${activity.tower}`} className="border-b border-[#E8EEF7] last:border-b-0">
                      <td className="px-3 py-3 text-xs font-semibold text-[#1C334E]">{activity.name}</td>
                      <td className="px-3 py-3 text-xs text-[#4E6787]">{activity.tower}</td>
                      <td className="px-2 py-3 text-right text-xs font-bold text-[#1E5EA9]">{safeNumber(activity.fte).toFixed(2)}</td>
                      <td className="px-2 py-3">
                        <TrendSpark trend={activity.trend || 'steady'} />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex justify-center">
                          {activity.consolidate ? (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                              <Check className="h-4 w-4" />
                            </span>
                          ) : (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                              <X className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.06)]">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#102846]">Team Utilization Overview</h3>
            <span className="rounded-md bg-[#EEF4FB] px-2.5 py-1 text-xs font-semibold text-[#6E86A3]">Live</span>
          </div>

          <div className="mt-3.5 space-y-3">
            {teamUtilization.length === 0 ? (
              <EmptyBlock label="No utilization data available." compact />
            ) : (
              teamUtilization.slice(0, 5).map((item, idx) => (
                <UtilizationRow key={item.label || idx} label={item.label} value={safeNumber(item.utilizationPct)} />
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('/manager/deep-analysis?tab=utilization&subTab=employee')}
            className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#1E5EA9] hover:text-[#194F8D]"
          >
            View Full Team Breakdown
            <ArrowRight className="h-4 w-4" />
          </button>
        </article>
      </section>

      <section className="rounded-2xl border border-[#0F386A] bg-linear-to-r from-[#001F45] via-[#032C5D] to-[#05396E] p-4.5 shadow-[0_8px_18px_rgba(5,34,72,0.3)]">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6BB4FF]">Platform Insights</p>
        <div className="mt-2.5 grid grid-cols-1 gap-3 xl:grid-cols-[1.35fr_1.4fr_auto] xl:items-start">
          <div>
            <h3 className="text-3xl font-bold leading-tight text-white">Consolidation Summary</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#BFD9FF]">
              Estimated from live activity patterns and fitment coverage.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <InsightMetric label="Total Activities" value={String(safeNumber(consolidatedSummary.totalActivities))} />
            <InsightMetric label="Saved FTE" value={safeNumber(consolidatedSummary.savedFte).toFixed(2)} />
            <InsightMetric label="Cost Saving" value={`INR ${safeNumber(consolidatedSummary.estimatedSavingsCr).toFixed(2)} Cr`} emphasize />
          </div>

          <div className="grid gap-2 xl:justify-self-end">
            <button
              type="button"
              onClick={() => navigate('/manager/deep-analysis?tab=consolidation&subTab=overview')}
              className="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-white/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#09274D] hover:bg-[#EAF2FF]"
            >
              View Full Report
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-right text-xs text-[#BFD9FF]">Fitment Coverage: {fitmentCoverage.toFixed(1)}%</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_5px_14px_rgba(16,42,80,0.06)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E3EBF6] px-4 py-3">
          <h3 className="text-lg font-bold text-[#102846]">Recent Form Reviews</h3>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7B93AF]">Manager Queue</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-170 border-collapse text-left">
            <thead>
              <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                <th className="px-4 py-2.5">Form ID</th>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Monthly Hours</th>
                <th className="px-4 py-2.5">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {recentSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-7 text-center text-xs text-[#6E86A3]">
                    No submissions available.
                  </td>
                </tr>
              ) : (
                recentSubmissions.slice(0, 6).map((submission) => (
                  <tr key={submission.referenceId} className="border-b border-[#E8EEF7] last:border-b-0">
                    <td className="px-4 py-3 text-xs font-semibold text-[#1A5CA8]">{submission.referenceId}</td>
                    <td className="px-4 py-3 text-xs text-[#1A3556]">{submission.employee.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusClass(submission.status)}`}>
                        {submission.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-[#0E2646]">{safeNumber(submission.totalHours).toFixed(1)}</td>
                    <td className="px-4 py-3 text-xs text-[#4F6785]">{formatDateISO(submission.submittedAt)}</td>
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
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper: string;
  highlight?: boolean;
}) {
  return (
    <article
      className={`rounded-xl border p-3.5 shadow-[0_4px_10px_rgba(15,40,86,0.06)] ${
        highlight
          ? 'border-[#295FA7] bg-linear-to-b from-[#153C8B] to-[#2152B8] text-white'
          : 'border-[#D8E1EE] bg-white'
      }`}
    >
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/10">
        <Icon className={`h-4.5 w-4.5 ${highlight ? 'text-white' : 'text-[#C8D2DF]'}`} />
      </div>
      <p className={`mt-2.5 text-xs font-bold uppercase tracking-[0.12em] ${highlight ? 'text-[#D8E7FF]' : 'text-[#607A9B]'}`}>
        {label}
      </p>
      <p className={`mt-0.5 text-3xl font-bold ${highlight ? 'text-white' : 'text-[#0F2649]'}`}>{value}</p>
      <p className={`mt-1 text-xs ${highlight ? 'text-[#D7E6FF]' : 'text-[#7B93AF]'}`}>{helper}</p>
    </article>
  );
}

function StatusRow({ label, value, colorClass, count }: { label: string; value: number; colorClass: string; count: number; [key: string]: any }) {
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

function TrendSpark({ trend }: { trend: Trend }) {
  const stroke = trend === 'up' ? '#16A34A' : trend === 'down' ? '#64748B' : '#64748B';
  const d = trend === 'up' ? 'M4 16 L16 12 L28 12 L40 10 L52 9' : trend === 'down' ? 'M4 9 L16 10 L28 11 L40 13 L52 13' : 'M4 12 L16 12 L28 12 L40 12 L52 12';

  return (
    <div className="flex justify-center">
      <svg width="56" height="22" viewBox="0 0 56 22" fill="none" aria-label="activity trend">
        <path d={d} stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function UtilizationRow({ label, value }: { label: string; value: number; [key: string]: any }) {
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
