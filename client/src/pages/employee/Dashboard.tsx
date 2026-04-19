import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, CircleHelp, ClipboardCheck, FilePenLine } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { TableLoadingRow } from '../../components/PortalSkeletons';
import {
  type BperSubmissionRecord,
  formatDateISO,
  loadBperSubmissions,
} from './bperSubmissionStorage';

const LOGIN_SESSION_KEY = 'bper.session.loginAt';

function formatRelativeHours(isoDate: string) {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return '-';

  const diffMs = Math.max(0, Date.now() - then);
  const hours = Math.max(1, Math.round(diffMs / 3600000));
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

function buildDashboardFormId(referenceId: string, employeeId: string) {
  const token = referenceId.replace(/[^A-Z0-9]/gi, '').slice(-5).toUpperCase();
  return `${employeeId}-${token || 'BPER1'}`;
}

function getSubmissionCountdown(referenceDate: Date) {
  const now = new Date(referenceDate);
  const nextDeadline = new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59, 999);

  if (now > nextDeadline) {
    nextDeadline.setMonth(nextDeadline.getMonth() + 1);
  }

  const totalDays = 10;
  const windowStart = new Date(nextDeadline);
  windowStart.setDate(windowStart.getDate() - (totalDays - 1));
  windowStart.setHours(0, 0, 0, 0);

  const daysLeft = Math.max(0, Math.ceil((nextDeadline.getTime() - now.getTime()) / 86400000));
  const dayIndex = Math.min(
    totalDays,
    Math.max(1, Math.floor((now.getTime() - windowStart.getTime()) / 86400000) + 1)
  );

  const remainingMs = Math.max(0, nextDeadline.getTime() - now.getTime());
  const remainingHours = Math.floor((remainingMs % 86400000) / 3600000);
  const remainingMinutes = Math.floor((remainingMs % 3600000) / 60000);

  return {
    deadline: nextDeadline,
    totalDays,
    dayIndex,
    daysLeft,
    remainingHours,
    remainingMinutes,
  };
}

function statusBadgeClass(status: 'Under Review' | 'Approved' | 'Changes Requested' | 'Submission Pending') {
  if (status === 'Approved') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'Changes Requested') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (status === 'Under Review') return 'bg-blue-100 text-blue-700 border-blue-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function activityStatusChipClass(status: 'Under Review' | 'Approved' | 'Changes Requested') {
  return status === 'Approved'
    ? 'bg-emerald-100 text-emerald-700'
    : status === 'Changes Requested'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-blue-100 text-blue-700';
}

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [submissions, setSubmissions] = useState<BperSubmissionRecord[]>([]);
  const [windowStatus, setWindowStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);



  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const [profileRes, subsData, windowRes] = await Promise.all([
          apiFetch('/auth/me'),
          loadBperSubmissions(),
          apiFetch('/wdt/window-status'),
        ]);

        const profileData = await profileRes.json();

        if (profileRes.ok) {
          setProfile(profileData);
          setSubmissions(subsData.filter((item) => item.employee.employeeId === profileData.employeeId));
        }

        if (windowRes.ok) {
          setWindowStatus(await windowRes.json());
        }
      } catch (error) {
        console.error('Dashboard init failed:', error);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const loginAt = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(LOGIN_SESSION_KEY);
  }, []);

  const loginAtEpoch = useMemo(() => {
    if (!loginAt) return null;
    const value = new Date(loginAt).getTime();
    return Number.isNaN(value) ? null : value;
  }, [loginAt]);

  const filteredSubmissions = useMemo(
    () =>
      submissions.filter(
        (item) => loginAtEpoch === null || new Date(item.submittedAt).getTime() >= loginAtEpoch
      ),
    [submissions, loginAtEpoch]
  );

  const latestSubmission = filteredSubmissions[0] ?? null;
  const hasSubmission = filteredSubmissions.length > 0;
  const latestStatus: 'Under Review' | 'Approved' | 'Changes Requested' | 'Submission Pending' =
    latestSubmission?.status ?? 'Submission Pending';

  const isApproved = latestSubmission?.status === 'Approved';

  const countdown = getSubmissionCountdown(new Date());
  const lastSavedLabel = latestSubmission ? formatRelativeHours(latestSubmission.submittedAt) : '-';

  const pendingFrom =
    latestSubmission?.pendingFrom && latestSubmission.pendingFrom !== 'NA' ? latestSubmission.pendingFrom : 'NA';

  const approvedCount = submissions.filter((item) => item.status === 'Approved').length;
  const underReviewCount = submissions.filter((item) => item.status === 'Under Review').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold tracking-tight text-[#0F1F3D]">Dashboard</h1>
        </div>
        <p className="text-base text-[#4A607C]">
          Hi {profile?.name || 'User'}, submit from Forms to start this cycle. Once approved by manager, your deadline will be marked finished.
        </p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
        <article className="h-full min-h-72 rounded-2xl border border-[#D8E1EE] bg-white p-4 shadow-[0_4px_12px_rgba(15,40,86,0.06)] flex flex-col">
          <div className="flex items-start justify-between">
            <span className={`inline-flex items-center rounded-lg border px-3 py-1 text-xs font-extrabold tracking-[0.18em] uppercase ${statusBadgeClass(latestStatus)}`}>
              {latestStatus}
            </span>
            <div className="h-11 w-11 rounded-xl border border-[#DCE6F5] bg-[#F5F8FD] flex items-center justify-center">
              <ClipboardCheck className="w-4.5 h-4.5 text-[#3469B5]" />
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xl font-bold text-[#111E38]">BPER Form Status</p>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#8BA0BE] mt-2">
              Latest form: {latestSubmission ? buildDashboardFormId(latestSubmission.referenceId, latestSubmission.employee.employeeId) : 'Not submitted'}
            </p>
          </div>

          <div className="mt-4 space-y-1.5 flex-1">
            {hasSubmission ? (
              <p className="text-sm leading-relaxed text-[#49607C]">
                Check comments and status before the next submission update.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-[#49607C]">
                Fill your BPER submission from the Forms section to begin the submission cycle.
              </p>
            )}
          </div>

          <Link
            to="/employee/form"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1E5EAB] px-4 py-2 text-white font-semibold hover:bg-[#174D8F] transition-colors"
          >
            {hasSubmission ? 'Review in Forms' : 'Go to Forms'}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </article>

        <article className={`h-full min-h-72 rounded-2xl border bg-white p-6 shadow-[0_4px_12px_rgba(15,40,86,0.06)] flex flex-col items-center justify-center text-center ${windowStatus?.isOpen ? 'border-blue-100' : 'border-amber-100'}`}>
          <h3 className="text-sm font-extrabold tracking-[0.16em] text-[#243A59] uppercase">Submission Deadline</h3>

          {latestStatus === 'Under Review' ? (
            <>
              <div className="mt-6 relative h-32 w-32 rounded-full">
                <div className="absolute inset-0 rounded-full bg-linear-to-br from-amber-200 to-amber-100" />
                <div className="absolute inset-2.5 rounded-full bg-white border border-[#E6ECF7] flex items-center justify-center">
                  <span className="text-2xl font-bold text-amber-600">⏳</span>
                </div>
              </div>

              <p className="mt-6 text-lg font-semibold text-[#203456]">Waiting for Approval</p>
              <p className="mt-1 text-xs font-medium tracking-[0.12em] uppercase text-[#6F88A8]">Manager reviewing your submission</p>
            </>
          ) : isApproved ? (
            <>
              <div className="mt-6 relative h-32 w-32 rounded-full">
                <div className="absolute inset-0 rounded-full bg-linear-to-br from-emerald-200 to-emerald-100" />
                <div className="absolute inset-2.5 rounded-full bg-white border border-[#E6ECF7] flex items-center justify-center flex-col">
                  <span className="text-3xl font-bold text-emerald-600">✓</span>
                </div>
              </div>

              <p className="mt-6 text-lg font-semibold text-[#203456]">Deadline Finished</p>
              <p className="mt-1 text-xs font-medium tracking-[0.12em] uppercase text-[#6F88A8]">Approved by manager</p>
            </>
          ) : (
            <>
              <div className="mt-6 relative h-32 w-32 rounded-full">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: windowStatus?.isOpen 
                      ? `conic-gradient(#1E5EAB ${((31 - new Date().getDate()) / 12) * 360}deg, #E0E9F5 0deg)`
                      : '#F59E0B',
                  }}
                />
                <div className="absolute inset-2.5 rounded-full bg-white border border-[#E6ECF7] flex items-center justify-center flex-col">
                  <span className={`text-3xl font-bold leading-none ${windowStatus?.isOpen ? 'text-[#0F1F3D]' : 'text-amber-600'}`}>
                    {windowStatus?.isOpen ? (31 - new Date().getDate()) : windowStatus?.daysUntilNext}
                  </span>
                  <span className="text-xs font-semibold tracking-[0.15em] uppercase text-[#6F88A8]">Days</span>
                </div>
              </div>

              <p className={`mt-6 text-sm font-bold tracking-[0.12em] uppercase ${windowStatus?.isOpen ? 'text-emerald-600' : 'text-amber-600'}`}>
                {windowStatus?.message}
              </p>
              <p className="mt-1 text-xs font-medium text-[#6F88A8] italic">
                {windowStatus?.isOpen ? 'Period: 20th - 31st' : 'Submissions currently closed'}
              </p>
            </>
          )}
        </article>

        <article className="h-full min-h-72 rounded-2xl border border-[#D8E1EE] bg-white p-4 shadow-[0_4px_12px_rgba(15,40,86,0.06)] flex flex-col">
          <h3 className="text-sm font-extrabold tracking-[0.16em] text-[#243A59] uppercase">Submission Activity</h3>

          <div className="mt-4 space-y-4 flex-1">
            <div className="rounded-xl border border-[#DCE4F2] bg-[#F8FBFF] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6F88A8]">Total records</p>
              <p className="mt-1 text-2xl font-bold text-[#1A2E4D]">{filteredSubmissions.length}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#DCE4F2] bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6F88A8]">Under review</p>
                <p className="mt-1 text-xl font-bold text-[#1A2E4D]">{filteredSubmissions.filter(i => i.status === 'Under Review').length}</p>
              </div>
              <div className="rounded-xl border border-[#DCE4F2] bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6F88A8]">Approved</p>
                <p className="mt-1 text-xl font-bold text-[#1A2E4D]">{filteredSubmissions.filter(i => i.status === 'Approved').length}</p>
              </div>
            </div>

            <div className="rounded-xl border border-[#DCE4F2] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6F88A8]">Pending from</p>
              <p className="mt-1 text-sm font-semibold text-[#334E71]">{pendingFrom}</p>
            </div>
          </div>

          <Link to="/employee/status" className="mt-auto pt-3 inline-flex items-center gap-2 text-[#1E5EAB] font-semibold hover:text-[#174D8F] transition-colors">
            View Submission Records
            <ArrowRight className="w-4 h-4" />
          </Link>
        </article>
      </section>

      <section className="pt-2 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold text-[#0F1F3D]">Recent Activity</h2>
            <p className="text-sm text-[#5A7394]">Submission activity aligned with Form Status records</p>
          </div>
          <Link to="/employee/status" className="text-[#1E5EAB] font-semibold hover:text-[#174D8F] transition-colors">
            View Full Form Status
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-245 border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 border-y border-slate-200">
                  <th className="px-6 py-4">Sr No.</th>
                  <th className="px-6 py-4">Form ID</th>
                  <th className="px-6 py-4">Submitted Date</th>
                  <th className="px-6 py-4">Form Status</th>
                  <th className="px-6 py-4">Check Comments</th>
                  <th className="px-6 py-4">Pending From</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableLoadingRow colSpan={7} />
                ) : filteredSubmissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-500">
                      No submission activity yet in this login session. Submit your BPER form in Forms to populate this section.
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.slice(0, 5).map((record, index) => {
                    const formId = buildDashboardFormId(record.referenceId, record.employee.employeeId);
                    const commentsLabel = record.reviewHistory.length > 0 ? 'Comments' : 'View Status';
                    const actionLabel = record.status === 'Changes Requested' ? 'Update & Resubmit' : 'NA';

                    return (
                      <tr key={record.referenceId} className="border-b border-slate-100 last:border-0 text-slate-800 bg-white hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-5">{index + 1}</td>
                        <td className="px-6 py-5 font-semibold text-[#225BC0]">{formId}</td>
                        <td className="px-6 py-5">{formatDateISO(record.submittedAt)}</td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${activityStatusChipClass(record.status)}`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <Link to="/employee/status" className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                            {commentsLabel}
                          </Link>
                        </td>
                        <td className="px-6 py-5">{record.pendingFrom || 'NA'}</td>
                        <td className="px-6 py-5">
                          {actionLabel === 'NA' ? (
                            'NA'
                          ) : (
                            <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                              {actionLabel}
                              <FilePenLine className="w-4 h-4" />
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <article className="h-full rounded-2xl border border-[#D9E3F0] bg-white p-4 flex items-center gap-4">
          <div className="h-20 w-20 rounded-2xl border border-[#DCE6F4] bg-[#F8FBFF] flex items-center justify-center shrink-0">
            <BookOpenCheck className="w-7 h-7 text-[#2663B7]" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[#112240]">Guidance &amp; Policy</h3>
            <p className="text-sm leading-relaxed text-[#4E6684] max-w-md">
              Review the updated 2026 Business Process &amp; Effort Reporting guidelines to ensure accurate data entry.
            </p>
            <button type="button" className="inline-flex items-center gap-2 text-[#1E5EAB] font-semibold hover:text-[#174D8F] transition-colors">
              Read Policy
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </article>

        <article className="h-full rounded-2xl border border-[#D9E3F0] bg-white p-4 flex items-center gap-4">
          <div className="h-20 w-20 rounded-2xl border border-[#DCE6F4] bg-[#F8FBFF] flex items-center justify-center shrink-0">
            <CircleHelp className="w-7 h-7 text-[#082A54]" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-[#112240]">Need Assistance?</h3>
            <p className="text-sm leading-relaxed text-[#4E6684] max-w-md">
              Our support team is available 24/7 for technical queries regarding the BPER submission portal.
            </p>
            <button
              type="button"
              className="inline-flex items-center rounded-xl border border-[#D8E2EF] bg-white px-4 py-2 font-semibold text-[#1F3558] hover:bg-[#F8FBFF] hover:border-[#B8CCE7] transition-colors"
            >
              Contact Support
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
