import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  getTowersForDepartment,
  getProcessesForTower,
  getActivitiesForProcess,
  searchActivities,
  createCustomActivity,
  createCustomTower,
  createCustomProcess,
  type Tower,
  type Process,
  type Activity,
  type SearchActivity,
} from '../../lib/api';
import { SkeletonBlock, TablePageSkeleton } from '../../components/PortalSkeletons';

const DEPARTMENTS = [
  { id: 'All', label: 'All' },
  { id: 'HR', label: 'HR' },
  { id: 'Finance & Accounting', label: 'Finance & Accounts' },
];

type ExpandedState = {
  towers: Set<string>;
  processes: Set<string>;
};

type TreeData = {
  towers: Record<string, { data: Tower; processes?: Record<string, { data: Process; activities?: Activity[] }> }>;
};

export default function ProcessManagementPage() {
  const [department, setDepartment] = useState<string>('All');
  const [treeData, setTreeData] = useState<TreeData>({ towers: {} });
  const [expanded, setExpanded] = useState<ExpandedState>({ towers: new Set(), processes: new Set() });
  const [isLoading, setIsLoading] = useState(true);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchActivity[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const hasLoadedRef = useRef(false);
  const modalRoot = typeof document !== 'undefined' ? document.body : null;

  // Load towers on department change
  useEffect(() => {
    async function loadTowers() {
      const isFirstLoad = !hasLoadedRef.current;

      if (isFirstLoad) {
        setIsLoading(true);
      } else {
        setIsContentLoading(true);
      }

      setError(null);
      setSearchTerm('');
      setSearchResults([]);
      setExpanded({ towers: new Set(), processes: new Set() });

      try {
        console.log('Fetching towers for department:', department);
        const towers = await getTowersForDepartment(department);
        console.log('Received towers:', towers);
        
        if (!towers || towers.length === 0) {
          console.warn('No towers returned from API');
          setTreeData({ towers: {} });
        } else {
          const towerData: TreeData = { towers: {} };
          towers.forEach((tower) => {
            towerData.towers[tower.name] = {
              data: tower,
            };
          });
          console.log('Setting tree data with towers:', Object.keys(towerData.towers));
          setTreeData(towerData);
        }
      } catch (err: any) {
        console.error('Error loading towers:', err);
        setError(err?.message || 'Failed to load towers');
      } finally {
        setIsLoading(false);
        setIsContentLoading(false);
        hasLoadedRef.current = true;
      }
    }

    loadTowers();
  }, [department]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.trim()) {
        performSearch();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const performSearch = async () => {
    setIsSearching(true);
    try {
      const results = await searchActivities(searchTerm, department !== 'All' ? department : undefined);
      setSearchResults(results);

      // Auto-expand matching branches
      const newExpanded = { ...expanded };
      results.forEach((result) => {
        newExpanded.towers.add(result.tower.name);
        newExpanded.processes.add(`${result.tower.name}-${result.process.name}`);
      });
      setExpanded(newExpanded);
    } catch (err: any) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleTower = useCallback((towerName: string) => {
    setExpanded((prev) => {
      const newTowers = new Set(prev.towers);
      if (newTowers.has(towerName)) {
        newTowers.delete(towerName);
      } else {
        newTowers.add(towerName);
      }
      return { ...prev, towers: newTowers };
    });
  }, []);

  const toggleProcess = useCallback((towerId: string, processName: string) => {
    setExpanded((prev) => {
      const key = `${towerId}-${processName}`;
      const newProcesses = new Set(prev.processes);
      if (newProcesses.has(key)) {
        newProcesses.delete(key);
      } else {
        newProcesses.add(key);
      }
      return { ...prev, processes: newProcesses };
    });
  }, []);

  const loadProcesses = useCallback(
    async (towerName: string) => {
      try {
        const processes = await getProcessesForTower(towerName);
        setTreeData((prev) => ({
          towers: {
            ...prev.towers,
            [towerName]: {
              ...prev.towers[towerName],
              processes: processes.reduce(
                (acc, proc) => {
                  acc[proc.name] = { data: proc };
                  return acc;
                },
                {} as Record<string, { data: Process; activities?: Activity[] }>
              ),
            },
          },
        }));
      } catch (err: any) {
        console.error('Failed to load processes:', err);
      }
    },
    []
  );

  const loadActivities = useCallback(
    async (towerName: string, processName: string) => {
      try {
        const activities = await getActivitiesForProcess(towerName, processName);
        setTreeData((prev) => ({
          towers: {
            ...prev.towers,
            [towerName]: {
              ...prev.towers[towerName],
              processes: {
                ...prev.towers[towerName].processes,
                [processName]: {
                  ...prev.towers[towerName].processes![processName],
                  activities,
                },
              },
            },
          },
        }));
      } catch (err: any) {
        console.error('Failed to load activities:', err);
      }
    },
    []
  );

  const handleTowerToggle = async (towerName: string) => {
    const isExpanding = !expanded.towers.has(towerName);
    toggleTower(towerName);

    if (isExpanding && !treeData.towers[towerName]?.processes) {
      await loadProcesses(towerName);
    }
  };

  const handleProcessToggle = async (towerName: string, processName: string) => {
    const isExpanding = !expanded.processes.has(`${towerName}-${processName}`);
    toggleProcess(towerName, processName);

    if (isExpanding && !treeData.towers[towerName]?.processes?.[processName]?.activities) {
      await loadActivities(towerName, processName);
    }
  };

  const expandAll = () => {
    const newTowers = new Set<string>();
    const newProcesses = new Set<string>();

    Object.keys(treeData.towers).forEach((towerName) => {
      newTowers.add(towerName);
    });

    setExpanded({ towers: newTowers, processes: newProcesses });

    // Load all processes and activities
    Object.keys(treeData.towers).forEach(async (towerName) => {
      if (!treeData.towers[towerName]?.processes) {
        await loadProcesses(towerName);
      }
    });
  };

  const collapseAll = () => {
    setExpanded({ towers: new Set(), processes: new Set() });
  };

  const visibleTowers = useMemo(() => {
    if (searchResults.length === 0) {
      return Object.keys(treeData.towers);
    }

    const matchingTowers = new Set(searchResults.map((r) => r.tower.name));
    return Array.from(matchingTowers);
  }, [treeData, searchResults]);

  if (isLoading) {
    return <TablePageSkeleton rows={9} />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-700" />
          <div>
            <p className="text-sm font-semibold text-red-700">Failed to load processes</p>
            <p className="mt-1 text-xs text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_5px_14px_rgba(16,42,80,0.08)]">
        <div className="flex items-center justify-between border-b border-[#E3EBF6] px-4 py-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2649]">Process Management</h1>
            <p className="mt-1 text-xs text-[#637F9F]">
              Browse and manage organizational processes, towers, and activities.
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2367AE] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a4f8a]"
          >
            <Plus className="h-4 w-4" />
            Add Custom Process
          </button>
        </div>

        {/* Department Tabs */}
        <div className="border-b border-[#E3EBF6] px-4 py-3">
          <div className="inline-flex flex-wrap gap-2 rounded-xl bg-[#F3F8FF] p-1.5">
            {DEPARTMENTS.map((dept) => (
              <button
                key={dept.id}
                onClick={() => setDepartment(dept.id)}
                disabled={isContentLoading}
                className={`min-w-24 sm:w-40 rounded-lg border px-3 py-2 text-sm font-semibold text-center transition-all ${
                  department === dept.id
                    ? 'border-[#2367AE] bg-[#2367AE] text-white shadow-sm'
                    : 'border-[#CFE0F6] bg-white text-[#5E7594] hover:border-[#9FC0E8] hover:bg-[#F8FBFF]'
                }`}
              >
                {dept.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="border-b border-[#E3EBF6] px-4 py-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BA]" />
              <input
                type="text"
                placeholder="Search processes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-[#D9E4F2] bg-white pl-9 pr-3 py-2 text-sm text-[#1C334E] placeholder-[#8AA0BA] focus:border-[#2367AE] focus:outline-none"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSearchResults([]);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-[#8AA0BA] hover:text-[#5E7594]" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {searchResults.length === 0 && (
                <>
                  <button
                    onClick={expandAll}
                    className="rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-sm font-semibold text-[#5E7594] hover:bg-[#F5F8FD]"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={collapseAll}
                    className="rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-sm font-semibold text-[#5E7594] hover:bg-[#F5F8FD]"
                  >
                    Collapse All
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Search Results Section */}
        {searchResults.length > 0 && (
          <div className="border-b border-[#E3EBF6] bg-[#F0F6FF] px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-[#1C334E]">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found</p>
              {isSearching && <span className="text-xs font-semibold text-[#5E7594]">Searching...</span>}
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {searchResults.map((result) => (
                <div key={result._id} className="rounded-lg border border-[#D9E4F2] bg-white p-3 hover:border-[#2367AE] hover:shadow-md transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[#1C334E]">{result.name}</p>
                      <p className="mt-1 text-xs text-[#617C9E]">
                        <span className="font-semibold text-[#2367AE]">{result.tower.name}</span>
                        <span className="mx-1.5 text-[#8AA0BA]">›</span>
                        <span className="font-semibold text-[#2367AE]">{result.process.name}</span>
                        <span className="mx-1.5 text-[#8AA0BA]">›</span>
                        <span className="text-[#5E7594]">{result.department.name}</span>
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {result.isCustom && (
                        <span className="inline-flex items-center rounded-full bg-[#FFF4E6] px-2 py-0.5 text-xs font-bold text-[#E89B3C]">
                          Custom
                        </span>
                      )}
                      {result.automationPotential !== 'Not Assessed' && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                            result.automationPotential === 'High'
                              ? 'bg-[#ECFDF5] text-[#10B981]'
                              : result.automationPotential === 'Medium'
                                ? 'bg-[#FFFBEB] text-[#F59E0B]'
                                : 'bg-[#F3F4F6] text-[#6B7280]'
                          }`}
                        >
                          {result.automationPotential}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tree Browser - Only show when no search results */}
        {searchResults.length === 0 && (
        <div
          className={`relative divide-y divide-[#E3EBF6] transition-opacity duration-300 ${
            isContentLoading ? 'opacity-60 pointer-events-none' : 'opacity-100'
          }`}
        >
          {visibleTowers.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed border-[#D9E4F2] bg-[#FBFDFF] px-6 py-8">
                <Search className="h-7 w-7 text-[#9CB2CB]" />
                <p className="mt-3 text-sm font-semibold text-[#5E7594]">No processes found</p>
                <p className="mt-1 text-xs text-[#8AA0BA]">Try switching the department or clear your search term.</p>
              </div>
            </div>
          ) : (
            visibleTowers.map((towerName) => {
              const towerData = treeData.towers[towerName];
              const isExpanded = expanded.towers.has(towerName);
              const processes = towerData?.processes || {};

              return (
                <div key={towerName}>
                  {/* Tower Row */}
                  <button
                    onClick={() => handleTowerToggle(towerName)}
                    className="w-full px-4 py-3 text-left hover:bg-[#F5F8FD] flex items-center gap-2 bg-[#F9FBFD]"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-[#5E7594]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[#5E7594]" />
                    )}
                    <span className="font-semibold text-[#1C334E]">{towerName}</span>
                    <span className="ml-auto inline-flex items-center rounded-full bg-[#E3EBF6] px-2.5 py-0.5 text-xs font-bold text-[#5E7594]">
                      {towerData.data.processCount}
                    </span>
                  </button>

                  {/* Processes under Tower */}
                  {isExpanded && (
                    <div className="bg-white">
                      {Object.keys(processes).length === 0 ? (
                        <div className="px-8 py-3 text-sm text-[#8AA0BA]">No processes loaded</div>
                      ) : (
                        Object.entries(processes).map(([processName, processData]) => {
                          const procExpanded = expanded.processes.has(`${towerName}-${processName}`);
                          const activities = processData.activities || [];

                          return (
                            <div key={`${towerName}-${processName}`}>
                              {/* Process Row */}
                              <button
                                onClick={() => handleProcessToggle(towerName, processName)}
                                className="w-full px-8 py-2.5 text-left hover:bg-[#F9FBFD] flex items-center gap-2"
                              >
                                {procExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-[#5E7594]" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-[#5E7594]" />
                                )}
                                <span className="text-sm font-semibold text-[#36506F]">{processName}</span>
                                <span className="ml-auto inline-flex items-center rounded-full bg-[#EEF4FC] px-2 py-0.5 text-xs font-bold text-[#5E7594]">
                                  {processData.data.activityCount}
                                </span>
                              </button>

                              {/* Activities under Process */}
                              {procExpanded && (
                                <div className="bg-white">
                                  {activities.length === 0 ? (
                                    <div className="px-12 py-2 text-xs text-[#8AA0BA]">No activities loaded</div>
                                  ) : (
                                    activities.map((activity) => (
                                      <div key={activity._id} className="flex items-center gap-3 px-12 py-2 hover:bg-[#F9FBFD]">
                                        <span className="text-[#8AA0BA]">•</span>
                                        <div className="flex flex-1 items-center justify-between">
                                          <span className="text-xs text-[#1C334E]">{activity.name}</span>
                                          <div className="flex gap-2">
                                            {activity.isCustom && (
                                              <span className="inline-flex items-center rounded-full bg-[#FFF4E6] px-2 py-0.5 text-xs font-bold text-[#E89B3C]">
                                                Custom
                                              </span>
                                            )}
                                            {activity.automationPotential !== 'Not Assessed' && (
                                              <span
                                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                                                  activity.automationPotential === 'High'
                                                    ? 'bg-[#ECFDF5] text-[#10B981]'
                                                    : activity.automationPotential === 'Medium'
                                                      ? 'bg-[#FFFBEB] text-[#F59E0B]'
                                                      : 'bg-[#F3F4F6] text-[#6B7280]'
                                                }`}
                                              >
                                                {activity.automationPotential}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        )}

      </section>

      {/* Modal */}
      {showModal && modalRoot && createPortal(
        <AddCustomProcessModal onClose={() => setShowModal(false)} onSuccess={() => {}} />,
        modalRoot
      )}
    </div>
  );
}

function AddCustomProcessModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [department, setDepartment] = useState('HR');
  const [towers, setTowers] = useState<Tower[]>([]);
  const [tower, setTower] = useState('');
  const [showNewTower, setShowNewTower] = useState(false);
  const [newTowerName, setNewTowerName] = useState('');
  const [processes, setProcesses] = useState<Process[]>([]);
  const [process, setProcess] = useState('');
  const [showNewProcess, setShowNewProcess] = useState(false);
  const [newProcessName, setNewProcessName] = useState('');
  const [activityName, setActivityName] = useState('');
  const [description, setDescription] = useState('');
  const [automation, setAutomation] = useState('Not Assessed');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load towers on department change
  useEffect(() => {
    async function loadTowers() {
      setIsLoading(true);
      try {
        const data = await getTowersForDepartment(department);
        setTowers(data);
        setTower('');
        setProcesses([]);
        setProcess('');
      } catch (err: any) {
        setError(err?.message || 'Failed to load towers');
      } finally {
        setIsLoading(false);
      }
    }

    loadTowers();
  }, [department]);

  // Load processes on tower change
  useEffect(() => {
    async function loadProcesses() {
      if (!tower || showNewTower) return;
      setIsLoading(true);
      try {
        const data = await getProcessesForTower(tower);
        setProcesses(data);
        setProcess('');
      } catch (err: any) {
        setError(err?.message || 'Failed to load processes');
      } finally {
        setIsLoading(false);
      }
    }

    loadProcesses();
  }, [tower, showNewTower]);

  const handleCreateTower = async () => {
    if (!newTowerName.trim()) {
      setError('Tower name is required');
      return;
    }
    try {
      const result = await createCustomTower({ departmentId: department, name: newTowerName });
      setTowers([...towers, result.tower]);
      setTower(result.tower.name);
      setShowNewTower(false);
      setNewTowerName('');
      setSuccess('Tower created successfully');
    } catch (err: any) {
      setError(err?.message || 'Failed to create tower');
    }
  };

  const handleCreateProcess = async () => {
    if (!newProcessName.trim()) {
      setError('Process name is required');
      return;
    }
    try {
      const result = await createCustomProcess({
        towerId: tower,
        departmentId: department,
        name: newProcessName,
      });
      setProcesses([...processes, result.process]);
      setProcess(result.process.name);
      setShowNewProcess(false);
      setNewProcessName('');
      setSuccess('Process created successfully');
    } catch (err: any) {
      setError(err?.message || 'Failed to create process');
    }
  };

  const handleSave = async () => {
    if (!activityName.trim()) {
      setError('Activity name is required');
      return;
    }
    if (!tower || !process) {
      setError('Please select a tower and process');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await createCustomActivity({
        departmentId: department,
        towerId: tower,
        processId: process,
        name: activityName,
        description: description || undefined,
        automationPotential: automation !== 'Not Assessed' ? automation : undefined,
        notes: notes || undefined,
      });

      setSuccess('Process added successfully');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Failed to save process');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_20px_40px_rgba(16,42,80,0.15)]">
        <div className="border-b border-[#E3EBF6] px-6 py-4">
          <h2 className="text-xl font-bold text-[#0F2649]">Add Custom Process</h2>
          <p className="mt-1 text-xs text-[#637F9F]">
            {step === 1 ? 'Select location in the hierarchy' : 'Enter process details'}
          </p>
        </div>

        <div className="max-h-96 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-semibold text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-emerald-700">{success}</p>
            </div>
          )}

          {step === 1 ? (
            <div className="space-y-4">
              {/* Department */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#607A9B]">
                  Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-sm text-[#1C334E] focus:border-[#2367AE] focus:outline-none"
                >
                  <option value="HR">HR</option>
                  <option value="Finance & Accounting">Finance & Accounting</option>
                </select>
              </div>

              {/* Tower */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#607A9B]">
                  Tower
                </label>
                {isLoading ? (
                  <div className="mt-2 flex items-center gap-2">
                    <SkeletonBlock className="h-2 w-2" />
                    <SkeletonBlock className="h-2 w-16" />
                  </div>
                ) : showNewTower ? (
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      placeholder="New Tower Name"
                      value={newTowerName}
                      onChange={(e) => setNewTowerName(e.target.value)}
                      className="w-full rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-sm text-[#1C334E] focus:border-[#2367AE] focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateTower}
                        className="flex-1 rounded-lg bg-[#2367AE] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1a4f8a]"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => {
                          setShowNewTower(false);
                          setNewTowerName('');
                        }}
                        className="flex-1 rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-xs font-semibold text-[#5E7594] hover:bg-[#F5F8FD]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <select
                    value={tower}
                    onChange={(e) => setTower(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-sm text-[#1C334E] focus:border-[#2367AE] focus:outline-none"
                  >
                    <option value="">Select Tower...</option>
                    {towers.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name} ({t.processCount} processes)
                      </option>
                    ))}
                    <option value="__new__">+ Create New Tower</option>
                  </select>
                )}
                {tower === '__new__' && !showNewTower && (
                  <button
                    onClick={() => setShowNewTower(true)}
                    className="mt-2 text-xs font-semibold text-[#2367AE]"
                  >
                    + Create New Tower
                  </button>
                )}
              </div>

              {/* Process */}
              {tower && !showNewTower && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#607A9B]">
                    Process
                  </label>
                  {isLoading ? (
                    <div className="mt-2 flex items-center gap-2">
                      <SkeletonBlock className="h-2 w-2" />
                      <SkeletonBlock className="h-2 w-16" />
                    </div>
                  ) : showNewProcess ? (
                    <div className="mt-2 space-y-2">
                      <input
                        type="text"
                        placeholder="New Process Name"
                        value={newProcessName}
                        onChange={(e) => setNewProcessName(e.target.value)}
                        className="w-full rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-sm text-[#1C334E] focus:border-[#2367AE] focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateProcess}
                          className="flex-1 rounded-lg bg-[#2367AE] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1a4f8a]"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => {
                            setShowNewProcess(false);
                            setNewProcessName('');
                          }}
                          className="flex-1 rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-xs font-semibold text-[#5E7594] hover:bg-[#F5F8FD]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={process}
                      onChange={(e) => setProcess(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-sm text-[#1C334E] focus:border-[#2367AE] focus:outline-none"
                    >
                      <option value="">Select Process...</option>
                      {processes.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name} ({p.activityCount} activities)
                        </option>
                      ))}
                      <option value="__new__">+ Create New Process</option>
                    </select>
                  )}
                  {process === '__new__' && !showNewProcess && (
                    <button
                      onClick={() => setShowNewProcess(true)}
                      className="mt-2 text-xs font-semibold text-[#2367AE]"
                    >
                      + Create New Process
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Activity Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#607A9B]">
                  Activity Name *
                </label>
                <input
                  type="text"
                  placeholder="Enter sub-process name"
                  value={activityName}
                  onChange={(e) => setActivityName(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-sm text-[#1C334E] focus:border-[#2367AE] focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#607A9B]">
                  Description
                </label>
                <textarea
                  placeholder="Brief description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-sm text-[#1C334E] focus:border-[#2367AE] focus:outline-none"
                />
              </div>

              {/* Automation Potential */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#607A9B]">
                  Automation Potential
                </label>
                <select
                  value={automation}
                  onChange={(e) => setAutomation(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-sm text-[#1C334E] focus:border-[#2367AE] focus:outline-none"
                >
                  <option value="Not Assessed">Not Assessed</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#607A9B]">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Additional information"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[#D9E4F2] bg-white px-3 py-2 text-sm text-[#1C334E] focus:border-[#2367AE] focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[#E3EBF6] px-6 py-4 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#D9E4F2] bg-white px-4 py-2 text-sm font-semibold text-[#5E7594] hover:bg-[#F5F8FD]"
          >
            Cancel
          </button>
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              disabled={!tower || !process}
              className="rounded-lg bg-[#2367AE] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a4f8a] disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving || !activityName.trim()}
              className="flex items-center gap-2 rounded-lg bg-[#2367AE] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a4f8a] disabled:opacity-50"
            >
              Save Process
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
