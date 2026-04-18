import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, CircleHelp, Plus, Trash2, Sparkles } from "lucide-react";
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

const frequencyOptions = ["Daily", "Weekly", "Fortnightly", "Monthly", "Quarterly", "Annual"];

interface TaxonomyItem {
  majorProcess: string;
  process: string;
  subProcesses: string[];
}

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
    subProcess: "Validation and Posting",
    frequency: "Daily",
    volumesMonthly: 1000,
    timePerTransactionMinutes: 5,
    timeTakenHoursPerMonth: 83.3,
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
  const [taxonomy, setTaxonomy] = useState<TaxonomyItem[]>([]);
  const [mapSuggestion, setMapSuggestion] = useState<any>(null);
  const [isMapping, setIsMapping] = useState(false);

  useEffect(() => {
    if (payload?.rows?.length) {
      setRows(payload.rows);
    }
  }, [payload]);

  useEffect(() => {
    async function fetchTaxonomy() {
      try {
        const token = localStorage.getItem('bper.auth.token');
        const deptParam = employee.department ? `?department=${encodeURIComponent(employee.department)}` : '';
        const res = await fetch(`http://localhost:5000/api/taxonomy/processes${deptParam}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setTaxonomy(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch taxonomy:', err);
      }
    }
    fetchTaxonomy();
  }, []);

  const majorProcessSuggestions = useMemo(() => Array.from(new Set(taxonomy.map(t => t.majorProcess))), [taxonomy]);
  
  const getProcessSuggestions = (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row?.majorProcess) return Array.from(new Set(taxonomy.map(t => t.process)));
    return taxonomy.filter(t => t.majorProcess === row.majorProcess).map(t => t.process);
  };

  const getSubProcessSuggestions = (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row?.process) return [];
    const match = taxonomy.find(t => t.process === row.process && (!row.majorProcess || t.majorProcess === row.majorProcess));
    return match ? match.subProcesses : [];
  };

  const applicationSuggestions = ["SAP", "ServiceNow", "Excel", "Power BI", "Concur"];

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

  const [validationError, setValidationError] = useState("");

  const isStepValid = useMemo(() => {
    return rows.every(row => 
      row.majorProcess?.trim() && 
      row.process?.trim() && 
      row.subProcess?.trim() && 
      row.frequency?.trim() && 
      Number(row.volumesMonthly) > 0 &&
      Number(row.timePerTransactionMinutes) > 0
    );
  }, [rows]);

  const handleNext = () => {
    if (!isStepValid) {
      setValidationError("Please ensure all rows have Major Process, Process, Sub-Process, Frequency, and Time Taken > 0.");
      return;
    }
    setValidationError("");
    onNext();
  };

  const updateRow = (index: number, field: keyof WdtActivityRow, value: string | number) => {
    setRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const nextRow = { ...row, [field]: value };
        
        // Auto-calculate hours if volume or time per trans changed
        if (field === "volumesMonthly" || field === "timePerTransactionMinutes") {
          const vol = Number(nextRow.volumesMonthly) || 0;
          const min = Number(nextRow.timePerTransactionMinutes) || 0;
          nextRow.timeTakenHoursPerMonth = (vol * min) / 60;
        }
        
        return nextRow;
      })
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
        timePerTransactionMinutes: 0,
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
        timePerTransactionMinutes: 0,
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
    setMapSuggestion(null);
  };

  const triggerMapping = async (text: string) => {
    if (!text.trim()) return;
    setIsMapping(true);
    setMapSuggestion(null);
    try {
      const token = localStorage.getItem('bper.auth.token');
      const res = await fetch('http://localhost:5000/api/taxonomy/map', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text, context: "subProcess" })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.mapped) setMapSuggestion(data);
      }
    } catch (err) {
      console.error('Failed to map activity:', err);
    } finally {
      setIsMapping(false);
    }
  };

  const applyMapping = () => {
    if (!editor || !mapSuggestion) return;
    
    // Auto-fill related fields in the same row
    if (mapSuggestion.suggestion.majorProcess) {
       updateRow(editor.rowIndex, "majorProcess", mapSuggestion.suggestion.majorProcess);
    }
    if (mapSuggestion.suggestion.process) {
       updateRow(editor.rowIndex, "process", mapSuggestion.suggestion.process);
    }
    
    // Update the custom text to the mapped suggestion to keep it standardized
    setEditorDraft(mapSuggestion.suggestion.subProcess);
    
    // Set AI Mapping Flags (must update them sequentially via setRows manually to ensure we catch all at once)
    setRows(prev => prev.map((r, idx) => idx === editor.rowIndex ? {
        ...r,
        isAiMapped: true,
        aiConfidence: mapSuggestion.confidence,
        originalCustomInput: editorDraft // save what they typed initially
    } : r));

    setMapSuggestion(null);
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
                  <th className="py-3 px-3 text-center w-28">
                    <HeaderWithTooltip
                      title="Vol/Mo"
                      required
                      centered
                      tooltip="Number of requests received and processed for the sub process in a month."
                    />
                  </th>
                  <th className="py-3 px-3 text-center w-28">
                    <HeaderWithTooltip
                      title="Min/Trans"
                      required
                      centered
                      tooltip="Time taken per single transaction/item in minutes."
                    />
                  </th>
                  <th className="py-3 px-3 text-center w-28">
                    <HeaderWithTooltip
                      title="Total Hrs"
                      centered
                      tooltip="Automatically calculated: (Vol * Min) / 60. Represents monthly effort."
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
                            description: "Select from predefined process families fetched from the Central Process Database.",
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
                            suggestions: getProcessSuggestions(rowIndex),
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
                            description: "Use natural language for complete activity detail.",
                            kind: "multi",
                            placeholder: "Describe sub process in detail",
                            suggestions: getSubProcessSuggestions(rowIndex),
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
                            label: "Monthly Volume",
                            description: "Number of units or requests processed per month.",
                            kind: "number",
                            placeholder: "e.g. 100",
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <CellPreview
                        value={String(row.timePerTransactionMinutes)}
                        placeholder="0"
                        mono
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "timePerTransactionMinutes",
                            label: "Time Per Trans (Min)",
                            description: "Average minutes taken to complete one transaction.",
                            kind: "number",
                            placeholder: "e.g. 15",
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2 text-center bg-slate-50/30">
                      <div className="text-sm font-bold text-blue-800 tabular-nums">
                        {((Number(row.volumesMonthly) * Number(row.timePerTransactionMinutes)) / 60).toFixed(1)}h
                      </div>
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
                  <th className="py-3 px-3 text-center w-28">Min/Trans</th>
                  <th className="py-3 px-3 text-center w-28">Total Hrs</th>
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
                            suggestions: getSubProcessSuggestions(rowIndex),
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
                        value={String(row.timePerTransactionMinutes)}
                        placeholder="0"
                        mono
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "timePerTransactionMinutes",
                            label: "Time Per Trans (Min)",
                            description: "Minutes per transaction for this support activity.",
                            kind: "number",
                            placeholder: "e.g. 15",
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2 text-center bg-slate-50/20">
                      <div className="text-sm font-bold text-slate-700 tabular-nums">
                        {((Number(row.volumesMonthly) * Number(row.timePerTransactionMinutes)) / 60).toFixed(1)}h
                      </div>
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

        {validationError && (
          <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm font-medium animate-in fade-in slide-in-from-top-1">
            {validationError}
          </div>
        )}

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
            onClick={handleNext}
            className={`font-semibold py-3 px-6 rounded-md shadow-md transition-all inline-flex items-center gap-2 ${
              isStepValid 
                ? "bg-blue-700 hover:bg-blue-800 text-white" 
                : "bg-slate-200 text-slate-500 cursor-not-allowed"
            }`}
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
                  <div className="space-y-4">
                    <textarea
                      value={editorDraft}
                      onChange={(event) => setEditorDraft(event.target.value)}
                      placeholder={editor.placeholder}
                      className="w-full min-h-44 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    {editor.field === "subProcess" && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                        <div className="flex items-center justify-between mb-3">
                           <div>
                             <h4 className="text-sm font-semibold text-blue-900 flex items-center gap-1.5"><Sparkles size={16} className="text-blue-600" /> AI Auto-Mapping</h4>
                             <p className="text-xs text-blue-700/80 mt-0.5">Find standardized process matches for your custom input.</p>
                           </div>
                           <button
                             type="button"
                             disabled={isMapping || !editorDraft.trim()}
                             onClick={() => triggerMapping(editorDraft)}
                             className="rounded-lg bg-white border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                           >
                             {isMapping ? "Analyzing..." : "Map Custom Input"}
                           </button>
                        </div>
                        {mapSuggestion && (
                          <div className="mt-3 rounded-lg bg-white border border-blue-100 p-3 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                             <div className="flex justify-between items-start mb-2">
                               <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Suggested Match</span>
                               <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${mapSuggestion.confidence > 70 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                 {mapSuggestion.confidence}% Confidence
                               </span>
                             </div>
                             <div className="text-sm font-medium text-slate-800">
                               {mapSuggestion.suggestion.majorProcess} <span className="text-slate-400 mx-1">/</span> {mapSuggestion.suggestion.process}
                             </div>
                             <div className="text-xs text-slate-500 mt-1">
                               Matches: "{mapSuggestion.suggestion.subProcess}"
                             </div>
                             <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
                               <button
                                 type="button"
                                 onClick={applyMapping}
                                 className="flex-1 rounded border border-blue-200 bg-blue-50 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                               >
                                 Accept Suggestion
                               </button>
                               <button
                                 type="button"
                                 onClick={() => setMapSuggestion(null)}
                                 className="flex-1 rounded border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                               >
                                 Keep Custom Flow
                               </button>
                             </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
                  onClick={() => {
                    setEditor(null);
                    setMapSuggestion(null);
                  }}
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