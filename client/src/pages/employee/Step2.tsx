import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, CircleHelp, Plus, Trash2, Sparkles, AlertCircle, Lock } from "lucide-react";
import type { WdtActivityRow, WdtPayload, EmployeeSnapshot } from "./formTypes";
import { apiFetch } from "../../lib/api";

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
  department?: string;
}

interface StepProps {
  employee: EmployeeSnapshot;
  payload: WdtPayload | null;
  onNext: () => void;
  onPrev: () => void;
  onPayloadChange: (payload: WdtPayload | null) => void;
  onAddRowRequest?: () => void;
}

const initialRows: WdtActivityRow[] = [];


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

export function Step2({ employee, payload, onNext, onPrev, onPayloadChange, onAddRowRequest }: StepProps) {
  const [rows, setRows] = useState<WdtActivityRow[]>(payload?.rows ?? []);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorDraft, setEditorDraft] = useState("");
  const [activeTab, setActiveTab] = useState<'existing' | 'custom'>('custom');
  const [searchQuery, setSearchQuery] = useState('');
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
        console.log('[Step2] Fetching all taxonomy processes');
        const res = await apiFetch('/taxonomy/processes');
        if (res.ok) {
          const data = await res.json().catch(() => null);
          console.log('[Step2] Fetched taxonomy data successfully. Count:', data?.length);
          setTaxonomy(data || []);
        } else {
          console.error('[Step2] Fetch taxonomy failed with status:', res.status);
        }
      } catch (err) {
        console.error('Failed to fetch taxonomy:', err);
      }
    }
    fetchTaxonomy();
  }, [employee?.department]);

  const allSubProcesses = useMemo(() => {
    console.log('[Step2] Recalculating allSubProcesses. taxonomy count:', taxonomy?.length);
    if (!taxonomy || !Array.isArray(taxonomy)) return [];
    const result = taxonomy.flatMap(t => 
      (t.subProcesses || []).map(sp => ({
        subProcess: sp,
        process: t.process,
        majorProcess: t.majorProcess,
        department: t.department
      }))
    ).sort((a, b) => {
      const deptA = a.department || '';
      const deptB = b.department || '';
      const empDept = employee?.department || '';
      
      const isAMatch = empDept && deptA.toLowerCase() === empDept.toLowerCase();
      const isBMatch = empDept && deptB.toLowerCase() === empDept.toLowerCase();
      
      if (isAMatch && !isBMatch) return -1;
      if (!isAMatch && isBMatch) return 1;
      
      if (deptA !== deptB) return deptA.localeCompare(deptB);
      if (a.majorProcess !== b.majorProcess) return a.majorProcess.localeCompare(b.majorProcess);
      if (a.process !== b.process) return a.process.localeCompare(b.process);
      return a.subProcess.localeCompare(b.subProcess);
    });
    console.log('[Step2] Recalculated allSubProcesses. Result count:', result.length);
    return result;
  }, [taxonomy, employee?.department]);

  const filteredSubProcesses = useMemo(() => {
    if (!searchQuery) return allSubProcesses;
    const lowerQuery = searchQuery.toLowerCase();
    return allSubProcesses.filter(item => 
      item.subProcess.toLowerCase().includes(lowerQuery) ||
      item.process.toLowerCase().includes(lowerQuery) ||
      item.majorProcess.toLowerCase().includes(lowerQuery)
    );
  }, [allSubProcesses, searchQuery]);

  const majorProcessSuggestions = useMemo(() => Array.from(new Set(taxonomy.map(t => t.majorProcess))), [taxonomy]);
  
  const getProcessSuggestions = (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row?.majorProcess) return Array.from(new Set(taxonomy.map(t => t.process)));
    return taxonomy.filter(t => t.majorProcess === row.majorProcess).map(t => t.process);
  };

  const getSubProcessSuggestions = (rowIndex: number) => {
    const row = rows[rowIndex];
    if (row?.process) {
      const match = taxonomy.find(t => t.process === row.process && (!row.majorProcess || t.majorProcess === row.majorProcess));
      return match ? [...match.subProcesses].sort((a, b) => a.localeCompare(b)) : [];
    }

    // Default suggestions: Use the sorted sub-processes from allSubProcesses (bubbles employee's department to the top)
    const uniqueSubs: string[] = [];
    const seen = new Set<string>();
    
    for (const item of allSubProcesses) {
      if (!seen.has(item.subProcess)) {
        seen.add(item.subProcess);
        uniqueSubs.push(item.subProcess);
      }
    }
    
    return uniqueSubs.slice(0, 8);
  };

  const applicationSuggestions = ["SAP", "ServiceNow", "Excel", "Power BI", "Concur"];

  // Helper: Calculate volume per frequency from volumesMonthly
  const calculateVolumesPerFrequency = (volumesMonthly: number, frequency: string): number => {
    switch (frequency) {
      case "Daily":
        return Math.round((volumesMonthly / 30) * 100) / 100;
      case "Weekly":
        return Math.round((volumesMonthly / 4) * 100) / 100;
      case "Fortnightly":
        return Math.round((volumesMonthly / 2) * 100) / 100;
      case "Monthly":
        return volumesMonthly;
      case "Quarterly":
        return Math.round((volumesMonthly / 3) * 100) / 100;
      case "Annual":
        return Math.round((volumesMonthly / 12) * 100) / 100;
      default:
        return volumesMonthly;
    }
  };

  // Helper: Calculate volumesMonthly from volume per frequency
  const calculateVolumesMonthlyFromFrequency = (volumesPerFrequency: number, frequency: string): number => {
    switch (frequency) {
      case "Daily":
        return Math.round(volumesPerFrequency * 30);
      case "Weekly":
        return Math.round(volumesPerFrequency * 4);
      case "Fortnightly":
        return Math.round(volumesPerFrequency * 2);
      case "Monthly":
        return Math.round(volumesPerFrequency);
      case "Quarterly":
        return Math.round(volumesPerFrequency * 3);
      case "Annual":
        return Math.round(volumesPerFrequency * 12);
      default:
        return Math.round(volumesPerFrequency);
    }
  };

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
  const [hoursExceeded, setHoursExceeded] = useState(false);

  useEffect(() => {
    const monthlyLimit = employee.maxMonthlyHours || 160;
    setHoursExceeded(totalHours > monthlyLimit);
  }, [totalHours, employee.maxMonthlyHours]);

  const isStepValid = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every(row => {
      const hasTime = Number(row.volumesMonthly) > 0 && Number(row.timePerTransactionMinutes) > 0;
      const hasDescription = row.subProcess?.trim();
      
      if (row.activityCategory === 'support') {
        return hasTime && hasDescription;
      }
      
      // Core rows need all taxonomy fields (major and process are now hidden, so we just check what's visible)
      return (
        hasTime && 
        hasDescription &&
        row.frequency?.trim()
      );
    });
  }, [rows]);

  const handleNext = () => {
    if (!isStepValid) {
      setValidationError("Please ensure all rows have Subprocess/Activity, Frequency, and Time Taken > 0.");
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
        
        // Handle volumesPerFrequency input (for Daily frequency)
        if (field === "volumesPerFrequency") {
          const vol = Number(value) || 0;
          nextRow.volumesPerFrequency = vol;
          nextRow.volumesMonthly = calculateVolumesMonthlyFromFrequency(vol, nextRow.frequency);
        }
        
        // Auto-calculate hours if volume or time per trans changed
        if (field === "volumesMonthly" || field === "timePerTransactionMinutes") {
          const vol = Number(nextRow.volumesMonthly) || 0;
          const min = Number(nextRow.timePerTransactionMinutes) || 0;
          nextRow.timeTakenHoursPerMonth = ((vol * min) / 60) || 0;
        }
        
        // When frequency changes, recalculate volumesPerFrequency
        if (field === "frequency") {
          const newFreq = String(value);
          const perFreq = calculateVolumesPerFrequency(nextRow.volumesMonthly, newFreq);
          nextRow.volumesPerFrequency = perFreq;
        }
        
        return nextRow;
      })
    );
  };

  const triggerAddRow = () => {
    if (onAddRowRequest) onAddRowRequest();
  };

  const addSupportRow = () => {
    setRows((prev) => [
      ...prev,
      {
        activityCategory: "support",
        majorProcess: "Additional Activities",
        process: "Support Activity",
        subProcess: "",
        frequency: "Monthly",
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
    if (config.field === 'subProcess') {
      setActiveTab('existing');
      setSearchQuery('');
    }
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

  const handleQuickPickClick = (item: string) => {
    if (!editor) return;
    if (activeTab === 'existing') {
      const match = allSubProcesses.find(sp => sp.subProcess === item);
      if (match) {
        updateRow(editor.rowIndex, "majorProcess", match.majorProcess);
        updateRow(editor.rowIndex, "process", match.process);
        updateRow(editor.rowIndex, "subProcess", match.subProcess);
        setEditor(null);
        setMapSuggestion(null);
      } else {
        setEditorDraft(item);
      }
    } else {
      setEditorDraft(item);
    }
  };

  const triggerMapping = async (text: string) => {
    if (!text.trim()) return;
    setIsMapping(true);
    setMapSuggestion(null);
    try {
      const res = await apiFetch('/taxonomy/map', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data.mapped) setMapSuggestion(data);
      }
    } catch (err) {
      console.error('Failed to map activity:', err);
    } finally {
      setIsMapping(false);
    }
  };

  const applyMapping = (specificSuggestion: any = null, specificConfidence: number | null = null) => {
    if (!editor || !mapSuggestion) return;
    
    // Handle React event if called directly via onClick={applyMapping}
    const target = (specificSuggestion && !specificSuggestion.nativeEvent) ? specificSuggestion : mapSuggestion.suggestion;
    const targetConfidence = (specificConfidence !== null && typeof specificConfidence === 'number') ? specificConfidence : mapSuggestion.confidence;

    // Auto-fill related fields in the same row
    if (target.majorProcess) {
       updateRow(editor.rowIndex, "majorProcess", target.majorProcess);
    }
    if (target.process) {
       updateRow(editor.rowIndex, "process", target.process);
    }
    
    // Update the custom text to the mapped suggestion to keep it standardized
    setEditorDraft(target.subProcess);
    
    // Set AI Mapping Flags (must update them sequentially via setRows manually to ensure we catch all at once)
    setRows(prev => prev.map((r, idx) => idx === editor.rowIndex ? {
        ...r,
        isAiMapped: true,
        aiConfidence: targetConfidence,
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
          {console.log("Rows passed to table:", rows)}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-7xl">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] font-semibold text-slate-500 tracking-[0.18em] uppercase border-y border-slate-200">
                  <th className="py-3 px-3 w-36">
                    <span className="inline-flex items-center gap-1">
                      <Lock size={10} className="text-slate-400" />
                      Major Process
                    </span>
                  </th>
                  <th className="py-3 px-3 w-36">
                    <span className="inline-flex items-center gap-1">
                      <Lock size={10} className="text-slate-400" />
                      Process
                    </span>
                  </th>
                  <th className="py-3 px-3 w-[22%]">Subprocess/Activity*</th>
                  <th className="py-3 px-3 w-32">
                    <HeaderWithTooltip
                      title="Frequency"
                      required
                      tooltip="Represents how frequently the activity / sub process is carried out."
                    />
                  </th>
                  <th className="py-3 px-3 text-center w-28">
                    <HeaderWithTooltip
                      title="Vol"
                      required
                      centered
                      tooltip="Enter the volume for the selected frequency. The system automatically converts it into Monthly Volume for calculations."
                    />
                  </th>
                  <th className="py-3 px-3 text-center w-28">
                    <HeaderWithTooltip
                      title="Vol/Mo"
                      required
                      centered
                      tooltip="Auto-calculated monthly volume based on the frequency and volume entered."
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
                  <th className="py-3 px-3 w-[14%]">
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
                    {/* Read-only Major Process column — set from Step 2 */}
                    <td className="py-3 px-2">
                      <div className="w-full min-h-11 rounded border border-slate-200 bg-blue-50/40 px-3 py-2 text-left text-sm">
                        <span className="block truncate text-sm font-medium text-blue-800">
                          {(() => { console.log("Rendering row:", row); return row.majorProcess || <span className="text-slate-400 italic">—</span>; })()}
                        </span>

                      </div>
                    </td>
                    {/* Read-only Process column — set from Step 2 */}
                    <td className="py-3 px-2">
                      <div className="w-full min-h-11 rounded border border-slate-200 bg-blue-50/40 px-3 py-2 text-left text-sm">
                        <span className="block truncate text-sm font-medium text-blue-800">
                          {row.process || <span className="text-slate-400 italic">—</span>}
                        </span>
                      </div>
                    </td>
                    {/* Read-only Sub Process column — set from Step 2 */}
                    <td className="py-3 px-2">
                      <div className="w-full min-h-11 rounded border border-slate-200 bg-blue-50/40 px-3 py-2 text-left text-sm">
                        <span className="block truncate text-sm font-medium text-blue-800">
                          {row.subProcess || <span className="text-slate-400 italic">—</span>}
                        </span>
                      </div>
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
                      <button
                        type="button"
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "volumesPerFrequency",
                            label: "Volume",
                            description: `Enter volume per ${row.frequency.toLowerCase()}. This will be auto-converted to monthly volume.`,
                            kind: "number",
                            placeholder: "e.g. 10",
                          })
                        }
                        className="w-full min-h-11 rounded border border-blue-200 bg-blue-50/40 px-3 py-2 hover:border-blue-300 hover:bg-white transition-colors"
                      >
                        <span className="text-sm font-bold text-blue-800 tabular-nums">
                          {row.volumesPerFrequency !== undefined ? Number(row.volumesPerFrequency).toFixed(1) : "0"}
                        </span>
                      </button>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <div className="w-full min-h-11 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-sm font-bold text-slate-700 tabular-nums">
                          {Number(row.volumesMonthly || 0)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <CellPreview
                        value={row.timePerTransactionMinutes !== undefined && row.timePerTransactionMinutes !== null ? String(row.timePerTransactionMinutes) : "0"}
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
                        {(((Number(row.volumesMonthly) || 0) * (Number(row.timePerTransactionMinutes) || 0)) / 60).toFixed(1)}h
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
                {coreEntries.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                          <Plus size={22} className="text-blue-400" />
                        </div>
                        <p className="text-sm font-semibold text-slate-600">No process entries yet</p>
                        <p className="text-xs text-slate-400">Go back to Step 2 to select a process and add your first entry.</p>
                        {onAddRowRequest && (
                          <button
                            type="button"
                            onClick={onAddRowRequest}
                            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                          >
                            <Plus size={14} /> Select a Process
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

          <div className="mt-5 flex justify-start">
            <button
              type="button"
              onClick={triggerAddRow}
              disabled={hoursExceeded}
              className="text-blue-700 font-semibold text-sm bg-white border border-slate-300 py-2.5 px-5 rounded-md hover:border-blue-600 hover:text-blue-800 transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-300 disabled:hover:text-blue-700"
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
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">Additional Activities</h3>
                <p className="text-sm text-slate-500">These entries will appear as Support Activities in the Review step.</p>
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
                        placeholder="Enter additional activity description"
                        onClick={() =>
                          openEditor({
                            rowIndex,
                            field: "subProcess",
                            label: "Activity Description",
                            description: "Describe the support activity in detail.",
                            kind: "multi",
                            placeholder: "Enter additional activity description",
                            suggestions: getSubProcessSuggestions(rowIndex),
                          })
                        }
                      />
                    </td>
                    <td className="py-3 px-2 text-center">
                      <CellPreview
                        value={row.volumesMonthly !== undefined && row.volumesMonthly !== null ? String(row.volumesMonthly) : "0"}
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
                        value={row.timePerTransactionMinutes !== undefined && row.timePerTransactionMinutes !== null ? String(row.timePerTransactionMinutes) : "0"}
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
                        {(((Number(row.volumesMonthly) || 0) * (Number(row.timePerTransactionMinutes) || 0)) / 60).toFixed(1)}h
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
                    <td colSpan={5} className="py-6 text-center text-slate-500">No additional activities added yet.</td>
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
              <Plus size={16} /> Add Additional Activity
            </button>
          </div>
        </div>

        {validationError && (
          <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm font-medium animate-in fade-in slide-in-from-top-1">
            {validationError}
          </div>
        )}

        <div className="mt-7 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-8">
          <button
            type="button"
            onClick={onPrev}
            className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-2 group"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> Back
          </button>

          {/* Live Total Summary - Footer Integration */}
          <div className="flex-1 max-w-lg mx-auto w-full px-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-bold tabular-nums ${(totalHours || 0) > (employee.maxMonthlyHours || 160) ? 'text-red-600' : 'text-blue-800'}`}>
                    {(totalHours || 0).toFixed(1)}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Hours / Mo</span>
                </div>
                <div className="flex flex-col items-end">
                   <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Capacity</span>
                    <span className={`text-xs font-bold ${ ((totalHours || 0) / (employee.maxMonthlyHours || 160)) > 1 ? 'text-red-600' : 'text-slate-700'}`}>
                      {(((totalHours || 0) / (employee.maxMonthlyHours || 160)) * 100).toFixed(0)}%
                    </span>
                   </div>
                   <span className="text-[9px] font-semibold text-slate-400">Max: {employee.maxMonthlyHours || 160}h</span>
                </div>
              </div>

              {/* Progress Bar Strip */}
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200/50">
                <div 
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    (totalHours / (employee.maxMonthlyHours || 160)) > 1 
                      ? 'bg-red-500' 
                      : (totalHours / (employee.maxMonthlyHours || 160)) > 0.8 
                        ? 'bg-amber-500' 
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (totalHours / (employee.maxMonthlyHours || 160)) * 100)}%` }}
                />
              </div>

              {totalHours > (employee.maxMonthlyHours || 160) && (
                <p className="text-[10px] font-bold text-red-600 text-center animate-pulse">
                  ⚠️ Exceeds monthly limit of {employee.maxMonthlyHours || 160}h
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleNext}
            disabled={!isStepValid || hoursExceeded}
            className={`font-bold py-3 px-8 rounded-xl shadow-lg transition-all inline-flex items-center gap-2 group ${
              isStepValid && !hoursExceeded
                ? "bg-blue-700 hover:bg-blue-800 text-white hover:translate-y-[-1px] active:translate-y-[1px]" 
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            Next: Review <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>



      {editor &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-120 bg-slate-900/45 p-4 flex items-center justify-center">
            <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[82vh] overflow-y-auto">
              <div className="px-6 py-5 border-b border-slate-100 bg-linear-to-r from-blue-50 to-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Expanded field editor</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-900">{editor.label}</h3>
                <p className="mt-1 text-sm text-slate-600">{editor.description}</p>
              </div>

              <div className="px-6 py-6 space-y-4">
                {editor.kind === "multi" ? (
                  <div className="space-y-4">
                    {/* Activity Description always uses custom entry */}
                      <>
                        <textarea
                          value={editorDraft}
                          onChange={(event) => setEditorDraft(event.target.value)}
                          placeholder={editor.placeholder}
                          className="w-full min-h-44 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        {editor.field === "subProcess" && (
                          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 mt-4">
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
                               mapSuggestion.noMatch ? (
                                 <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200/70 p-3 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                                   <div className="flex gap-2.5">
                                     <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                                     <div className="flex-1">
                                       <div className="flex justify-between items-start">
                                         <h5 className="text-xs font-semibold text-amber-900">No exact matches found (HR & Finance only)</h5>
                                         <button
                                           type="button"
                                           onClick={() => setMapSuggestion(null)}
                                           className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 transition-colors"
                                         >
                                           Dismiss
                                         </button>
                                       </div>
                                       
                                       {mapSuggestion.suggestion && (
                                         <div className="mt-2.5 pt-2.5 border-t border-amber-200/40">
                                           <span className="text-[9px] font-bold uppercase tracking-wider text-amber-800/80 block mb-1">Closest Suggestion:</span>
                                           <div className="rounded border border-amber-200/60 bg-white/80 p-2">
                                             <div className="text-xs font-semibold text-slate-800">
                                               {mapSuggestion.suggestion.majorProcess} <span className="text-slate-400 mx-0.5">/</span> {mapSuggestion.suggestion.process}
                                             </div>
                                             <div className="text-xs text-slate-600 mt-0.5 font-medium">
                                               {mapSuggestion.suggestion.subProcess}
                                             </div>
                                             <div className="mt-2 flex gap-1.5 justify-end">
                                               <button
                                                 type="button"
                                                 onClick={() => applyMapping()}
                                                 className="rounded bg-amber-600 hover:bg-amber-700 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors"
                                               >
                                                 Accept Suggestion
                                               </button>
                                               <button
                                                 type="button"
                                                 onClick={() => setMapSuggestion(null)}
                                                 className="rounded bg-white border border-slate-200 hover:bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition-colors"
                                               >
                                                 Keep Custom
                                               </button>
                                             </div>
                                           </div>
                                         </div>
                                       )}
                                     </div>
                                   </div>
                                 </div>
                               ) : (
                                 <div className="mt-3 rounded-lg bg-white border border-blue-100 shadow-sm animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                     <div className="p-3 bg-blue-50/30">
                                       <div className="flex justify-between items-start mb-2">
                                         <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Top Suggested Match</span>
                                         <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                           mapSuggestion.confidence >= 70 
                                             ? 'bg-emerald-100 text-emerald-700' 
                                             : mapSuggestion.confidence >= 35 
                                               ? 'bg-amber-100 text-amber-700' 
                                               : 'bg-slate-100 text-slate-600'
                                         }`}>
                                           {mapSuggestion.confidence >= 35 
                                             ? `${mapSuggestion.confidence}% Confidence` 
                                             : `Closest Match (${mapSuggestion.confidence}%)`
                                           }
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
                                           onClick={() => applyMapping()}
                                           className="flex-1 rounded border border-blue-200 bg-blue-50 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                                         >
                                           Accept Top Match
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
                                     
                                     {mapSuggestion.alternatives && mapSuggestion.alternatives.length > 0 && (
                                       <div className="border-t border-blue-100 p-3 bg-slate-50/50">
                                         <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 block">Other Possible Matches</span>
                                         <div className="space-y-2">
                                           {mapSuggestion.alternatives.map((alt: any, idx: number) => (
                                             <div key={idx} className="flex items-center justify-between gap-3 text-xs p-2 rounded-md hover:bg-white border border-transparent hover:border-slate-200 transition-colors">
                                               <div>
                                                 <div className="font-semibold text-slate-700">{alt.subProcess}</div>
                                                 <div className="text-slate-400 mt-0.5">{alt.majorProcess} / {alt.process}</div>
                                               </div>
                                               <div className="flex items-center gap-2">
                                                 <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                                                   alt.confidence >= 70 
                                                     ? 'bg-emerald-50 text-emerald-600' 
                                                     : alt.confidence >= 35 
                                                       ? 'bg-amber-50 text-amber-600' 
                                                       : 'bg-slate-100 text-slate-500'
                                                 }`}>
                                                   {alt.confidence}%
                                                 </span>
                                                 <button
                                                   type="button"
                                                   onClick={() => applyMapping(alt, alt.confidence)}
                                                   className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1 bg-white"
                                                 >
                                                   Accept
                                                 </button>
                                               </div>
                                             </div>
                                           ))}
                                         </div>
                                       </div>
                                     )}
                                 </div>
                               )
                             )}
                          </div>
                        )}
                      </>
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
                          onClick={() => handleQuickPickClick(item)}
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