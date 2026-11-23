import React, { useState, useEffect } from "react";
import { Search, ChevronRight, Check, Sparkles, X } from "lucide-react";
import { apiFetch } from "../../lib/api";
import type { ProcessSelection } from "./formTypes";

interface ProcessSelectionPanelProps {
  department?: string;
  existingSubProcesses?: string[];
  onSelectionComplete: (selection: ProcessSelection[]) => void;
  initialSelection?: ProcessSelection | ProcessSelection[] | null;
  hideAdditionalActivities?: boolean;
}

type SelectionStage = "major" | "process" | "subprocess" | "review";

// ... [rest of the file remains same, we will update the component definition below] ...

function MultiSelectPillGrid({
  items,
  selected,
  searchQuery,
  onSearchChange,
  onSelect,
  searchPlaceholder,
  isLoading,
  extraPill,
  renderItem,
}: {
  items: string[];
  selected: string[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (item: string) => void;
  searchPlaceholder: string;
  isLoading: boolean;
  extraPill?: React.ReactNode;
  renderItem?: (item: string, isSelected: boolean) => React.ReactNode;
}) {
  const filtered = items.filter(
    (item) =>
      !/^[0-9.\s]+$/.test(String(item).trim()) &&
      item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
        />
      </div>

      {/* Pills */}
      {isLoading ? (
        <div className="flex flex-wrap gap-2 py-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-9 w-36 rounded-full bg-slate-100 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 py-1 max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">
              No results for "{searchQuery}"
            </p>
          ) : (
            filtered.map((item) => {
              const isSelected = selected.includes(item);
              if (renderItem) {
                return renderItem(item, isSelected);
              }
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => onSelect(item)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-150 ${
                    isSelected
                      ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-200"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                >
                  {isSelected && <Check size={13} />}
                  {item}
                </button>
              );
            })
          )}
          {extraPill}
        </div>
      )}
    </div>
  );
}

function SelectionBadgeStrip({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2">
      <span className="text-xs font-semibold uppercase text-blue-700 mr-2">{label}:</span>
      <span className="inline-flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
            {item}
          </span>
        ))}
      </span>
    </div>
  );
}

export function ProcessSelectionPanel({
  department,
  existingSubProcesses = [],
  onSelectionComplete,
  initialSelection,
  hideAdditionalActivities = false,
}: ProcessSelectionPanelProps) {
  const [stage, setStage] = useState<SelectionStage>("major");

  const [majorProcesses, setMajorProcesses] = useState<string[]>([]);
  const [processes, setProcesses] = useState<string[]>([]);
  const [subProcesses, setSubProcesses] = useState<string[]>([]);

  const [selectedMajors, setSelectedMajors] = useState<string[]>([]);
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]); // format: "Major / Process"
  const [selectedSubProcesses, setSelectedSubProcesses] = useState<string[]>([]); // JSON string of {majorProcess, process, subProcess}
  const [completedSelections, setCompletedSelections] = useState<ProcessSelection[]>([]);

  const [majorSearch, setMajorSearch] = useState("");
  const [processSearch, setProcessSearch] = useState("");
  const [subSearch, setSubSearch] = useState("");

  const [loadingMajor, setLoadingMajor] = useState(true);
  const [loadingProcess, setLoadingProcess] = useState(false);
  const [loadingSub, setLoadingSub] = useState(false);

  // Load major processes on mount
  useEffect(() => {
    async function load() {
      setLoadingMajor(true);
      try {
        const queryParams = department ? `?department=${encodeURIComponent(department)}` : "";
        const res = await apiFetch(`/taxonomy/major-processes${queryParams}`);
        if (res.ok) {
          const data = await res.json();
          setMajorProcesses(
            (data || []).filter((m: string) => !/^[0-9.\s]+$/.test(String(m).trim()))
          );
        }
      } catch (e) {
        console.error("Failed to load major processes", e);
      } finally {
        setLoadingMajor(false);
      }
    }
    load();
  }, [department]);

  useEffect(() => {
    if (!initialSelection) return;
    const initialList = Array.isArray(initialSelection) ? initialSelection : [initialSelection];
    setCompletedSelections(initialList);
  }, [initialSelection]);

  // Load processes when majors are selected
  useEffect(() => {
    if (stage !== "process" || selectedMajors.length === 0) return;
    setLoadingProcess(true);
    setProcesses([]);
    setSelectedProcesses([]);

    async function load() {
      try {
        const queryParams = department ? `&department=${encodeURIComponent(department)}` : "";
        const lists = await Promise.all(
          selectedMajors.map((maj) =>
            apiFetch(`/taxonomy/processes-by-major?major=${encodeURIComponent(maj)}${queryParams}`).then((r) =>
              r.ok ? r.json().catch(() => []) : []
            )
          )
        );

        const merged: string[] = [];
        selectedMajors.forEach((maj, idx) => {
          const procs = lists[idx] || [];
          procs.forEach((p) => {
            if (/^[0-9.\s]+$/.test(String(p).trim())) return;
            merged.push(`${maj} / ${p}`);
          });
        });

        const uniq = Array.from(new Set(merged)).sort();
        setProcesses(uniq);
      } catch (e) {
        console.error("Failed to load processes", e);
      } finally {
        setLoadingProcess(false);
      }
    }
    load();
  }, [selectedMajors, stage, department]);

  // Load sub-processes when a process is selected
  useEffect(() => {
    if (stage !== "subprocess" || selectedProcesses.length === 0) return;
    setLoadingSub(true);
    setSubProcesses([]);
    setSelectedSubProcesses([]);

    async function load() {
      try {
        const queryParams = department ? `&department=${encodeURIComponent(department)}` : "";
        const lists = await Promise.all(
          selectedProcesses.map((procStr) => {
            const [maj, proc] = procStr.split(" / ").map((s) => s.trim());
            return apiFetch(`/taxonomy/subprocesses-by-process?major=${encodeURIComponent(maj)}&process=${encodeURIComponent(proc)}${queryParams}`)
              .then((r) => (r.ok ? r.json().catch(() => []) : []))
              .then((subs) => ({ major: maj, process: proc, subs: subs || [] }));
          })
        );

        const items: string[] = [];
        lists.forEach((entry) => {
          (entry.subs || []).forEach((s: string) => {
            if (/^[0-9.\s]+$/.test(String(s).trim())) return;
            if ((existingSubProcesses || []).includes(s)) return;
            const obj = { majorProcess: entry.major, process: entry.process, subProcess: s };
            items.push(JSON.stringify(obj));
          });
        });

        // Show label as "Process / SubProcess" in pills; MultiSelectPillGrid expects strings, so we store JSON but display pretty labels via mapping below
        setSubProcesses(items);
      } catch (e) {
        console.error("Failed to load sub-processes", e);
      } finally {
        setLoadingSub(false);
      }
    }
    load();
  }, [selectedProcesses, stage, existingSubProcesses, department]);

  // subProcesses are stored as stable JSON strings: { majorProcess, process, subProcess }
  // We must not derive selection from UI label strings; that breaks parent mapping when duplicates exist.
  const subItems = React.useMemo(() => subProcesses, [subProcesses]);

  const getSubLabel = (jsonString: string) => {
    try {
      const obj = JSON.parse(jsonString);
      return `${obj.majorProcess} → ${obj.process} → ${obj.subProcess}`;
    } catch {
      return jsonString;
    }
  };

  const handleSelectMajor = (item: string) => {
    setSelectedMajors((prev) => {
      const exists = prev.includes(item);
      const nextMajors = exists ? prev.filter((p) => p !== item) : [...prev, item];

      // Prune downstream selections whose parent major is no longer selected
      setSelectedProcesses((prevProcs) =>
        prevProcs.filter((procStr) => {
          const [maj] = procStr.split(" / ").map((s) => s.trim());
          return nextMajors.includes(maj);
        })
      );

      setSelectedSubProcesses((prevSubs) =>
        prevSubs.filter((subJson) => {
          try {
            const parsed = JSON.parse(subJson);
            return nextMajors.includes(parsed.majorProcess);
          } catch {
            return false;
          }
        })
      );

      return nextMajors;
    });
  };

  const handleProceedToProcess = () => {
    if (selectedMajors.length === 0) return;
    setStage("process");
    setProcessSearch("");
  };

  const handleSelectProcess = (item: string) => {
    setSelectedProcesses((prev) => {
      const exists = prev.includes(item);
      const nextProcs = exists ? prev.filter((p) => p !== item) : [...prev, item];

      // Prune downstream sub-processes whose parent process is no longer selected
      const allowedCombos = new Set(nextProcs);
      setSelectedSubProcesses((prevSubs) =>
        prevSubs.filter((subJson) => {
          try {
            const parsed = JSON.parse(subJson);
            return allowedCombos.has(`${parsed.majorProcess} / ${parsed.process}`);
          } catch {
            return false;
          }
        })
      );

      return nextProcs;
    });
  };

  const handleProceedToSubProcess = () => {
    if (selectedProcesses.length === 0) return;
    setStage("subprocess");
    setSubSearch("");
  };

  const handleSelectSubProcess = (item: string) => {
    // item is JSON string representing {majorProcess,process,subProcess}
    setSelectedSubProcesses((prev) => {
      const exists = prev.includes(item);
      if (exists) return prev.filter((p) => p !== item);
      return [...prev, item];
    });
  };

  const handleAddSelections = () => {
    if (selectedSubProcesses.length === 0) return;

    const parsed: ProcessSelection[] = selectedSubProcesses.map((s) => JSON.parse(s));

    setCompletedSelections((prev) => {
      const next = [...prev];
      parsed.forEach((newSelection) => {
        const key = `${newSelection.majorProcess}|${newSelection.process}|${newSelection.subProcess}|${newSelection.isMiscellaneous}`;
        const alreadyExists = next.some(
          (sel) => `${sel.majorProcess}|${sel.process}|${sel.subProcess}|${sel.isMiscellaneous}` === key
        );
        if (!alreadyExists) next.push({ ...newSelection, isMiscellaneous: false });
      });
      return next;
    });

    console.debug("DEBUG_PANEL: emitting selection (add):", JSON.stringify(parsed), "completedBeforeEmit:", JSON.stringify(completedSelections));
    onSelectionComplete(parsed);

    // reset to start for next add
    setSelectedMajors([]);
    setSelectedProcesses([]);
    setSelectedSubProcesses([]);
    setStage("major");
    setMajorSearch("");
    setProcessSearch("");
    setSubSearch("");
  };

  const handleFinishSelection = () => {
    if (completedSelections.length === 0) return;
    console.debug("DEBUG_PANEL: emitting selection (finish):", JSON.stringify(completedSelections));
    onSelectionComplete(completedSelections);
  };

  const handleAdditionalActivities = () => {
    const misc: ProcessSelection = {
      majorProcess: "",
      process: "",
      subProcess: "",
      isMiscellaneous: true,
    };
    console.debug("DEBUG_PANEL: emitting additional activities selection:", JSON.stringify(misc));
    onSelectionComplete([misc]);
  };

  const handleRemoveSelection = (selection: ProcessSelection) => {
    setCompletedSelections((prev) =>
      prev.filter(
        (existing) =>
          !(
            existing.majorProcess === selection.majorProcess &&
            existing.process === selection.process &&
            existing.subProcess === selection.subProcess &&
            existing.isMiscellaneous === selection.isMiscellaneous
          )
      )
    );
  };

  const additionalActivitiesPill = (
    <button
      key="__additional__"
      type="button"
      onClick={handleAdditionalActivities}
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-500 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600 transition-all duration-150"
    >
      <Sparkles size={13} />
      Additional Activities
    </button>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Completed Selections Summary */}
      {completedSelections.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Selected combinations</p>
              <p className="text-xs text-slate-500">
                {completedSelections.length} combination(s) added. Continue adding or finish.
              </p>
            </div>
            <button
              type="button"
                onClick={() => {
                  setSelectedMajors([]);
                  setSelectedProcesses([]);
                  setSelectedSubProcesses([]);
                  setStage("major");
                  setMajorSearch("");
                  setProcessSearch("");
                  setSubSearch("");
                }}
              className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
            >
              Add another process
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {completedSelections.map((selection, index) => (
              <div
                key={`${selection.majorProcess}-${selection.process}-${selection.subProcess}-${index}`}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-start justify-between gap-3 shadow-2xs"
              >
                <div className="min-w-0 flex-1">
                  {selection.isMiscellaneous ? (
                    <div>
                      <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                        Additional Activity
                      </span>
                      <p className="text-xs font-semibold text-slate-800 mt-1">
                        {selection.subProcess || 'Custom Activity'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-0.5 flex-wrap">
                        <span className="font-semibold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                          {selection.majorProcess}
                        </span>
                        <ChevronRight size={11} className="text-slate-400 shrink-0" />
                        <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                          {selection.process}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs font-bold text-slate-900">
                          {selection.subProcess}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSelection(selection)}
                  className="rounded-full border border-slate-200 bg-slate-50 p-1 text-slate-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0 mt-0.5"
                  aria-label="Remove selection"
                  title="Remove from selection"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage 1: Select One Major Process */}
      {stage === "major" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              1
            </span>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Select a Major Process
            </h3>
          </div>
          <MultiSelectPillGrid
            items={majorProcesses}
            selected={selectedMajors}
            searchQuery={majorSearch}
            onSearchChange={setMajorSearch}
            onSelect={handleSelectMajor}
            searchPlaceholder="Search major processes..."
            isLoading={loadingMajor}
            extraPill={hideAdditionalActivities ? undefined : additionalActivitiesPill}
          />
          {selectedMajors.length > 0 && <SelectionBadgeStrip label="Selected" items={selectedMajors} />}
          {selectedMajors.length > 0 && (
            <button
              type="button"
              onClick={handleProceedToProcess}
              className="mt-3 w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Choose a Process
            </button>
          )}
        </div>
      )}

      {/* Stage 2: Select One Process */}
      {stage === "process" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <button
            type="button"
            onClick={() => {
              setStage("major");
              setSelectedProcesses([]);
            }}
            className="text-sm font-semibold text-slate-500 hover:text-slate-700 mb-2"
          >
            ← Back to Major Selection
          </button>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              2
            </span>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Select a Process
            </h3>
          </div>
          <SelectionBadgeStrip label="Major Process" items={selectedMajors.length ? selectedMajors : []} />
          <MultiSelectPillGrid
            items={processes}
            selected={selectedProcesses}
            searchQuery={processSearch}
            onSearchChange={setProcessSearch}
            onSelect={handleSelectProcess}
            searchPlaceholder="Search processes..."
            isLoading={loadingProcess}
          />
          {selectedProcesses.length > 0 && <SelectionBadgeStrip label="Selected" items={selectedProcesses} />}
          {selectedProcesses.length > 0 && (
            <button
              type="button"
              onClick={handleProceedToSubProcess}
              className="mt-3 w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Choose a Sub-Process
            </button>
          )}
        </div>
      )}

      {/* Stage 3: Select One Sub-Process */}
      {stage === "subprocess" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <button
            type="button"
            onClick={() => {
              setStage("process");
              setSelectedSubProcesses([]);
            }}
            className="text-sm font-semibold text-slate-500 hover:text-slate-700 mb-2"
          >
            ← Back to Process Selection
          </button>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              3
            </span>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Select a Sub-Process
            </h3>
          </div>
          <SelectionBadgeStrip label="Major Process" items={selectedMajors.length ? selectedMajors : []} />
          <SelectionBadgeStrip label="Process" items={selectedProcesses.length ? selectedProcesses : []} />
          <MultiSelectPillGrid
            items={subItems}
            selected={selectedSubProcesses}
            searchQuery={subSearch}
            onSearchChange={setSubSearch}
            onSelect={(jsonItem) => {
              handleSelectSubProcess(jsonItem);
            }}
            searchPlaceholder="Search sub-processes or activities..."
            isLoading={loadingSub}
            extraPill={undefined}
            renderItem={(jsonItem, isSelected) => {
              let parsed = { majorProcess: '', process: '', subProcess: jsonItem };
              try {
                parsed = JSON.parse(jsonItem);
              } catch {}
              return (
                <button
                  key={jsonItem}
                  type="button"
                  onClick={() => handleSelectSubProcess(jsonItem)}
                  className={`flex flex-col text-left rounded-xl border p-2.5 transition-all duration-150 w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.5rem)] ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/70 shadow-sm ring-1 ring-blue-500"
                      : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 line-clamp-2">
                      {parsed.subProcess}
                    </span>
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isSelected && <Check size={10} />}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500 overflow-hidden">
                    <span className="truncate max-w-[45%] font-medium text-slate-600" title={parsed.majorProcess}>
                      {parsed.majorProcess}
                    </span>
                    <ChevronRight size={10} className="shrink-0 text-slate-400" />
                    <span className="truncate max-w-[45%] text-slate-500" title={parsed.process}>
                      {parsed.process}
                    </span>
                  </div>
                </button>
              );
            }}
          />
          {subProcesses.length === 0 && !loadingSub && (
            <p className="text-xs text-slate-500 mt-1">
              No sub-processes found. You can proceed to enter details manually.
            </p>
          )}
          {selectedSubProcesses.length > 0 && (
            <SelectionBadgeStrip
              label="Selected"
              items={selectedSubProcesses.map((s) => getSubLabel(s)).filter(Boolean)}
            />
          )}
          {selectedSubProcesses.length > 0 && (
            <button
              type="button"
              onClick={handleAddSelections}
              className="mt-3 w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              Add Row and Continue
            </button>
          )}
        </div>
      )}

      {/* Finish Button */}
      {completedSelections.length > 0 && (
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleFinishSelection}
            className="inline-flex items-center rounded-full bg-blue-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
          >
            Done with Selection
          </button>
        </div>
      )}
    </div>
  );
}
