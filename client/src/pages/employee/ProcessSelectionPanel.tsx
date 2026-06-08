import React, { useState, useEffect } from "react";
import { Search, ChevronRight, Check, Sparkles, X } from "lucide-react";
import { apiFetch } from "../../lib/api";
import type { ProcessSelection } from "./formTypes";

interface ProcessSelectionPanelProps {
  onSelectionComplete: (selection: ProcessSelection) => void;
  initialSelection?: ProcessSelection | null;
  hideAdditionalActivities?: boolean;
}

type SubStage = "majorProcess" | "process" | "subProcess";

// ... [rest of the file remains same, we will update the component definition below] ...

function PillGrid({
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
  selected: string | null;
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
              const isSelected = selected === item;
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

function SelectedBadge({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2">
      <span className="text-xs font-bold uppercase tracking-wider text-blue-500">
        {label}
      </span>
      <span className="text-sm font-semibold text-blue-800">{value}</span>
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full p-0.5 text-blue-400 hover:bg-blue-200 hover:text-blue-700 transition-colors"
        title="Change selection"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function ProcessSelectionPanel({
  onSelectionComplete,
  initialSelection,
  hideAdditionalActivities = false,
}: ProcessSelectionPanelProps) {
  const [subStage, setSubStage] = useState<SubStage>("majorProcess");

  const [majorProcesses, setMajorProcesses] = useState<string[]>([]);
  const [processes, setProcesses] = useState<string[]>([]);
  const [subProcesses, setSubProcesses] = useState<string[]>([]);

  const [selectedMajor, setSelectedMajor] = useState<string | null>(
    initialSelection?.isMiscellaneous ? null : (initialSelection?.majorProcess || null)
  );
  const [selectedProcess, setSelectedProcess] = useState<string | null>(
    initialSelection?.isMiscellaneous ? null : (initialSelection?.process || null)
  );
  const [selectedSub, setSelectedSub] = useState<string | null>(
    initialSelection?.isMiscellaneous ? null : (initialSelection?.subProcess || null)
  );

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

  // When major process selected, load processes
  useEffect(() => {
    if (!selectedMajor) return;
    setLoadingProcess(true);
    setProcesses([]);
    setSelectedProcess(null);
    setSelectedSub(null);
    async function load() {
      try {
        const res = await apiFetch(
          `/taxonomy/processes-by-major?major=${encodeURIComponent(selectedMajor!)}`
        );
        if (res.ok) {
          const data = await res.json();
          setProcesses(data || []);
        }
      } catch (e) {
        console.error("Failed to load processes", e);
      } finally {
        setLoadingProcess(false);
      }
    }
    load();
  }, [selectedMajor]);

  // When process selected, load sub-processes
  useEffect(() => {
    if (!selectedMajor || !selectedProcess) return;
    setLoadingSub(true);
    setSubProcesses([]);
    setSelectedSub(null);
    async function load() {
      try {
        const res = await apiFetch(
          `/taxonomy/subprocesses-by-process?major=${encodeURIComponent(selectedMajor!)}&process=${encodeURIComponent(selectedProcess!)}`
        );
        if (res.ok) {
          const data = await res.json();
          setSubProcesses(data || []);
        }
      } catch (e) {
        console.error("Failed to load sub-processes", e);
      } finally {
        setLoadingSub(false);
      }
    }
    load();
  }, [selectedMajor, selectedProcess]);

  const handleSelectMajor = (item: string) => {
    setSelectedMajor(item);
    setSelectedProcess(null);
    setSelectedSub(null);
    setProcessSearch("");
    setSubSearch("");
    setSubStage("process");
  };

  const handleSelectProcess = (item: string) => {
    setSelectedProcess(item);
    setSelectedSub(null);
    setSubSearch("");
    setSubStage("subProcess");
  };

  const handleSelectSub = (item: string) => {
    setSelectedSub(item);
    // Immediately signal completion
    if (selectedMajor && selectedProcess) {
      onSelectionComplete({
        majorProcess: selectedMajor,
        process: selectedProcess,
        subProcess: item,
        isMiscellaneous: false,
      });
    }
  };

  const handleAdditionalActivities = () => {
    onSelectionComplete({
      majorProcess: "",
      process: "",
      subProcess: "",
      isMiscellaneous: true,
    });
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
      {/* Breadcrumb selections */}
      {(selectedMajor || selectedProcess || selectedSub) && (
        <div className="flex flex-wrap items-center gap-2">
          {selectedMajor && subStage !== "majorProcess" && (
            <>
              <SelectedBadge
                label="Major Process"
                value={selectedMajor}
                onClear={() => {
                  setSelectedMajor(null);
                  setSelectedProcess(null);
                  setSelectedSub(null);
                  setSubStage("majorProcess");
                  setMajorSearch("");
                }}
              />
            </>
          )}
          {selectedProcess && subStage === "subProcess" && (
            <>
              <ChevronRight size={14} className="text-slate-400" />
              <SelectedBadge
                label="Process"
                value={selectedProcess}
                onClear={() => {
                  setSelectedProcess(null);
                  setSelectedSub(null);
                  setSubStage("process");
                  setProcessSearch("");
                }}
              />
            </>
          )}
        </div>
      )}

      {/* Major Process Stage */}
      {subStage === "majorProcess" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              1
            </span>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Select Major Process
            </h3>
          </div>
          <PillGrid
            items={majorProcesses}
            selected={selectedMajor}
            searchQuery={majorSearch}
            onSearchChange={setMajorSearch}
            onSelect={handleSelectMajor}
            searchPlaceholder="Search major processes..."
            isLoading={loadingMajor}
            extraPill={hideAdditionalActivities ? undefined : additionalActivitiesPill}
          />
        </div>
      )}

      {/* Process Stage */}
      {subStage === "process" && selectedMajor && (
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              2
            </span>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Select Process
            </h3>
          </div>
          <PillGrid
            items={processes}
            selected={selectedProcess}
            searchQuery={processSearch}
            onSearchChange={setProcessSearch}
            onSelect={handleSelectProcess}
            searchPlaceholder="Search processes..."
            isLoading={loadingProcess}
          />
        </div>
      )}

      {/* Sub Process Stage */}
      {subStage === "subProcess" && selectedMajor && selectedProcess && (
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              3
            </span>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Select Sub Process / Activity
            </h3>
          </div>
          <PillGrid
            items={subProcesses}
            selected={selectedSub}
            searchQuery={subSearch}
            onSearchChange={setSubSearch}
            onSelect={handleSelectSub}
            searchPlaceholder="Search sub-processes..."
            isLoading={loadingSub}
          />
          {subProcesses.length === 0 && !loadingSub && (
            <p className="text-xs text-slate-500 mt-1">
              No sub-processes found. You can proceed to enter details manually.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
