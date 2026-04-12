import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, CircleHelp, Plus, Trash2 } from "lucide-react";
import type { WdtActivityRow, WdtPayload, EmployeeSnapshot } from "./formTypes";

type EditorKind = "single" | "multi" | "number" | "select";

interface EditorState {
  rowIndex: number;
  field: keyof WdtActivityRow;
  label: string;
  description: string;
  kind: EditorKind;
  placeholder?: string;
  options?: string[];
  suggestions?: string[];
}

const majorProcessSuggestions = ["Accounts Payable", "General Accounting", "Treasury", "Vendor Management"];
const processSuggestions = ["Invoice Processing", "Month End / Per", "Reconciliation", "Audit Support"];
const subProcessSuggestions = [
  "CHA, Freight inward/…",
  "GIT Entries",
  "P1 from Plants",
  "Monthly accrual reconciliations",
];
const applicationSuggestions = ["SAP", "ServiceNow", "Excel", "Power BI", "Concur"];
const frequencyOptions = ["Daily", "Weekly", "Fortnightly", "Monthly", "Quarterly", "Annual"];

interface StepProps {
  employee: EmployeeSnapshot;
  payload: WdtPayload | null;
  onNext: () => void;
  onPrev: () => void;
  onPayloadChange: (payload: WdtPayload | null) => void;
}

const initialRows: WdtActivityRow[] = [
  {
    activityCategory: "core",
    majorProcess: "Accounts Payable",
    process: "Invoice Processing",
    subProcess: "CHA, Freight inward/…",
    frequency: "Daily",
    volumesMonthly: 10000,
    timeTakenHoursPerMonth: 1,
    applicationsUsed: "SAP",
    comments: "",
  },
  {
    activityCategory: "core",
    majorProcess: "General Accounting",
    process: "Month End / Per",
    subProcess: "GIT Entries",
    frequency: "Fortnightly",
    volumesMonthly: 100,
    timeTakenHoursPerMonth: 2,
    applicationsUsed: "SAP",
    comments: "",
  },
  {
    activityCategory: "core",
    majorProcess: "General Accounting",
    process: "Month End / Per",
    subProcess: "P1 from Plants",
    frequency: "Annual",
    volumesMonthly: 10,
    timeTakenHoursPerMonth: 30,
    applicationsUsed: "SAP",
    comments: "",
  },
  {
    activityCategory: "core",
    majorProcess: "General Accounting",
    process: "Month End / Per",
    subProcess: "New period for GL, AF…",
    frequency: "Fortnightly",
    volumesMonthly: 200,
    timeTakenHoursPerMonth: 40,
    applicationsUsed: "SAP",
    comments: "",
  },
  {
    activityCategory: "support",
    majorProcess: "Support Activities",
    process: "Miscellaneous Tasks",
    subProcess: "Monthly accrual reconciliations",
    frequency: "Monthly",
    volumesMonthly: 20,
    timeTakenHoursPerMonth: 20,
    applicationsUsed: "SAP",
    comments: "",
  },
];

function HeaderWithTooltip({ title, tooltip, required = false, centered = false }: { title: string; tooltip: string; required?: boolean; centered?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${centered ? "justify-center" : ""} relative group`}>
      <span>
        {title}
        {required && <span className="text-red-500">*</span>}
      </span>
      <button
        type="button"
        aria-label={`${title} help`}
        className="text-slate-400 hover:text-corporateBlue transition-colors"
      >
        <CircleHelp size={14} />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-72 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-xs font-medium normal-case tracking-normal text-slate-700 shadow-lg group-hover:block group-focus-within:block">
        {tooltip}
      </span>
    </span>
  );
}

export function Step2({ employee, payload, onNext, onPrev, onPayloadChange }: StepProps) {
  const [rows, setRows] = useState<WdtActivityRow[]>(payload?.rows?.length ? payload.rows : initialRows);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorDraft, setEditorDraft] = useState("");
  const coreEntries = useMemo(
    () => rows.map((row, rowIndex) => ({ row, rowIndex })).filter((entry) => entry.row.activityCategory !== "support"),
    [rows]
  );
  const supportEntries = useMemo(
    () => rows.map((row, rowIndex) => ({ row, rowIndex })).filter((entry) => entry.row.activityCategory === "support"),
    [rows]
  );

  useEffect(() => {
    onPayloadChange({ employee, rows });
  }, [employee, rows, onPayloadChange]);

  useEffect(() => {
    if (!editor) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editor]);

  const totalHours = useMemo(() => rows.reduce((sum, row) => sum + Number(row.timeTakenHoursPerMonth || 0), 0), [rows]);
  const coreHours = useMemo(
    () => coreEntries.reduce((sum, entry) => sum + Number(entry.row.timeTakenHoursPerMonth || 0), 0),
    [coreEntries]
  );
  const supportHours = useMemo(
    () => supportEntries.reduce((sum, entry) => sum + Number(entry.row.timeTakenHoursPerMonth || 0), 0),
    [supportEntries]
  );

  const updateRow = (index: number, field: keyof WdtActivityRow, value: string | number) => {
    setRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    );
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        activityCategory: "core",
        majorProcess: "",
        process: "",
        subProcess: "",
        frequency: "",
        volumesMonthly: 0,
        timeTakenHoursPerMonth: 0,
        applicationsUsed: "",
        comments: "",
      },
    ]);
  };

  const addSupportRow = () => {
    setRows((prev) => [
      ...prev,
      {
        activityCategory: "support",
        majorProcess: "",
        process: "",
        subProcess: "",
        frequency: "",
        volumesMonthly: 0,
        timeTakenHoursPerMonth: 0,
        applicationsUsed: "",
        comments: "",
      },
    ]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const openEditor = (config: EditorState) => {
    const currentValue = rows[config.rowIndex]?.[config.field];
    setEditor(config);
    setEditorDraft(currentValue == null ? "" : String(currentValue));
  };

  const saveEditor = () => {
    if (!editor) return;
    if (editor.kind === "number") {
      const nextNumber = Number(editorDraft || 0);
      updateRow(editor.rowIndex, editor.field, Number.isNaN(nextNumber) ? 0 : nextNumber);
    } else {
      updateRow(editor.rowIndex, editor.field, editorDraft);
    }
    setEditor(null);
  };

  return (
    <div className="bg-white rounded-b-md border-x border-b border-slate-200 shadow-sm font-sans flex flex-col relative overflow-hidden">
      <div className="bg-linear-to-r from-blue-50 to-slate-50 px-5 py-4 border-b border-blue-100">
        <h2 className="text-[17px] font-bold text-slate-900">Please add details for selected processes</h2>
      </div>

      <div className="p-4 sm:p-5 md:p-6 pb-24">
        <div className="w-full rounded-lg border border-slate-200 bg-white shadow-[0_8px_20px_-14px_rgba(15,23,42,0.35)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-7xl">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 tracking-[0.18em] uppercase border-y border-slate-200">
                  <th className="py-3 px-3 w-[14%]">Major Process*</th>
                  <th className="py-3 px-3 w-[13%]">Process*</th>
                  <th className="py-3 px-3 w-[18%]">Sub Process*</th>
                  <th className="py-3 px-3 w-32">
                    <HeaderWithTooltip
                      title="Frequency"
                      required
                      tooltip="Represents how frequently the activity / sub process is carried out."
                    />
                  </th>
                  <th className="py-3 px-3 text-center w-32">
                    <HeaderWithTooltip
                      title="Volumes(Monthly)"
                      required
                      centered
                      tooltip="Number of requests received and processed for the sub process in a month."
                    />
                  </th>
                  <th className="py-3 px-3 text-center w-32">
                    <HeaderWithTooltip
                      title="Time Taken(h/m)"
                      required
                      centered
                      tooltip="The number of hours required in a month to finish the activity. In case of annual / half yearly / quarterly activities, monthly average to be calculated (total / 12; total / 6; total / 3) and entered."
                    />
                  </th>
                  <th className="py-3 px-3 w-32">
                    <HeaderWithTooltip
                      title="Applications used"
                      tooltip="List of the systems being used to perform the task / activity. Could be Oracle, Tydy, Compport, Service Now etc. Word / excel / ppt etc."
                    />
                  </th>
                  <th className="py-3 px-3 w-[16%]">
                    <HeaderWithTooltip
                      title="Comments & Process Controls"
                      tooltip="Any additional comments / list of controls (manual & system) that are currently in force e.g review mechanism, segregation of duties, access controls."
                    />
                  </th>
                  <th className="py-3 pr-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {coreEntries.map(({ row, rowIndex }) => (
                  <tr key={`core-${rowIndex}-${row.majorProcess}-${row.subProcess}`} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="py-3 px-2">
                      <CellPreview
                        value={row.majorProcess}
                        placeholder="Click to enter"
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "majorProcess",
                            label: "Major Process",
                            description: "Select from predefined process families (Central Process Database integration will be added later) or type in natural language.",
                            kind: "single",
                            placeholder: "e.g. Accounts Payable",
                            suggestions: majorProcessSuggestions,
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2">
                      <CellPreview
                        value={row.process}
                        placeholder="Click to enter"
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "process",
                            label: "Process",
                            description: "Pick a standard process or type a custom process description in natural language.",
                            kind: "single",
                            placeholder: "e.g. Invoice Processing",
                            suggestions: processSuggestions,
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2">
                      <CellPreview
                        value={row.subProcess}
                        placeholder="Click to add sub process details"
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "subProcess",
                            label: "Sub Process",
                            description: "Use natural language for complete activity detail. Longer entries are easier to edit in this expanded view.",
                            kind: "multi",
                            placeholder: "Describe sub process in detail",
                            suggestions: subProcessSuggestions,
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2">
                      <CellPreview
                        value={row.frequency}
                        placeholder="Select"
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "frequency",
                            label: "Frequency",
                            description: "Choose a frequency from the standard list.",
                            kind: "select",
                            options: frequencyOptions,
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <CellPreview
                        value={String(row.volumesMonthly)}
                        placeholder="0"
                        mono
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "volumesMonthly",
                            label: "Volumes (Monthly)",
                            description: "Enter monthly transaction volume for this process.",
                            kind: "number",
                            placeholder: "e.g. 100",
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <CellPreview
                        value={String(row.timeTakenHoursPerMonth)}
                        placeholder="0"
                        mono
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "timeTakenHoursPerMonth",
                            label: "Time Taken (Hours / Month)",
                            description: "Enter the estimated monthly effort in hours.",
                            kind: "number",
                            placeholder: "e.g. 12.5",
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2">
                      <CellPreview
                        value={row.applicationsUsed}
                        placeholder="Click to enter"
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "applicationsUsed",
                            label: "Applications Used",
                            description: "List applications and tools used for this process.",
                            kind: "single",
                            placeholder: "e.g. SAP, Excel",
                            suggestions: applicationSuggestions,
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2">
                      <CellPreview
                        value={row.comments}
                        placeholder="Add notes"
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "comments",
                            label: "Comments & Process Controls",
                            description: "Provide controls, assumptions, and notes in full sentence format.",
                            kind: "multi",
                            placeholder: "Write comments and process controls",
                          })
                        }
                      />
                    </td>
                    <td className="py-3 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(rowIndex)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 flex justify-start">
          <button
            type="button"
            onClick={addRow}
            className="text-blue-700 font-semibold text-sm bg-white border border-slate-300 py-2.5 px-5 rounded-md hover:border-blue-600 hover:text-blue-800 transition-colors inline-flex items-center gap-2"
          >
            <Plus size={16} /> Add Row
          </button>
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white shadow-[0_8px_20px_-14px_rgba(15,23,42,0.35)] overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-linear-to-r from-blue-50 to-slate-50">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-700 text-white shadow-sm">
                <CircleHelp size={16} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">Miscellaneous Activities</h3>
                <p className="text-sm text-slate-500">These entries will appear as Support Activities in Step 3.</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-7xl">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 tracking-[0.18em] uppercase border-y border-slate-200">
                  <th className="py-3 px-3 w-[30%]">Activity Description</th>
                  <th className="py-3 px-3 text-center w-28">Vol/Mo</th>
                  <th className="py-3 px-3 text-center w-40">Time Taken (Hrs/Month)</th>
                  <th className="py-3 px-3 w-[25%]">Comments</th>
                  <th className="py-3 pr-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {supportEntries.map(({ row, rowIndex }) => (
                  <tr key={`support-${rowIndex}-${row.subProcess || "activity"}`} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="py-3 px-2">
                      <CellPreview
                        value={row.subProcess}
                        placeholder="Enter miscellaneous activity"
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "subProcess",
                            label: "Activity Description",
                            description: "Describe the support activity in detail.",
                            kind: "multi",
                            placeholder: "Enter miscellaneous activity",
                            suggestions: subProcessSuggestions,
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <CellPreview
                        value={String(row.volumesMonthly)}
                        placeholder="0"
                        mono
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "volumesMonthly",
                            label: "Volumes (Monthly)",
                            description: "Enter monthly support volume.",
                            kind: "number",
                            placeholder: "e.g. 20",
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <CellPreview
                        value={String(row.timeTakenHoursPerMonth)}
                        placeholder="0"
                        mono
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "timeTakenHoursPerMonth",
                            label: "Time Taken (Hours / Month)",
                            description: "Enter monthly effort for this support activity.",
                            kind: "number",
                            placeholder: "e.g. 20",
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2">
                      <CellPreview
                        value={row.comments}
                        placeholder="Add controls or notes"
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "comments",
                            label: "Comments",
                            description: "Add additional notes or controls for this support activity.",
                            kind: "multi",
                            placeholder: "Add controls or notes",
                          })
                        }
                      />
                    </td>
                    <td className="py-3 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(rowIndex)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {supportEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">No miscellaneous activities added yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/60">
            <button
              type="button"
              onClick={addSupportRow}
              className="text-blue-700 font-semibold text-sm bg-white border border-slate-300 py-2.5 px-5 rounded-md hover:border-blue-600 hover:text-blue-800 transition-colors inline-flex items-center gap-2"
            >
              <Plus size={16} /> Add Miscellaneous Activity
            </button>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onPrev}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 px-6 rounded-md shadow-md transition-colors inline-flex items-center gap-2"
          >
            Next: Review and Submit <ArrowRight size={18} />
          </button>
        </div>
      </div>

      <div className="fixed bottom-4 right-4 z-30 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white/95 text-slate-900 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.65)] backdrop-blur-sm">
        <div className="px-2.5 py-2 border-b border-slate-200 bg-blue-50/70">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Live Total</p>
          <p className="text-[11px] font-semibold text-slate-700">Hours / month</p>
        </div>
        <div className="px-2.5 py-2.5">
          <div className="text-2xl font-bold leading-none tabular-nums text-blue-800">{totalHours.toFixed(1)}</div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
            <div className="rounded-md bg-slate-100 px-1.5 py-1">
              <p className="uppercase tracking-widest text-slate-500">Core</p>
              <p className="mt-0.5 font-semibold tabular-nums text-slate-800">{coreHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-md bg-blue-50 px-1.5 py-1">
              <p className="uppercase tracking-widest text-blue-600">Support</p>
              <p className="mt-0.5 font-semibold tabular-nums text-slate-800">{supportHours.toFixed(1)}h</p>
            </div>
          </div>
        </div>
      </div>

      {editor &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-120 bg-slate-900/45 backdrop-blur-sm p-4 flex items-center justify-center">
            <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[82vh] overflow-y-auto">
              <div className="px-6 py-5 border-b border-slate-100 bg-linear-to-r from-blue-50 to-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Expanded field editor</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-900">{editor.label}</h3>
                <p className="mt-1 text-sm text-slate-600">{editor.description}</p>
              </div>

              <div className="px-6 py-6 space-y-4">
                {editor.kind === "multi" ? (
                  <textarea
                    value={editorDraft}
                    onChange={(event) => setEditorDraft(event.target.value)}
                    placeholder={editor.placeholder}
                    className="w-full min-h-44 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                ) : editor.kind === "number" ? (
                  <input
                    type="number"
                    min="0"
                    value={editorDraft}
                    onChange={(event) => setEditorDraft(event.target.value)}
                    placeholder={editor.placeholder}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xl font-semibold tabular-nums text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                ) : editor.kind === "select" ? (
                  <select
                    value={editorDraft}
                    onChange={(event) => setEditorDraft(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select</option>
                    {editor.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={editorDraft}
                    onChange={(event) => setEditorDraft(event.target.value)}
                    placeholder={editor.placeholder}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                )}

                {editor.suggestions && editor.suggestions.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-2">Quick picks</p>
                    <div className="flex flex-wrap gap-2">
                      {editor.suggestions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setEditorDraft(item)}
                          className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:border-blue-400 hover:text-blue-700"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditor(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEditor}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  Save Field
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function CellPreview({
  value,
  placeholder,
  onClick,
  mono = false,
}: {
  value: string;
  placeholder: string;
  onClick: () => void;
  mono?: boolean;
}) {
  const hasValue = value.trim().length > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-11 rounded border border-slate-200 bg-slate-100/90 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-blue-300 hover:bg-white"
    >
      <span className={`block truncate ${mono ? "font-mono tabular-nums" : ""} ${hasValue ? "text-slate-700" : "text-slate-400"}`}>
        {hasValue ? value : placeholder}
      </span>
    </button>
  );
}

export default Step2;