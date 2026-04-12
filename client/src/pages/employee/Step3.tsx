import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Edit3, Save, Send } from "lucide-react";
import type { WdtPayload } from "./formTypes";

interface StepProps {
  payload: WdtPayload | null;
  onPrev: () => void;
  onSubmit: () => void;
  onSaveDraft: () => void;
  onEditSection: (section: "core" | "support") => void;
  submitDisabled?: boolean;
}

export function Step3({ payload, onPrev, onSubmit, onSaveDraft, onEditSection, submitDisabled = false }: StepProps) {
  const [isCertified, setIsCertified] = useState(false);

  const rows = payload?.rows || [];
  const totalHours = useMemo(() => rows.reduce((sum, row) => sum + Number(row.timeTakenHoursPerMonth || 0), 0), [rows]);
  const totalFte = useMemo(() => totalHours / 160, [totalHours]);
  const coreRows = useMemo(() => rows.filter((row) => row.activityCategory !== "support"), [rows]);
  const supportRows = useMemo(() => rows.filter((row) => row.activityCategory === "support"), [rows]);
  const coreHours = useMemo(
    () => coreRows.reduce((sum, row) => sum + Number(row.timeTakenHoursPerMonth || 0), 0),
    [coreRows]
  );
  const supportHours = useMemo(
    () => supportRows.reduce((sum, row) => sum + Number(row.timeTakenHoursPerMonth || 0), 0),
    [supportRows]
  );
  const draftLabel = useMemo(() => {
    if (!rows.length) return "-";
    return `ROWS-${rows.length}-HRS-${Math.round(totalHours)}`;
  }, [rows, totalHours]);

  return (
    <div className="bg-white rounded-b-md border-x border-b border-slate-200 shadow-sm font-sans flex flex-col relative overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex-1 p-6 sm:p-8 lg:p-10 lg:border-r lg:border-slate-200">
          <div className="mb-8 max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-2">Audit summary</p>
            <h2 className="text-2xl font-semibold text-slate-900 mb-2">Comprehensive Summary</h2>
            <p className="text-sm text-slate-500 leading-relaxed">Review all process metrics before final submission in the portal.</p>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between mb-3 bg-slate-50 px-3 py-2 border-l-2 border-blue-700">
              <h3 className="text-[11px] font-semibold text-slate-700 tracking-[0.2em] uppercase">Core Activities</h3>
              <button
                type="button"
                onClick={() => onEditSection("core")}
                className="text-[11px] font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
              >
                <Edit3 size={12} /> Edit
              </button>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.18em] border-b border-slate-100">
                  <th className="pb-2">Sub-Process</th>
                  <th className="pb-2 text-right">FTE Count</th>
                  <th className="pb-2 text-right">Allocated Hours</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {coreRows.map((row, index) => (
                  <tr key={`${row.subProcess}-${index}`} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 text-slate-700 font-medium">{row.subProcess}</td>
                    <td className="py-2.5 text-right text-slate-500 tabular-nums">-</td>
                    <td className="py-2.5 text-right font-medium text-slate-900 tabular-nums">{Number(row.timeTakenHoursPerMonth || 0).toFixed(1)}</td>
                  </tr>
                ))}
                {coreRows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-slate-500">No core activities found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between mb-3 bg-slate-50 px-3 py-2 border-l-2 border-slate-400">
              <h3 className="text-[11px] font-semibold text-slate-700 tracking-[0.2em] uppercase">Support Activities</h3>
              <button
                type="button"
                onClick={() => onEditSection("support")}
                className="text-[11px] font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
              >
                <Edit3 size={12} /> Edit
              </button>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.18em] border-b border-slate-100">
                  <th className="pb-2">Sub-Process</th>
                  <th className="pb-2 text-right">FTE Count</th>
                  <th className="pb-2 text-right">Allocated Hours</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {supportRows.map((row, index) => (
                  <tr key={`${row.subProcess}-${index}`} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 text-slate-700 font-medium">{row.subProcess}</td>
                    <td className="py-2.5 text-right text-slate-500 tabular-nums">-</td>
                    <td className="py-2.5 text-right font-medium text-slate-900 tabular-nums">{Number(row.timeTakenHoursPerMonth || 0).toFixed(1)}</td>
                  </tr>
                ))}
                {supportRows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-slate-500">No support activities found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full bg-slate-50/60 p-6 sm:p-8 flex flex-col gap-6">
          <div className="bg-linear-to-br from-[#0A2A52] to-[#123C72] rounded-md shadow-lg overflow-hidden relative">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-20 -mt-20 blur-2xl pointer-events-none" />
            <div className="px-8 pt-8 pb-6 border-b border-white/10 relative">
              <p className="text-[11px] font-semibold text-slate-300 tracking-[0.2em] uppercase mb-4 flex items-center gap-2">
                Calculated Total <span className="opacity-50">i</span>
              </p>
              <h1 className="text-5xl font-light text-white mb-2 tracking-tight tabular-nums">{totalHours.toFixed(1)}</h1>
              <p className="text-sm text-slate-300">Aggregate allocated hours</p>
            </div>

            <div className="px-8 py-5 bg-blue-700 relative flex justify-between items-center">
              <div>
                <p className="text-[10px] font-semibold text-slate-200 tracking-[0.2em] uppercase mb-1">Total FTE Equivalent</p>
                <p className="text-xl font-medium text-white tabular-nums">{totalFte.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold text-slate-200 tracking-[0.2em] uppercase mb-1">Consistency</p>
                <div className="flex items-center gap-1.5 text-white bg-white/15 px-2 py-0.5 rounded-md text-xs font-semibold">
                  <CheckCircle2 size={12} /> Verified
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-6 shadow-sm">
            <h4 className="text-[11px] font-semibold text-slate-500 tracking-[0.2em] uppercase mb-4">Metric Breakdown</h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Core Processes</span>
                <span className="font-medium text-slate-900 tabular-nums">{coreHours.toFixed(1)}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Support Functions</span>
                <span className="font-medium text-slate-900 tabular-nums">{supportHours.toFixed(1)}h</span>
              </div>
              <div className="pt-4 mt-4 border-t border-slate-100 flex justify-between items-center">
                <span className="text-slate-600 font-semibold">Draft ID</span>
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-md tabular-nums">{draftLabel}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {submitDisabled && <p className="text-sm text-red-600 font-semibold text-center">Submissions are closed</p>}
            {submitDisabled && <p className="text-sm text-blue-700 font-semibold text-center">Form has been submitted</p>}
            {!submitDisabled && !isCertified && (
              <p className="text-sm text-amber-700 font-semibold text-center">Please certify the declaration before submitting.</p>
            )}
            <button
              type="button"
              onClick={onPrev}
              className="w-full bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold py-3 px-6 rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} /> Back to Process Details
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitDisabled || !isCertified}
              className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-md transition-colors flex items-center justify-center gap-3 shadow-md"
            >
              <Send size={18} /> {submitDisabled ? "Form has been submitted" : "Submit BPER Form"}
            </button>
            <button
              type="button"
              onClick={onSaveDraft}
              className="w-full bg-transparent border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold py-4 px-6 rounded-md transition-colors flex items-center justify-center gap-3"
            >
              <Save size={18} /> Save as Draft
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 sm:px-8 pb-8">
        <div className="mx-auto max-w-2xl bg-slate-50 border border-slate-200 rounded-md p-5 sm:p-6 flex gap-4 items-start justify-center">
          <div className="flex-none mt-1">
            <input
              type="checkbox"
              checked={isCertified}
              onChange={(event) => setIsCertified(event.target.checked)}
              className="w-5 h-5 accent-blue-700 border-slate-300 rounded focus:ring-blue-700 cursor-pointer"
            />
          </div>
          <div className="max-w-xl">
            <h4 className="text-sm font-semibold text-slate-900 mb-1 cursor-pointer select-none">I certify these details are accurate</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              By checking this box, I confirm that the hours and FTE allocations reported above accurately reflect the institutional intelligence records for the current fiscal period.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Step3;