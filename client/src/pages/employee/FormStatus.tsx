import { type ReactNode, useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, Search, ShieldCheck, FileText, X, MessageSquareText, CircleAlert, Loader2 } from "lucide-react";
import {
  type BperSubmissionRecord,
  loadBperSubmissions,
  formatBperSubmittedDate,
  formatDateISO,
  getActiveUnderReviewReferenceId,
} from "./bperSubmissionStorage";

export default function FormStatus() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [records, setRecords] = useState<BperSubmissionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReferenceId, setSelectedReferenceId] = useState<string>("");
  const [activeCommentsRef, setActiveCommentsRef] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('bper.auth.token');
        
        // Fetch Profile
        const profileRes = await fetch('http://localhost:5000/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const profileData = await profileRes.json();
        
        if (profileRes.ok) {
          setProfile(profileData);
          
          // Fetch Submissions
          const subsData = await loadBperSubmissions();
          // Filter by real employeeId
          const filtered = subsData.filter((item) => item.employee.employeeId === profileData.employeeId);
          setRecords(filtered);
          if (filtered.length > 0) {
            setSelectedReferenceId(filtered[0].referenceId);
          }
        }
      } catch (error) {
        console.error('Form Status init failed:', error);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const activeUnderReviewRef = useMemo(() => getActiveUnderReviewReferenceId(), []);

  const visibleRecords = useMemo(
    () => records.filter((record) => record.status !== "Under Review" || record.referenceId === activeUnderReviewRef),
    [records, activeUnderReviewRef]
  );

  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return visibleRecords;

    return visibleRecords.filter((record) => {
      const formId = buildFormId(record.referenceId, record.employee.employeeId).toLowerCase();
      const date = formatDateISO(record.submittedAt).toLowerCase();
      const status = record.status.toLowerCase();
      const pending = (record.pendingFrom || "").toLowerCase();
      return (
        formId.includes(query) ||
        record.referenceId.toLowerCase().includes(query) ||
        date.includes(query) ||
        status.includes(query) ||
        pending.includes(query)
      );
    });
  }, [visibleRecords, searchTerm]);

  const selectedRecord =
    filteredRecords.find((record) => record.referenceId === selectedReferenceId) || filteredRecords[0] || visibleRecords[0] || null;
  const activeCommentsRecord = visibleRecords.find((record) => record.referenceId === activeCommentsRef) || null;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-[#165BAA]" />
          <span className="text-slate-500 font-semibold">Loading submissions...</span>
        </div>
      </div>
    );
  }

  if (!selectedRecord) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1 mb-7">
          <nav className="flex items-center text-[10px] font-bold text-[#165BAA] uppercase tracking-[0.15em] mb-2">
            <span className="hover:opacity-80 cursor-pointer transition-opacity">OVERVIEW</span>
            <span className="mx-2 text-gray-300">/</span>
            <span className="text-gray-400">FORM STATUS</span>
          </nav>
          <h1 className="text-3xl font-bold text-gray-900">BPER Form Status</h1>
          <p className="text-sm text-slate-500">No submitted BPER form is available yet. Submit a form first to view its status.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm min-h-65 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-medium">No submissions found</p>
          </div>
        </div>
      </div>
    );
  }

  const submittedDate = formatBperSubmittedDate(selectedRecord.submittedAt);
  const effectiveTitle =
    selectedRecord.employee.title && selectedRecord.employee.title !== "-" ? selectedRecord.employee.title : (profile?.band + ' ' + profile?.designation);
  const effectiveSupervisor =
    selectedRecord.employee.supervisorName && selectedRecord.employee.supervisorName !== "-"
      ? selectedRecord.employee.supervisorName
      : profile?.supervisorName;
  const statusMode = getStatusMode(selectedRecord.status);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4 flex-col lg:flex-row mb-7">
        <div>
          <nav className="flex items-center text-[10px] font-bold text-[#165BAA] uppercase tracking-[0.15em] mb-2">
            <span className="hover:opacity-80 cursor-pointer transition-opacity">OVERVIEW</span>
            <span className="mx-2 text-gray-300">/</span>
            <span className="text-gray-400">FORM STATUS</span>
          </nav>
          <h1 className="text-3xl font-bold text-gray-900">BPER Form Status</h1>
          <p className="mt-2 text-sm text-slate-500 max-w-3xl">
            Track the selected submission, review its timeline, and act on any requested changes.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm">
          <Search size={14} className="text-slate-400" /> Latest submission loaded from storage
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-linear-to-r from-blue-50 to-white px-6 py-5 sm:px-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-2">Timeline reference</p>
            <h2 className="text-2xl font-bold text-slate-900">This reflects the selected submission record.</h2>
            <p className="mt-2 text-sm text-slate-500">Click a record row to switch timeline and summary context.</p>
          </div>
          <div className="rounded-full bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 border border-slate-200">
            {selectedRecord.referenceId}
          </div>
        </div>

        <div className="px-6 py-7 sm:px-8 border-b border-slate-100">
          <div className="hidden md:block rounded-xl border border-slate-200 bg-slate-50/70 px-6 py-6">
            <div className="relative grid grid-cols-3">
              <div
                className="pointer-events-none absolute top-5 h-0.5 bg-slate-300"
                style={{ left: "calc(16.6667% + 20px)", width: "calc(33.3333% - 40px)" }}
              />
              <div
                className="pointer-events-none absolute top-5 h-0.5 bg-slate-300"
                style={{ left: "calc(50% + 20px)", width: "calc(33.3333% - 40px)" }}
              />

              {statusMode.hasFinalProgress && (
                <div
                  className="pointer-events-none absolute top-5 h-0.5 bg-blue-700 z-10"
                  style={{ left: "calc(50% + 20px)", width: "calc(33.3333% - 40px)" }}
                />
              )}
              <div
                className="pointer-events-none absolute top-5 h-0.5 bg-blue-700 z-10"
                style={{ left: "calc(16.6667% + 20px)", width: "calc(33.3333% - 40px)" }}
              />

              <StatusStage state="done" label="Submitted" date={submittedDate} />
              <StatusStage state={statusMode.reviewState} label="Under Review" date={statusMode.reviewDate} />
              <StatusStage state={statusMode.finalState} label="Final Decision" date={statusMode.finalDate} />
            </div>
          </div>

          <div className="md:hidden space-y-5">
            <MobileStatusStep active label="Submitted" date={submittedDate} />
            <MobileStatusStep active={statusMode.reviewState === "current" || statusMode.reviewState === "done"} label="Under Review" date={statusMode.reviewDate} />
            <MobileStatusStep active={statusMode.finalState === "current" || statusMode.finalState === "done"} label="Final Decision" date={statusMode.finalDate} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 px-6 py-5 sm:px-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Submission Records</h2>
            <p className="text-sm text-slate-500">Track submitted forms, comments, and pending ownership.</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search records"
              className="w-full rounded-full border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-225">
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
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-500">
                    No records matched your search.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record, index) => (
                  <SubmissionRow
                    key={record.referenceId}
                    serialNo={String(index + 1)}
                    formId={buildFormId(record.referenceId, record.employee.employeeId)}
                    submittedDate={formatDateISO(record.submittedAt)}
                    status={record.status}
                    pendingFrom={record.pendingFrom}
                    action={record.status === "Changes Requested" ? "Update & Resubmit" : "NA"}
                    isSelected={record.referenceId === selectedRecord.referenceId}
                    onSelect={() => setSelectedReferenceId(record.referenceId)}
                    onOpenComments={() => setActiveCommentsRef(record.referenceId)}
                    onResubmit={() => navigate(`/employee/form/${record.referenceId}`)}
                    hasManagerComments={record.reviewHistory.length > 0}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Submitted Form Snapshot</h3>
                <p className="text-sm text-slate-500">A quick summary of the latest BPER submission.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoCard label="Employee" value={selectedRecord.employee.name} />
              <InfoCard label="Employee ID" value={selectedRecord.employee.employeeId} />
              <InfoCard label="Employment Title" value={effectiveTitle} />
              <InfoCard label="Supervisor" value={effectiveSupervisor} />
              <InfoCard label="Email" value={selectedRecord.employee.email} />
              <InfoCard label="Location" value={selectedRecord.employee.location} />
              <InfoCard label="Total Hours" value={`${selectedRecord.totalHours.toFixed(1)} hrs/month`} />
              <InfoCard label="Rows Submitted" value={`${selectedRecord.payload.rows.length}`} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">Timeline notes</p>
            <div className="space-y-4">
              <TimelineNote icon={<Clock3 size={16} />} title="Submitted" text={submittedDate} active />
              <TimelineNote
                icon={<Clock3 size={16} />}
                title="Under Review"
                text={statusMode.reviewDate}
                active={statusMode.reviewState === "current" || statusMode.reviewState === "done"}
              />
              <TimelineNote
                icon={<Clock3 size={16} />}
                title="Final Decision"
                text={statusMode.finalDate}
                active={statusMode.finalState === "current" || statusMode.finalState === "done"}
              />
            </div>
          </div>
        </div>
      </section>

      {activeCommentsRecord && <CommentsModal record={activeCommentsRecord} onClose={() => setActiveCommentsRef(null)} />}
    </div>
  );
}

function StatusStage({ state, label, date }: { state: "done" | "current" | "upcoming"; label: string; date: string }) {
  const circleClass =
    state === "done"
      ? "border-blue-700 bg-blue-700"
      : state === "current"
        ? "border-blue-700 bg-white"
        : "border-slate-300 bg-white";
  const titleClass = state === "upcoming" ? "text-slate-700" : "text-slate-900";

  return (
    <div className="flex flex-col items-center text-center">
      <div className={`h-10 w-10 rounded-full border-4 ${circleClass}`} />
      <div className="mt-5">
        <p className={`text-base font-semibold tracking-tight ${titleClass}`}>{label}</p>
        <p className="text-sm text-slate-400">{date}</p>
      </div>
    </div>
  );
}

function MobileStatusStep({ active = false, label, date }: { active?: boolean; label: string; date: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className={`h-5 w-5 rounded-full border-2 ${active ? "border-blue-700 bg-blue-700" : "border-slate-300 bg-white"}`} />
        {!label.includes("Final") && <div className="mt-1 h-8 w-0.5 bg-slate-200" />}
      </div>
      <div>
        <p className={`text-sm font-semibold ${active ? "text-slate-900" : "text-slate-700"}`}>{label}</p>
        <p className="text-xs text-slate-400">{date}</p>
      </div>
    </div>
  );
}

function SubmissionRow({
  serialNo,
  formId,
  submittedDate,
  status,
  pendingFrom,
  action,
  isSelected,
  onSelect,
  onOpenComments,
  onResubmit,
  hasManagerComments,
}: {
  serialNo: string;
  formId: string;
  submittedDate: string;
  status: "Under Review" | "Approved" | "Changes Requested";
  pendingFrom: string;
  action: string;
  isSelected: boolean;
  onSelect: () => void;
  onOpenComments: () => void;
  onResubmit: () => void;
  hasManagerComments: boolean;
}) {
  return (
    <tr
      className={`border-b border-slate-100 last:border-0 text-slate-800 cursor-pointer transition-colors ${
        isSelected ? "bg-blue-50/50" : "bg-white hover:bg-slate-50"
      }`}
      onClick={onSelect}
    >
      <td className="px-6 py-5">{serialNo}</td>
      <td className="px-6 py-5">{formId}</td>
      <td className="px-6 py-5">{submittedDate}</td>
      <td className="px-6 py-5">
        <StatusChip status={status} />
      </td>
      <td className="px-6 py-5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenComments();
          }}
          className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
        >
          {hasManagerComments ? "Comments" : "View Status"}
        </button>
      </td>
      <td className="px-6 py-5">{pendingFrom}</td>
      <td className="px-6 py-5">
        {action === "Update & Resubmit" ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onResubmit();
            }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95"
          >
            Revise
          </button>
        ) : (
          action
        )}
      </td>
    </tr>
  );
}

function StatusChip({ status }: { status: "Under Review" | "Approved" | "Changes Requested" }) {
  const className =
    status === "Approved"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Changes Requested"
        ? "bg-amber-100 text-amber-700"
        : "bg-blue-100 text-blue-700";

  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${className}`}>{status}</span>;
}

function CommentsModal({ record, onClose }: { record: BperSubmissionRecord; onClose: () => void }) {
  const latestReview = record.reviewHistory[0] || null;
  const isUnderReview = record.status === "Under Review" && record.reviewHistory.length === 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <MessageSquareText className="text-blue-700" size={20} />
            <h3 className="text-xl font-bold text-slate-900">Change Status</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100"
            aria-label="Close comments"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6 sm:px-8 space-y-5 bg-slate-50/50">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-center text-4xl font-semibold text-slate-900">
              {latestReview?.status === "Approved"
                ? "Form has been Approved"
                : latestReview?.status === "Changes Requested"
                  ? "Changes Requested by Manager"
                  : "Form is Under Review"}
            </p>
            <div className="mt-4 grid grid-cols-[160px_1fr] items-center gap-4">
              <p className="text-base font-medium text-slate-700">Comment:</p>
              <textarea
                readOnly
                value={latestReview?.comment || "No manager comment yet."}
                className="h-16 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700"
              />
            </div>
          </div>

          {isUnderReview ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 inline-flex items-center gap-2">
              <CircleAlert size={16} /> This form is under review by manager QG User2.
            </div>
          ) : (
            <div className="space-y-3">
              {record.reviewHistory.map((event) => (
                <ReviewEventCard key={`${record.referenceId}-${event.reviewedAt}-${event.status}`} event={event} />
              ))}
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md bg-cyan-500 px-6 py-2.5 font-semibold text-white hover:bg-cyan-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewEventCard({ event }: { event: BperReviewEvent }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-[0.14em]">
        {formatDateISO(event.reviewedAt)}
      </div>
      <div className="px-4 py-4">
        <p className="text-lg text-slate-700">
          <span className="font-semibold text-blue-700">{event.managerName}</span> commented on your post
        </p>
        <p className="mt-3 text-base text-slate-700">{event.comment || "-"}</p>
        <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          Status:
          <span
            className={`rounded px-2 py-0.5 text-white ${
              event.status === "Approved" ? "bg-emerald-600" : event.status === "Changes Requested" ? "bg-amber-600" : "bg-blue-600"
            }`}
          >
            {event.status}
          </span>
        </div>
      </div>
    </div>
  );
}

function buildFormId(referenceId: string, employeeId: string) {
  const token = referenceId.replace(/[^A-Z0-9]/gi, "").slice(-5).toUpperCase();
  return `${employeeId}-${token || "BPER1"}`;
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900 wrap-break-word">{value}</p>
    </div>
  );
}

function TimelineNote({ icon, title, text, active = false }: { icon: ReactNode; title: string; text: string; active?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}>
        {icon}
      </div>
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-500">{text}</p>
      </div>
    </div>
  );
}

function getStatusMode(status: "Under Review" | "Approved" | "Changes Requested") {
  if (status === "Approved") {
    return {
      hasFinalProgress: true,
      reviewState: "done" as const,
      finalState: "done" as const,
      reviewDate: "In progress",
      finalDate: "Approved",
    };
  }

  if (status === "Changes Requested") {
    return {
      hasFinalProgress: true,
      reviewState: "done" as const,
      finalState: "current" as const,
      reviewDate: "Reviewed",
      finalDate: "Changes requested",
    };
  }

  return {
    hasFinalProgress: false,
    reviewState: "current" as const,
    finalState: "upcoming" as const,
    reviewDate: "Pending review",
    finalDate: "Pending",
  };
}
