import React, { useState, useEffect } from "react";
import { Search, ChevronRight, Check, Sparkles, X } from "lucide-react";
import { apiFetch } from "../../lib/api";
import type { ProcessSelection } from "./formTypes";

interface ProcessSelectionPanelProps {
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
}: {
  items: string[];
  selected: string[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (item: string) => void;
  searchPlaceholder: string;
  isLoading: boolean;
  extraPill?: React.ReactNode;
}) {
  const filtered = items.filter((item) =>
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
  onSelectionComplete,
  initialSelection,
  hideAdditionalActivities = false,
}: ProcessSelectionPanelProps) {
  const [stage, setStage] = useState<SelectionStage>("major");

  const [majorProcesses, setMajorProcesses] = useState<string[]>([]);
  const [processes, setProcesses] = useState<string[]>([]);
  const [subProcesses, setSubProcesses] = useState<string[]>([]);

  const [selectedMajors, setSelectedMajors] = useState<string[]>([]);
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
  const [selectedSubProcesses, setSelectedSubProcesses] = useState<string[]>([]);
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
        const res = await apiFetch("/taxonomy/major-processes");
        if (res.ok) {
          const data = await res.json();
          setMajorProcesses(data || []);
        }
      } catch (e) {
        console.error("Failed to load major processes", e);
      } finally {
        setLoadingMajor(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!initialSelection) return;
    const initialList = Array.isArray(initialSelection) ? initialSelection : [initialSelection];
    setCompletedSelections(initialList);
  }, [initialSelection]);

  // Load processes when majors are selected
  useEffect(() => {
    if (selectedMajors.length === 0 || stage !== "process") return;
    setLoadingProcess(true);
    setProcesses([]);
    setSelectedProcesses([]);

    async function load() {
      try {
        // Load processes for each selected major and merge
        const allProcesses = new Set<string>();
        for (const major of selectedMajors) {
          const res = await apiFetch(
            `/taxonomy/processes-by-major?major=${encodeURIComponent(major)}`
          );
          if (res.ok) {
            const data = await res.json();
            (data || []).forEach((p: string) => allProcesses.add(p));
          }
        }
        setProcesses(Array.from(allProcesses).sort());
      } catch (e) {
        console.error("Failed to load processes", e);
      } finally {
        setLoadingProcess(false);
      }
    }
    load();
  }, [selectedMajors, stage]);

  // Load sub-processes when processes are selected
  useEffect(() => {
    if (selectedProcesses.length === 0 || stage !== "subprocess") return;
    setLoadingSub(true);
    setSubProcesses([]);
    setSelectedSubProcesses([]);

    async function load() {
      try {
        // Load subprocesses for each combination of major and selected processes
        const allSubProcesses = new Set<string>();
        for (const major of selectedMajors) {
          for (const process of selectedProcesses) {
            const res = await apiFetch(
              `/taxonomy/subprocesses-by-process?major=${encodeURIComponent(major)}&process=${encodeURIComponent(process)}`
            );
            if (res.ok) {
              const data = await res.json();
              (data || []).forEach((sp: string) => allSubProcesses.add(sp));
            }
          }
        }
        setSubProcesses(Array.from(allSubProcesses).sort());
      } catch (e) {
        console.error("Failed to load sub-processes", e);
      } finally {
        setLoadingSub(false);
      }
    }
    load();
  }, [selectedMajors, selectedProcesses, stage]);

  const handleSelectMajor = (item: string) => {
    setSelectedMajors((prev) =>
      prev.includes(item) ? prev.filter((m) => m !== item) : [...prev, item]
    );
  };

  const handleProceedToProcess = () => {
    if (selectedMajors.length === 0) return;
    setStage("process");
    setProcessSearch("");
  };

  const handleSelectProcess = (item: string) => {
    setSelectedProcesses((prev) =>
      prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]
    );
  };

  const handleProceedToSubProcess = () => {
    if (selectedProcesses.length === 0) return;
    setStage("subprocess");
    setSubSearch("");
  };

  const handleSelectSubProcess = (item: string) => {
    setSelectedSubProcesses((prev) =>
      prev.includes(item) ? prev.filter((sp) => sp !== item) : [...prev, item]
    );
  };

  const handleAddSelections = () => {
    if (selectedSubProcesses.length === 0) return;

    // Create a selection for each combination
    const newSelections = selectedMajors.flatMap((major) =>
      selectedProcesses.flatMap((process) =>
        selectedSubProcesses.map((subprocess) => ({
          majorProcess: major,
          process,
          subProcess: subprocess,
          isMiscellaneous: false,
        }))
      )
    );

    setCompletedSelections((prev) => {
      const combined = [...prev, ...newSelections];
      // Remove duplicates
      const seen = new Set<string>();
      return combined.filter((sel) => {
        const key = `${sel.majorProcess}|${sel.process}|${sel.subProcess}|${sel.isMiscellaneous}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

    // Reset for next selection
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
    onSelectionComplete(completedSelections);
  };

  const handleAdditionalActivities = () => {
    onSelectionComplete([
      {
        majorProcess: "",
        process: "",
        subProcess: "",
        isMiscellaneous: true,
      },
    ]);
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 flex items-start justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {selection.majorProcess || "Additional Activities"}
                  </p>
                  {!selection.isMiscellaneous && (
                    <p className="text-xs text-slate-500">
                      {selection.process} / {selection.subProcess}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSelection(selection)}
                  className="rounded-full border border-slate-200 bg-slate-50 p-1 text-slate-500 hover:border-red-300 hover:text-red-600 transition-colors"
                  aria-label="Remove selection"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage 1: Select Multiple Major Processes */}
      {stage === "major" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              1
            </span>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Select Major Processes (Multiple)
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
              Select Processes
            </button>
          )}
        </div>
      )}

      {/* Stage 2: Select Multiple Processes */}
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
              Select Processes (Multiple)
            </h3>
          </div>
          <SelectionBadgeStrip label="From majors" items={selectedMajors} />
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
              Select Sub-Processes
            </button>
          )}
        </div>
      )}

      {/* Stage 3: Select Multiple Sub-Processes */}
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
              Select Sub-Processes / Activities (Multiple)
            </h3>
          </div>
          <SelectionBadgeStrip label="From processes" items={selectedProcesses} />
          <MultiSelectPillGrid
            items={subProcesses}
            selected={selectedSubProcesses}
            searchQuery={subSearch}
            onSearchChange={setSubSearch}
            onSelect={handleSelectSubProcess}
            searchPlaceholder="Search sub-processes..."
            isLoading={loadingSub}
          />
          {subProcesses.length === 0 && !loadingSub && (
            <p className="text-xs text-slate-500 mt-1">
              No sub-processes found. You can proceed to enter details manually.
            </p>
          )}
          {selectedSubProcesses.length > 0 && <SelectionBadgeStrip label="Selected" items={selectedSubProcesses} />}
          {selectedSubProcesses.length > 0 && (
            <button
              type="button"
              onClick={handleAddSelections}
              className="mt-3 w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              Add to List
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
