import { useMemo, useState, useEffect } from 'react';
import {
  ArrowRight,
  Check,
  Clock3,
  FileCheck2,
  Loader2,
  TrendingUp,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { demoEmployeeProfile } from '../employee/demoEmployeeData';
import { formatDateISO, loadBperSubmissions, type BperSubmissionRecord } from '../employee/bperSubmissionStorage';

type ActivityInsight = {
  name: string;
  tower: string;
  monthlyHours: number;
  fte: number;
  consolidate: boolean;
  trend: 'up' | 'steady' | 'down';
};

const STANDARD_MONTHLY_HOURS = 160;

const fallbackActivityRows = [
  { name: 'Validate Vendor Invoice', tower: 'Accounts Payable', monthlyHours: 68, consolidate: true, trend: 'steady' as const },
  { name: 'Execute Weekly Payment Batch', tower: 'Accounts Payable', monthlyHours: 32, consolidate: false, trend: 'down' as const },
  { name: 'Payroll Audits', tower: 'Payroll', monthlyHours: 28, consolidate: false, trend: 'steady' as const },
  { name: 'Employee Onboarding', tower: 'People Ops', monthlyHours: 24, consolidate: true, trend: 'up' as const },
  { name: 'Vendor Aging Review', tower: 'Accounts Payable', monthlyHours: 18, consolidate: true, trend: 'up' as const },
];

function toPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function getStatusClass(status: BperSubmissionRecord['status']) {
  if (status === 'Approved') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'Changes Requested') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-blue-100 text-blue-700 border-blue-200';
}

export default function Dashboard() {
  const [submissions, setSubmissions] = useState<BperSubmissionRecord[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const data = await loadBperSubmissions();
        // Show all team submissions for the manager dashboard
        setSubmissions(data || []);

        const token = localStorage.getItem('bper.auth.token');
        const usersResponse = await fetch('http://localhost:5000/api/auth/users', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (usersResponse.ok) {
          const users = await usersResponse.json();
          const count = Array.isArray(users)
            ? users.filter((user: any) => user.role === 'employee').length
            : 0;
          setEmployeeCount(count);
        }
      } catch (err) {
        console.error('Loader error:', err);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const latestSubmission = submissions[0] ?? null;

  const activityInsights = useMemo(() => {
    const allRows = submissions.flatMap((submission) =>
      submission.payload.rows.map((row) => {
        const name = row.subProcess?.trim() || row.process?.trim() || row.majorProcess?.trim() || 'Unspecified Activity';
        const tower = row.majorProcess?.trim() || demoEmployeeProfile.primaryTower;
        const monthlyHours = Number(row.timeTakenHoursPerMonth || 0);
        const comment = (row.comments || '').toLowerCase();

        return {
          name,
          tower,
          monthlyHours,
          consolidate:
            comment.includes('automation') ||
            comment.includes('rpa') ||
            comment.includes('repeat') ||
            monthlyHours >= 26,
          trend: monthlyHours >= 40 ? 'up' : monthlyHours <= 20 ? 'down' : 'steady',
        };
      })
    );

    const source = allRows.length >= 3 ? allRows : fallbackActivityRows;

    return source
      .map((row) => ({
        ...row,
        fte: row.monthlyHours / STANDARD_MONTHLY_HOURS,
      }))
      .sort((a, b) => b.fte - a.fte)
      .slice(0, 5);
  }, [submissions]);

  const towerDistribution = useMemo(() => {
    const map = new Map<string, number>();

    activityInsights.forEach((activity) => {
      map.set(activity.tower, (map.get(activity.tower) || 0) + activity.fte);
    });

    return Array.from(map.entries())
      .map(([tower, fte]) => ({ tower, fte }))
      .sort((a, b) => b.fte - a.fte);
  }, [activityInsights]);

  const totalFte = towerDistribution.reduce((sum, item) => sum + item.fte, 0);

  const statusCounts = useMemo(() => {
    const approved = submissions.filter((item) => item.status === 'Approved').length;
    const pending = submissions.filter((item) => item.status === 'Under Review').length;
    const changes = submissions.filter((item) => item.status === 'Changes Requested').length;

    return { approved, pending, changes, total: submissions.length };
  }, [submissions]);

  const statusSegments = useMemo(() => {
    const total = Math.max(1, statusCounts.total);
    const approvedPct = (statusCounts.approved / total) * 100;
    const pendingPct = (statusCounts.pending / total) * 100;
    const draftPct = (statusCounts.changes / total) * 100;

    return { approvedPct, pendingPct, draftPct };
  }, [statusCounts]);

  const avgUtilization = Math.min(100, totalFte * 100);
  const consolidateCount = activityInsights.filter((item) => item.consolidate).length;
  const savedFte = activityInsights
    .filter((item) => item.consolidate)
    .reduce((sum, item) => sum + item.fte * 0.35, 0);
  const estimatedSavingsCr = savedFte * 0.1;

  const maxTowerFte = towerDistribution[0]?.fte || 1;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#165BAA]/5">
        <Loader2 className="h-10 w-10 animate-spin text-[#165BAA]" />
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
              Enterprise command center for {demoEmployeeProfile.name} ({demoEmployeeProfile.band} {demoEmployeeProfile.title}) with FTE-based workload intelligence.
            </p>
          </div>

          <div className="inline-flex items-center rounded-xl border border-[#D6E2F0] bg-[#F7FAFE] px-3 py-1.5 text-[11px] font-semibold text-[#5F7898]">
            Last Updated: {formatDateISO(latestSubmission?.submittedAt ?? new Date().toISOString())}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard icon={Users} label="Total Employees" value={String(employeeCount || new Set(submissions.map(s => s.employee.employeeId)).size)} helper="Registered employee accounts" />
          <KpiCard icon={FileCheck2} label="Forms Submitted" value={String(statusCounts.total)} helper="Quarterly cycle records" />
          <KpiCard icon={Clock3} label="Pending Review" value={String(statusCounts.pending)} helper={statusCounts.pending > 0 ? 'Needs manager action' : 'No active queue'} />
          <KpiCard icon={Check} label="Approved" value={String(statusCounts.approved)} helper={statusCounts.approved > 0 ? 'Review closed' : 'Awaiting approval'} />
          <KpiCard
            icon={TrendingUp}
            label="Avg Utilization"
            value={toPercent(avgUtilization)}
            helper={`${totalFte.toFixed(2)} FTE from ${STANDARD_MONTHLY_HOURS}h baseline`}
            highlight
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3.5 xl:grid-cols-[2fr_1fr]">
        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.06)]">
          <h3 className="text-xl font-bold text-[#102846]">FTE Distribution by Tower</h3>
          <p className="mt-1 text-xs text-[#617C9E]">Workforce allocation computed from activity monthly effort</p>

          <div className="mt-4 space-y-2.5">
            {towerDistribution.map((tower) => (
              <div key={tower.tower} className="grid grid-cols-[130px_1fr_auto] items-center gap-2.5">
                <p className="text-xs font-semibold text-[#5E7594] leading-tight">{tower.tower}</p>
                <div className="h-7 rounded-lg bg-[#EEF4FC] overflow-hidden border border-[#DFE9F7]">
                  <div
                    className="h-full rounded-lg bg-[#2367AE]"
                    style={{ width: `${Math.max(10, (tower.fte / maxTowerFte) * 100)}%` }}
                  />
                </div>
                <p className="text-lg font-bold text-[#244161]">{tower.fte.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.06)]">
          <h3 className="text-xl font-bold text-[#102846]">Submission Status</h3>
          <p className="mt-1 text-xs text-[#617C9E]">Quarterly compliance overview</p>

          <div className="mt-4 flex justify-center">
            <div
              className="relative h-40 w-40 rounded-full"
              style={{
                background: `conic-gradient(#1E65AF ${statusSegments.approvedPct}%, #3F82E5 ${statusSegments.approvedPct}% ${statusSegments.approvedPct + statusSegments.pendingPct}%, #C8D3E1 ${statusSegments.approvedPct + statusSegments.pendingPct}% 100%)`,
              }}
            >
              <div className="absolute inset-6 rounded-full border border-[#E3ECF9] bg-white flex flex-col items-center justify-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#768EAA]">Total Submissions</p>
                <p className="text-3xl font-bold text-[#102846]">{statusCounts.total}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <StatusRow label="Approved" value={statusSegments.approvedPct} colorClass="bg-[#1E65AF]" />
            <StatusRow label="Pending" value={statusSegments.pendingPct} colorClass="bg-[#3F82E5]" />
            <StatusRow label="Draft / Not Started" value={statusSegments.draftPct} colorClass="bg-[#C8D3E1]" />
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-3.5 xl:grid-cols-[2fr_1.2fr]">
        <article className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_5px_14px_rgba(16,42,80,0.06)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#E4ECF7] px-4 py-3">
            <h3 className="text-xl font-bold text-[#102846]">Top 5 Activities by FTE</h3>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8AA0BA]">Aggregated Team Workload</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-180 border-collapse text-left">
              <thead>
                <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#748DAA] border-b border-[#E3EAF4]">
                  <th className="px-4 py-2.5">Activity Name</th>
                  <th className="px-4 py-2.5">Tower</th>
                  <th className="px-4 py-2.5 text-right">FTE</th>
                  <th className="px-4 py-2.5 text-center">Trend (5D)</th>
                  <th className="px-4 py-2.5 text-center">Consolidate</th>
                </tr>
              </thead>
              <tbody>
                {activityInsights.map((activity) => (
                  <tr key={`${activity.name}-${activity.tower}`} className="border-b border-[#E8EEF7] last:border-b-0">
                    <td className="px-4 py-3 text-xs font-semibold text-[#1C334E]">{activity.name}</td>
                    <td className="px-4 py-3 text-xs text-[#4E6787]">{activity.tower}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-[#1E5EA9]">{activity.fte.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <TrendSpark trend={activity.trend} />
                    </td>
                    <td className="px-4 py-3">
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
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.06)]">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#102846]">Team Utilization Overview</h3>
            <span className="rounded-md bg-[#EEF4FB] px-2.5 py-1 text-xs font-semibold text-[#6E86A3]">Weekly Avg</span>
          </div>

          <div className="mt-3.5 space-y-3">
            <UtilizationRow label={demoEmployeeProfile.department} value={Math.min(99, avgUtilization + 12)} />
            <UtilizationRow label="Accounts Payable" value={Math.min(99, avgUtilization + 6)} />
          </div>

          <button
            type="button"
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
              Based on workload trends, QG User1 has optimization potential through selective process consolidation and automation-ready activities.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <InsightMetric label="Total Activities" value={String(activityInsights.length)} />
            <InsightMetric label="Saved FTE" value={savedFte.toFixed(2)} />
            <InsightMetric label="Cost Saving" value={`₹${estimatedSavingsCr.toFixed(2)}Cr`} emphasize />
          </div>

          <button
            type="button"
            className="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-white/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#09274D] hover:bg-[#EAF2FF] xl:justify-self-end"
          >
            View Full Report
            <ArrowRight className="h-4 w-4" />
          </button>
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
              {submissions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-7 text-center text-xs text-[#6E86A3]">
                    No submissions available for QG User1.
                  </td>
                </tr>
              ) : (
                submissions.slice(0, 4).map((submission) => (
                  <tr key={submission.referenceId} className="border-b border-[#E8EEF7] last:border-b-0">
                    <td className="px-4 py-3 text-xs font-semibold text-[#1A5CA8]">{submission.referenceId}</td>
                    <td className="px-4 py-3 text-xs text-[#1A3556]">{submission.employee.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusClass(submission.status)}`}>
                        {submission.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-[#0E2646]">{submission.totalHours.toFixed(1)}</td>
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

function StatusRow({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="flex items-center justify-between text-xs font-medium text-[#36506F]">
      <div className="flex items-center gap-2.5">
        <span className={`h-3 w-3 rounded-full ${colorClass}`} />
        {label}
      </div>
      <span className="font-bold text-[#5C7698]">{Math.round(value)}%</span>
    </div>
  );
}

function TrendSpark({ trend }: { trend: 'up' | 'steady' | 'down' }) {
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

function UtilizationRow({ label, value }: { label: string; value: number }) {
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
