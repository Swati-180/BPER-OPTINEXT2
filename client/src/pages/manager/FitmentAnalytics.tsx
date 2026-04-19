import { useEffect, useMemo, useState } from 'react';
import { 
  AlertCircle,
  BarChart,
  Check, 
  CheckCircle2, 
  ClipboardList, 
  Filter,
  Search, 
  UserX,
  XCircle,
  Save,
  Pencil,
  X
} from 'lucide-react';
import { getFitmentSummaryReport, getEmployeeFitment, updateEmployeeFitment } from '../../lib/api';
import { formatDateISO } from '../employee/bperSubmissionStorage';
import { InlineLoadingBlock } from '../../components/PortalSkeletons';

type AnalysisTab = 'summary' | 'scoring';
type DepartmentFilter = 'All Departments' | string;

type FitmentSummary = {
  profiles: number;
  totalEmployees: number;
  coveragePct: number;
  avgWeightedScore: number;
  labelBreakdown: { fit: number; trainToFit: number; unfit: number };
};

type EmployeeFitmentRow = {
  employeeId: string;
  name: string;
  designation: string;
  band: string;
  weightedScore: number;
  fitmentLabel: string;
  lastEvaluatedAt: string;
};

type FitmentParameter = {
  parameter: string;
  response: string;
  score: number;
  weight: number;
};

type EmployeeFitmentDetail = {
  employeeId: string;
  name: string;
  band?: string;
  client?: string;
  parameters: FitmentParameter[];
  weightedScore: number;
  fitmentLabel: string;
  lastEvaluatedAt: string;
};

const DEFAULT_DEPARTMENTS = ['All Departments', 'Finance', 'HR', 'IT', 'Operations', 'Corporate'];

const DEFAULT_PARAMETERS = [
  { parameter: 'Technical Skills Alignment', response: '', score: 0, weight: 5 },
  { parameter: 'Process Knowledge', response: '', score: 0, weight: 4 },
  { parameter: 'Communication & Collaboration', response: '', score: 0, weight: 3 },
  { parameter: 'Adaptability', response: '', score: 0, weight: 4 },
  { parameter: 'Leadership Potential', response: '', score: 0, weight: 4 },
];

function safeNumber(val: any, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function FitmentLabelBadge({ label }: { label: string }) {
  if (label === 'FIT') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200"><CheckCircle2 className="h-3 w-3" /> FIT</span>;
  }
  if (label === 'TRAIN TO FIT') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-200"><AlertCircle className="h-3 w-3" /> TRAIN TO FIT</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 border border-red-200"><XCircle className="h-3 w-3" /> UNFIT</span>;
}

function computeWeightedScoreLocally(params: FitmentParameter[]) {
  const sum = params.reduce((acc, p) => acc + (safeNumber(p.score) / 5) * safeNumber(p.weight), 0);
  return Number(sum.toFixed(1));
}

function computeLabelLocally(score: number) {
  if (score >= 80) return 'FIT';
  if (score >= 65) return 'TRAIN TO FIT';
  return 'UNFIT';
}

export default function FitmentAnalytics() {
  const [activeTab, setActiveTab] = useState<AnalysisTab>('summary');
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>('All Departments');
  
  // Summary State
  const [summaryData, setSummaryData] = useState<FitmentSummary | null>(null);
  const [scoreDistribution, setScoreDistribution] = useState<{label: string, count: number, min: number, max: number}[]>([]);
  const [topEmployees, setTopEmployees] = useState<EmployeeFitmentRow[]>([]);
  const [lowEmployees, setLowEmployees] = useState<EmployeeFitmentRow[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  // Scoring State
  const [searchQuery, setSearchQuery] = useState('');
  const [employeeFitment, setEmployeeFitment] = useState<EmployeeFitmentDetail | null>(null);
  const [isScoringLoading, setIsScoringLoading] = useState(false);
  const [scoringError, setScoringError] = useState('');
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editParameters, setEditParameters] = useState<FitmentParameter[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadSummary() {
      if (activeTab !== 'summary') return;
      setIsSummaryLoading(true);
      setSummaryError('');
      try {
        const data = await getFitmentSummaryReport(departmentFilter);
        setSummaryData(data.summary);
        setScoreDistribution(data.charts?.scoreDistribution || []);
        setTopEmployees(data.tables?.topFitEmployees || []);
        setLowEmployees(data.tables?.lowFitEmployees || []);
      } catch (err: any) {
        setSummaryError(err.message || 'Failed to load fitment summary.');
      } finally {
        setIsSummaryLoading(false);
      }
    }
    loadSummary();
  }, [departmentFilter, activeTab]);

  async function handleSearchEmployee(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsScoringLoading(true);
    setScoringError('');
    setEmployeeFitment(null);
    setIsEditing(false);

    try {
      const data = await getEmployeeFitment(searchQuery.trim());
      setEmployeeFitment(data);
      setEditParameters(data.parameters && data.parameters.length > 0 ? [...data.parameters] : [...DEFAULT_PARAMETERS]);
    } catch (err: any) {
      if (err.message && err.message.includes('not found')) {
        // Allow creating new profile for this employee id!
        setScoringError('');
        setEmployeeFitment({
          employeeId: searchQuery.trim(),
          name: 'New Profile (Draft)',
          parameters: [],
          weightedScore: 0,
          fitmentLabel: 'UNFIT',
          lastEvaluatedAt: new Date().toISOString()
        });
        setEditParameters([...DEFAULT_PARAMETERS]);
        setIsEditing(true);
      } else {
        setScoringError(err.message || 'Employee fitment profile not found.');
      }
    } finally {
      setIsScoringLoading(false);
    }
  }

  const handleStartEdit = () => {
    if (!employeeFitment) return;
    setEditParameters(employeeFitment.parameters && employeeFitment.parameters.length > 0 ? [...employeeFitment.parameters] : [...DEFAULT_PARAMETERS]);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    if (employeeFitment && employeeFitment.name === 'New Profile (Draft)') {
      setEmployeeFitment(null); // Return to default
    } else {
      setEditParameters([...(employeeFitment?.parameters || [])]);
    }
  };

  const handleParamChange = (index: number, field: keyof FitmentParameter, value: string | number) => {
    const updated = [...editParameters];
    updated[index] = { ...updated[index], [field]: value };
    setEditParameters(updated);
  };

  const handleSaveFitment = async () => {
    if (!employeeFitment) return;
    setIsSaving(true);
    setScoringError('');
    try {
      const savedData = await updateEmployeeFitment(employeeFitment.employeeId, editParameters);
      setEmployeeFitment(savedData);
      setIsEditing(false);
    } catch (err: any) {
      setScoringError(err.message || 'Failed to save fitment profile');
    } finally {
      setIsSaving(false);
    }
  };

  const maxDistCount = scoreDistribution.length > 0 ? Math.max(...scoreDistribution.map(d => d.count), 1) : 1;
  const currentLocalScore = computeWeightedScoreLocally(editParameters);
  const currentLocalLabel = computeLabelLocally(currentLocalScore);

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#0F2649]">Fitment Analytics</h1>
            <p className="mt-1 text-sm text-[#637F9F]">
              Analyze workforce fitment scoring, training readiness, and detailed parameter evaluations.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-[#F4F8FD] p-1 rounded-xl border border-[#DDE7F3]">
              <TabButton label="Summary" active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} icon={BarChart} />
              <TabButton label="Scoring" active={activeTab === 'scoring'} onClick={() => setActiveTab('scoring')} icon={ClipboardList} />
            </div>

            {activeTab === 'summary' && (
              <label className="relative w-48">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8CA0BA]" />
                <select
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#D6E2F0] bg-white pl-9 pr-3 text-sm font-medium text-[#243A59] outline-none focus:border-[#6E97CB] focus:ring-2 focus:ring-[#D7E6F7]"
                >
                  {DEFAULT_DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      </section>

      {activeTab === 'summary' && (
        <section className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {isSummaryLoading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-[#D9E4F2] bg-white shadow-sm">
              <InlineLoadingBlock className="w-full max-w-xl px-6" />
            </div>
          ) : summaryError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold">Failed to generate summary</p>
                <p className="text-xs mt-1">{summaryError}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard 
                  label="Analyzed Profiles" 
                  value={String(summaryData?.profiles || 0)} 
                  sub={`Out of ${summaryData?.totalEmployees || 0} scoped employees`}
                />
                <KPICard 
                  label="Global Coverage" 
                  value={`${safeNumber(summaryData?.coveragePct).toFixed(1)}%`} 
                  sub="Fitment completion rate"
                  highlight
                />
                <KPICard 
                  label="Avg Weighted Score" 
                  value={safeNumber(summaryData?.avgWeightedScore).toFixed(1)} 
                  sub="Across all analyzed roles"
                />
                <KPICard 
                  label="Fit Workforce" 
                  value={`${summaryData?.labelBreakdown.fit || 0} Employees`} 
                  sub={`${summaryData?.labelBreakdown.trainToFit || 0} need training, ${summaryData?.labelBreakdown.unfit || 0} unfit`}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr]">
                <article className="rounded-2xl border border-[#D9E4F2] bg-white p-4.5 shadow-[0_4px_12px_rgba(16,42,80,0.05)]">
                  <h3 className="text-lg font-bold text-[#102846]">Score Distribution</h3>
                  <p className="text-xs text-[#647D9D] mt-0.5">Employees mapped by weighted score bands</p>
                  
                  <div className="mt-6 flex h-48 items-end justify-between gap-2 border-b border-[#E3EAF4] pb-2 px-2">
                    {scoreDistribution.map((band) => (
                      <div key={band.label} className="flex w-full flex-col items-center gap-2 group relative">
                        {band.count > 0 && (
                          <span className="absolute -top-7 text-xs font-bold text-[#1A5AA6] opacity-0 group-hover:opacity-100 transition-opacity">
                            {band.count}
                          </span>
                        )}
                        <div 
                          className="w-full max-w-16 rounded-t-md bg-linear-to-t from-[#205CB4] to-[#4084EB] transition-all duration-500 ease-out"
                          style={{ height: `${Math.max(2, (band.count / maxDistCount) * 100)}%` }}
                        />
                        <span className="text-[11px] font-semibold text-[#5B7290] whitespace-nowrap">{band.label}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-2xl border border-[#D9E4F2] bg-white p-4.5 shadow-[0_4px_12px_rgba(16,42,80,0.05)] flex flex-col">
                  <div className="flex items-center justify-between border-b border-[#E3EAF4] pb-3 mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-[#102846]">Top Fitment Matches</h3>
                      <p className="text-xs text-[#647D9D] mt-0.5">Highest scoring employees (FIT)</p>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto">
                    {topEmployees.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-[#8BA0BA] italic py-8">
                        No employees found with FIT rating in this scope.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {topEmployees.slice(0, 4).map((emp) => (
                          <div key={emp.employeeId} className="flex items-center justify-between rounded-xl border border-[#E8EEF7] bg-[#F9FBFF] p-3">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 flex items-center justify-center rounded-full bg-[#E0EDFF] text-[#124B9F] font-bold text-xs uppercase">
                                {emp.name.substring(0, 2)}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-[#162C4E]">{emp.name}</p>
                                <p className="text-[10px] uppercase tracking-wider text-[#637C9B]">ID: {emp.employeeId} · {emp.designation}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-lg font-bold text-[#1E5EA9]">{emp.weightedScore}</span>
                              <FitmentLabelBadge label={emp.fitmentLabel} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              </div>

              <article className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_4px_12px_rgba(16,42,80,0.05)] overflow-hidden">
                <div className="border-b border-[#E3EAF4] px-4.5 py-3.5">
                  <h3 className="text-lg font-bold text-[#102846]">Training Potential Candidates</h3>
                  <p className="text-xs text-[#647D9D] mt-0.5">Employees categorized as Train to Fit or Unfit</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="bg-[#F5F8FD] text-[10px] font-bold uppercase tracking-[0.15em] text-[#617D9D] border-b border-[#E3EAF4]">
                        <th className="px-4.5 py-3">Employee ID</th>
                        <th className="px-4.5 py-3">Name</th>
                        <th className="px-4.5 py-3">Designation</th>
                        <th className="px-4.5 py-3">Score</th>
                        <th className="px-4.5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4.5 py-8 text-center text-xs text-[#8BA0BA]">
                            No training candidates identified currently.
                          </td>
                        </tr>
                      ) : (
                        lowEmployees.map((emp) => (
                          <tr key={emp.employeeId} className="border-b border-[#E8EEF7] last:border-0 hover:bg-[#FAFCFF] transition-colors">
                            <td className="px-4.5 py-3 text-xs font-bold text-[#1A5AA6]">{emp.employeeId}</td>
                            <td className="px-4.5 py-3 text-sm font-semibold text-[#183153]">{emp.name}</td>
                            <td className="px-4.5 py-3 text-xs text-[#4F6A8A]">{emp.designation}</td>
                            <td className="px-4.5 py-3 text-sm font-bold text-[#3B4F69]">{emp.weightedScore}</td>
                            <td className="px-4.5 py-3">
                              <FitmentLabelBadge label={emp.fitmentLabel} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </>
          )}
        </section>
      )}

      {activeTab === 'scoring' && (
        <section className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="rounded-2xl border border-[#D9E4F2] bg-white p-4.5 shadow-[0_4px_12px_rgba(16,42,80,0.05)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#102846]">Lookup Individual Fitment</h3>
                <p className="text-xs text-[#647D9D] mt-1 mb-2 md:mb-0">View or evaluate granular scoring parameters for an employee.</p>
              </div>
              
              <form onSubmit={handleSearchEmployee} className="flex flex-1 max-w-lg items-center gap-3">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Enter Employee ID (e.g. BPER-101)..."
                    className="h-11 w-full rounded-xl border border-[#CDE0F5] bg-[#F7FAFE] pl-9 pr-4 text-sm text-[#253D5C] outline-none transition-all placeholder:text-[#9FB1C7] focus:border-[#6CA3E6] focus:bg-white focus:ring-4 focus:ring-[#DDEBFB]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isScoringLoading || !searchQuery.trim()}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-[#165BAA] px-5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#114888] disabled:opacity-50 disabled:hover:bg-[#165BAA]"
                >
                  Search
                </button>
              </form>
            </div>

            {scoringError && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#FFF4F4] px-4 py-3 text-sm text-[#CD2B2B] border border-[#FAD3D3]">
                <UserX className="h-4 w-4" />
                <span className="font-semibold">{scoringError}</span>
              </div>
            )}
          </div>

          {employeeFitment && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
              <div className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_4px_12px_rgba(16,42,80,0.05)] overflow-hidden flex flex-col">
                <div className="border-b border-[#E3EAF4] px-4.5 py-4 bg-[#F8FBFF]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-[#0A1A31]">{employeeFitment.name}</h3>
                      <p className="mt-1 text-xs font-semibold text-[#577296]">EMP ID: {employeeFitment.employeeId} {employeeFitment.band ? `· Band: ${employeeFitment.band}` : ''}</p>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      {!isEditing ? (
                         <button 
                         onClick={handleStartEdit}
                         className="inline-flex items-center gap-2 rounded-xl border border-[#CFDBEB] bg-white px-4 py-2 text-xs font-semibold text-[#374F70] hover:bg-[#F7FAFF] shadow-sm transition-all"
                       >
                         <Pencil className="h-3.5 w-3.5" /> Edit Fitment
                       </button>
                      ) : (
                        <div className="flex gap-2">
                          <button 
                            onClick={handleCancelEdit}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#CFDBEB] bg-white px-3 py-2 text-xs font-semibold text-[#8CA0BA] hover:bg-slate-50 transition-all"
                          >
                            <X className="h-3.5 w-3.5" /> Cancel
                          </button>
                          <button 
                            onClick={handleSaveFitment}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#031F45] px-4 py-2 text-xs font-semibold text-white hover:bg-[#062B5F] shadow-sm transition-all disabled:opacity-50"
                          >
                            <Save className="h-3.5 w-3.5" />
                            Save Fitment
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white text-[10px] font-bold uppercase tracking-[0.15em] text-[#7188A3] border-b border-[#E3EAF4]">
                        <th className="px-5 py-3.5">Evaluation Parameter</th>
                        <th className="px-5 py-3.5">Employee/Manager Response</th>
                        <th className="px-5 py-3.5 text-center">Score (0-5)</th>
                        <th className="px-5 py-3.5 text-center">Weight Max(10)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(isEditing ? editParameters : employeeFitment.parameters)?.length > 0 ? (
                        (isEditing ? editParameters : employeeFitment.parameters).map((param, idx) => (
                          <tr key={idx} className="border-b border-[#ECF1F8] last:border-0 hover:bg-[#FDFEFF]">
                            <td className="px-5 py-4 w-1/4">
                              {isEditing ? (
                                <input 
                                  value={param.parameter}
                                  onChange={(e) => handleParamChange(idx, 'parameter', e.target.value)}
                                  placeholder="Criteria Name"
                                  className="w-full rounded-md border border-[#D6E2F0] p-2 text-sm font-semibold text-[#1C3250] outline-none focus:border-[#6E97CB]"
                                />
                              ) : (
                                <p className="text-sm font-semibold text-[#1C3250] leading-snug">{param.parameter}</p>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              {isEditing ? (
                                <textarea
                                  value={param.response}
                                  onChange={(e) => handleParamChange(idx, 'response', e.target.value)}
                                  placeholder="Observation notes or employee answers..."
                                  className="w-full rounded-lg border border-[#D6E2F0] p-2 text-sm text-[#476082] outline-none focus:border-[#6E97CB] resize-y min-h-[40px]"
                                />
                              ) : (
                                <div className="rounded-lg bg-[#F5F8FC] p-2.5 border border-[#E9EEF5]">
                                  <p className="text-sm text-[#476082] italic leading-snug">{param.response || 'No response provided'}</p>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={5}
                                  value={param.score}
                                  onChange={(e) => handleParamChange(idx, 'score', Number(e.target.value))}
                                  className="w-14 rounded-md border border-[#D6E2F0] p-1.5 text-center text-sm font-bold text-[#1456A2] outline-none focus:border-[#6E97CB]"
                                />
                              ) : (
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF4FB] text-sm font-bold text-[#1456A2]">
                                  {param.score}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={param.weight}
                                  onChange={(e) => handleParamChange(idx, 'weight', Number(e.target.value))}
                                  className="w-14 rounded-md border border-[#D6E2F0] p-1.5 text-center text-sm font-semibold text-[#5B7598] outline-none focus:border-[#6E97CB]"
                                />
                              ) : (
                                <span className="text-sm font-semibold text-[#5B7598]">{param.weight}</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-5 py-8 text-center text-sm text-[#8BA0BA]">
                            No parameters mapped. Enter Edit Mode to assign criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  
                  {isEditing && (
                    <div className="p-4 bg-[#F8FBFF] border-t border-[#E3EAF4]">
                      <button
                        type="button"
                        onClick={() => setEditParameters([...editParameters, { parameter: '', response: '', score: 0, weight: 1 }])}
                        className="text-xs font-bold text-[#1A5AA6] hover:underline"
                      >
                        + Add Custom Parameter
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-[#DDE7F3] bg-linear-to-b from-[#13447E] to-[#0A2649] p-5 text-white shadow-lg">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#93B8E8]">{isEditing ? 'Calculated Projection' : 'Final Assessment Score'}</p>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-5xl font-black tracking-tight text-white">{isEditing ? currentLocalScore.toFixed(1) : employeeFitment.weightedScore.toFixed(1)}</span>
                    <span className="text-sm font-bold text-[#6D9DE0]">/ 100</span>
                  </div>
                  <div className="mt-5 border-t border-white/10 pt-4">
                    <div className="flex flex-col gap-2">
                       <p className="text-[10px] uppercase font-bold text-[#8DB8F2]">Fitment Label</p>
                       <FitmentLabelBadge label={isEditing ? currentLocalLabel : employeeFitment.fitmentLabel} />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#D9E4F2] bg-white p-4 shadow-sm flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#798FA8] mb-3">Evaluation Metadata</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center bg-[#F9FBFF] p-2.5 rounded-lg border border-[#E8EEF6]">
                      <span className="text-xs font-semibold text-[#5A7391]">Last Evaluated</span>
                      <span className="text-xs font-bold text-[#183457]">{isEditing ? 'Unsaved Edits' : formatDateISO(employeeFitment.lastEvaluatedAt)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-[#F9FBFF] p-2.5 rounded-lg border border-[#E8EEF6]">
                      <span className="text-xs font-semibold text-[#5A7391]">Parameters Used</span>
                      <span className="text-xs font-bold text-[#183457]">{isEditing ? editParameters.length : (employeeFitment.parameters?.length || 0)} Criteria</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!employeeFitment && !isScoringLoading && !scoringError && (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#C5D6EA] bg-[#FAFCFF] p-8 text-center text-[#738BA8]">
              <Search className="mb-4 h-10 w-10 text-[#BBD1EE]" />
              <p className="text-base font-semibold text-[#304B6D]">Look up or Add an Employee ID to view detailed scoring</p>
              <p className="mt-1 text-sm max-w-md">Retrieve exact criteria weightings, qualitative responses, and quantitative score calculations. Create a new profile if they don't exist.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TabButton({ label, active, icon: Icon, onClick }: { label: string; active: boolean; icon: any; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
        active 
          ? 'bg-white text-[#102A4E] shadow-[0_2px_8px_rgba(15,38,73,0.12)]' 
          : 'text-[#6A819E] hover:text-[#2A4870] hover:bg-[#EBF2FA]'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function KPICard({ label, value, sub, highlight }: { label: string, value: string, sub: string, highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-4.5 border ${
      highlight 
        ? 'border-[#2662B7] bg-linear-to-br from-[#124180] to-[#1C53A3] shadow-[0_6px_16px_rgba(28,83,163,0.3)] text-white' 
        : 'border-[#D9E4F2] bg-white shadow-[0_4px_10px_rgba(16,42,80,0.04)] text-[#102846]'
    }`}>
      <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 ${highlight ? 'text-[#8DB8F2]' : 'text-[#7B92AF]'}`}>
        {label}
      </p>
      <p className="text-3xl font-black tracking-tight">{value}</p>
      <p className={`text-xs mt-2 font-medium ${highlight ? 'text-[#B4D3FC]' : 'text-[#5C7596]'}`}>
        {sub}
      </p>
    </div>
  );
}
