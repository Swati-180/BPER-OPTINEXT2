import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Download, ExternalLink, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Step1 } from "./Step1";
import { Step2 } from "./Step2";
import { Step3 } from "./Step3";
import type { WdtPayload, WdtActivityRow, ProcessSelection } from "./formTypes";
import { ProcessSelectionPanel } from "./ProcessSelectionPanel";
import { demoEmployeeProfile } from "./demoEmployeeData";
import { buildBperSubmission, saveBperSubmission, loadBperDraft, saveBperDraft } from "./bperSubmissionStorage";
import { useEmployeeDraftGuard } from "../../layouts/EmployeeLayout";
import { FormPageSkeleton } from '../../components/PortalSkeletons';
import { apiFetch } from "../../lib/api";

export default function BPERForm() {
  const navigate = useNavigate();
  const { refId } = useParams();
  const { setHasUnsavedDraft } = useEmployeeDraftGuard();
  const [profile, setProfile] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [payload, setPayload] = useState<WdtPayload | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const [windowStatus, setWindowStatus] = useState<any>(null);

  useEffect(() => {
    async function fetchProfile() {
      setIsLoadingProfile(true);
      try {
        const [res, windowRes] = await Promise.all([
          apiFetch('/auth/me'),
          apiFetch('/wdt/window-status'),
        ]);

        const data = await res.json().catch(() => null);
        if (res.ok) {
          // Map backend User fields to the EmployeeSnapshot format expected by Step1
          const mappedProfile = {
            ...data,
            title: data.designation || 'N/A',
            department: data.department || data.organization || 'N/A',
            assignedClient: data.client || 'N/A',
            primaryTower: data.department || data.organization || 'N/A', // Fallback
            employeeType: 'FTE' // Default
          };
          setProfile(mappedProfile);
        }

        if (windowRes.ok) {
          setWindowStatus(await windowRes.json().catch(() => null));
        }
      } catch (error) {
        console.error('Failed to fetch profile/window for form:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    }
    fetchProfile();
  }, []);

  useEffect(() => {
    async function loadInitialData() {
      if (refId) {
        setIsLoadingProfile(true);
        try {
          const res = await apiFetch(`/wdt/submissions/${refId}`);
          if (res.ok) {
            const data = await res.json().catch(() => null);
            setPayload(data.payload);
            setCurrentStep(3); // Jump to input table for revision
          }
        } catch (err) {
          console.error('Failed to load refId submission:', err);
        } finally {
          setIsLoadingProfile(false);
        }
      } else {
        const draft = loadBperDraft();
        if (draft) {
          setPayload(draft);
        }
      }
    }
    loadInitialData();
  }, [refId]);

  useEffect(() => {
    if (payload && !isSubmitted) {
      saveBperDraft(payload);
      setShowSavedIndicator(true);
      const timer = setTimeout(() => setShowSavedIndicator(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [payload, isSubmitted]);

  useEffect(() => {
    if (isSubmitted) {
      setHasUnsavedDraft(false);
      return;
    }

    setHasUnsavedDraft(Boolean(payload || currentStep > 1));
  }, [currentStep, payload, isSubmitted, setHasUnsavedDraft]);

  const totalHours = useMemo(
    () => payload?.rows.reduce((sum, row) => sum + Number(row.timeTakenHoursPerMonth || 0), 0) || 0,
    [payload]
  );

  const handleSubmit = async () => {
    if (!payload || !profile) return;
    setIsSubmitting(true);
    try {
      const submission = buildBperSubmission(payload, profile, refId);

      setSubmittedCount(payload.rows.length);
      await saveBperSubmission(submission);
      await saveBperDraft(null); // Clear draft on success
      setIsSubmitted(true);
      setHasUnsavedDraft(false);
      setShowSuccessOverlay(true);
    } catch (err: any) {
      alert(err.message || "Failed to submit form. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadSummary = () => {
    if (!payload || !profile) return;

    const summaryWindow = window.open("", "_blank", "noopener,noreferrer,width=980,height=760");
    if (!summaryWindow) {
      window.print();
      return;
    }

    const rowsMarkup = payload.rows
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.subProcess || "-")}</td>
            <td>${escapeHtml(row.frequency || "-")}</td>
            <td>${Number(row.timeTakenHoursPerMonth || 0).toFixed(1)}</td>
          </tr>`
      )
      .join("");

    summaryWindow.document.write(`
      <html>
        <head>
          <title>BPER Submission Summary</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }
            h1 { margin: 0 0 8px; font-size: 28px; }
            .sub { color: #64748b; margin-bottom: 24px; }
            .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
            .card { border: 1px solid #dbe4f0; border-radius: 12px; padding: 14px; background: #f8fbff; }
            .label { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #64748b; margin-bottom: 6px; }
            .value { font-size: 16px; font-weight: 700; color: #1e3a8a; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; font-size: 13px; text-align: left; }
            th { background: #f8fafc; text-transform: uppercase; letter-spacing: .08em; font-size: 11px; color: #475569; }
          </style>
        </head>
        <body>
          <h1>BPER Submission Summary</h1>
          <div class="sub">Employee submission snapshot ready for download or print-to-PDF.</div>
          <div class="grid">
            <div class="card"><div class="label">Employee</div><div class="value">${escapeHtml(profile.name)}</div></div>
            <div class="card"><div class="label">Employee ID</div><div class="value">${escapeHtml(profile.employeeId)}</div></div>
            <div class="card"><div class="label">Activity Entries</div><div class="value">${payload.rows.length}</div></div>
            <div class="card"><div class="label">Total Hours</div><div class="value">${totalHours.toFixed(1)} hrs/month</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Subprocess/Activity</th><th>Frequency</th><th>Hours</th>
              </tr>
            </thead>
            <tbody>
              ${rowsMarkup}
            </tbody>
          </table>
        </body>
      </html>
    `);
    summaryWindow.document.close();
    summaryWindow.focus();
    summaryWindow.print();
  };

  const handleGoToStatus = () => {
    setShowSuccessOverlay(false);
    navigate("/employee/status");
  };

  const handleCloseAndReturn = () => {
    closeSuccessOverlay();
  };

  const handleSaveDraft = () => {
    if (payload) {
      saveBperDraft(payload);
      setShowSavedIndicator(true);
      setTimeout(() => setShowSavedIndicator(false), 2000);
      alert('Draft saved successfully! You can resume this form later.');
    }
  };

  const closeSuccessOverlay = () => {
    setShowSuccessOverlay(false);
    setCurrentStep(4);
  };

  const stepItems = [
    { id: 1, label: "Profile Data" },
    { id: 2, label: "Process Selection" },
    { id: 3, label: "Input Details" },
    { id: 4, label: "Review" },
  ];
  const progressPercent = Math.round((currentStep / stepItems.length) * 100);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="mb-7">
        <h1 className="text-3xl font-bold text-gray-900">BPER Form</h1>
      </div>

      {isLoadingProfile ? (
        <FormPageSkeleton />
      ) : (
      <>
      <div className="w-full relative shadow-sm rounded-md">
        <div className="bg-white rounded-t-md border border-slate-200 px-4 py-4 sm:px-6 shadow-sm relative z-10 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Form Progress
                </p>
                {showSavedIndicator && (
                  <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                    <CheckCircle2 size={12} /> Saved √
                  </span>
                )}
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full rounded-full bg-blue-700 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
            <span className="shrink-0 inline-flex items-center rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
              Step {currentStep} of {stepItems.length}
            </span>
          </div>

          <div className="overflow-x-auto w-full">
            <div className="flex items-center gap-6 min-w-175 px-1 sm:px-2">
              {stepItems.map((step, index) => {
                const isCompleted = currentStep > step.id;
                const isCurrent = currentStep === step.id;
                const connectorFilled = currentStep > step.id;

                return (
                  <div key={step.id} className="contents">
                    <div className={`flex items-center gap-3 ${isCurrent || isCompleted ? "opacity-100" : "opacity-45"}`}>
                      <div
                        className={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-semibold transition-colors ${
                          isCompleted
                            ? "bg-emerald-600 text-white"
                            : isCurrent
                              ? "bg-blue-700 text-white"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isCompleted ? <Check size={16} /> : step.id}
                      </div>
                      <span className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${isCurrent || isCompleted ? "text-slate-900" : "text-slate-500"}`}>
                        {step.label}
                      </span>
                    </div>

                    {index < stepItems.length - 1 && (
                      <div className={`h-px w-14 ${connectorFilled ? "bg-blue-700" : "bg-slate-200"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="relative -mt-px w-full z-0">
          {currentStep === 1 && (
            <Step1 
              employee={profile} 
              windowStatus={windowStatus} 
              onNext={() => setCurrentStep(2)} 
              onPrev={() => navigate("/employee/dashboard")} 
            />
          )}
          {currentStep === 2 && (
            <div className="bg-white rounded-b-md border-x border-b border-slate-200 shadow-sm">
              <div className="bg-gradient-to-r from-blue-50 to-slate-50 px-5 py-4 border-b border-blue-100">
                <h2 className="text-[17px] font-bold text-slate-900">Select Your Process</h2>
                <p className="text-sm text-slate-500 mt-0.5">Choose a process combination to add to your input table.</p>
              </div>
              <div className="p-5 sm:p-6">
                <ProcessSelectionPanel
                  onSelectionComplete={(selection) => {
                    const newRow: WdtActivityRow = {
                      activityCategory: selection.isMiscellaneous ? 'support' : 'core',
                      majorProcess: selection.majorProcess || '',
                      process: selection.process || '',
                      subProcess: selection.subProcess || '',
                      frequency: '',
                      volumesMonthly: 0,
                      timePerTransactionMinutes: 0,
                      timeTakenHoursPerMonth: 0,
                      applicationsUsed: '',
                      comments: ''
                    };
                    if (payload) {
                      setPayload({ ...payload, rows: [...payload.rows, newRow] });
                    } else {
                      setPayload({ employee: profile, rows: [newRow] });
                    }
                    setCurrentStep(3);
                  }}
                />
                <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Back to Profile
                  </button>
                  {payload && payload.rows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Cancel & Return to Table
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {currentStep === 3 && (
            <Step2
              employee={profile}
              payload={payload}
              onNext={() => setCurrentStep(4)}
              onPrev={() => setCurrentStep(1)} // Back from table goes to Profile
              onPayloadChange={setPayload}
              onAddRowRequest={() => setCurrentStep(2)}
            />
          )}
          {currentStep === 4 && (
            <Step3
              payload={payload}
              onPrev={() => setCurrentStep(3)}
              onSubmit={handleSubmit}
              onSaveDraft={handleSaveDraft}
              onEditSection={() => setCurrentStep(3)}
              submitDisabled={isSubmitted}
            />
          )}
        </div>
      </div>

      {showSuccessOverlay && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-linear-to-r from-blue-50 via-white to-slate-50 px-6 py-6 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 ring-8 ring-emerald-50/70 shrink-0">
                    <CheckCircle2 size={28} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-1">Submission complete</p>
                    <h3 className="text-3xl font-bold text-slate-900 tracking-tight">Submission Confirmed</h3>
                    <p className="mt-2 text-sm text-slate-500 max-w-2xl">
                      Your BPER filing was submitted successfully and is now available in Form Status for review.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseAndReturn}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                  aria-label="Close submission dialog"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryChip label="Entries" value={`${submittedCount}`} tone="blue" />
                <SummaryChip label="Hours" value={`${totalHours.toFixed(1)}`} tone="slate" />
                <SummaryChip label="Step" value="3/3" tone="emerald" />
                <SummaryChip label="Status" value="Submitted" tone="blue" />
              </div>
            </div>

            <div className="px-6 py-6 sm:px-8">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2">What happens next</p>
                    <ul className="space-y-2 text-sm text-slate-600 leading-relaxed list-disc pl-5">
                      <li>The submitted draft is saved and visible in Form Status.</li>
                      <li>You can download a summary or open the status page for review progress.</li>
                      <li>Closing this card returns you to Step 3.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-3">Submission details</p>
                    <div className="space-y-3 text-sm">
                      <DetailLine label="Employee" value={profile?.name} />
                      <DetailLine label="Employee ID" value={profile?.employeeId} />
                      <DetailLine label="Reference" value={`BPER-${profile?.employeeId}-${submittedCount}`} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={handleDownloadSummary}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 font-semibold text-slate-800 transition-colors hover:bg-slate-100"
                >
                  <Download size={16} /> Download PDF
                </button>
                <button
                  type="button"
                  onClick={handleGoToStatus}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-800"
                >
                  <ExternalLink size={16} /> Go to Form Status
                </button>
                <button
                  type="button"
                  onClick={handleCloseAndReturn}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Close and Return
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function SummaryChip({ label, value, tone }: { label: string; value: string; tone: "blue" | "slate" | "emerald" }) {
  const toneClasses =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : tone === "slate"
        ? "bg-slate-50 text-slate-700 border-slate-200"
        : "bg-blue-50 text-blue-700 border-blue-100";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClasses}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900 text-right">{value}</span>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
