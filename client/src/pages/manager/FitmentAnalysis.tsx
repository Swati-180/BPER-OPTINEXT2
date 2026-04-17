import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  Loader2,
  BarChart3,
  Users,
  TrendingUp,
  Award,
} from 'lucide-react';
import { getFitmentAnalysisReport, exportToCSV } from '../../lib/api';

type TabType = 'overview' | 'byLabel' | 'allProfiles';

type FitmentAnalysisReport = {
  generatedAt?: string;
  summary?: {
    profiles?: number;
    totalEmployees?: number;
    coveragePct?: number;
    avgWeightedScore?: number;
    labelBreakdown?: {
      fit?: number;
      trainToFit?: number;
      unfit?: number;
    };
  };
  charts?: {
    scoreDistribution?: Array<{
      label: string;
      count: number;
    }>;
  };
  tabs?: {
    byLabel?: Array<{
      label: string;
      profiles: Array<{
        employeeId: string;
        name: string;
        designation: string;
        band: string;
        department: string;
        weightedScore: number;
        fitmentLabel: string;
        lastEvaluatedAt: string;
      }>;
    }>;
    allProfiles?: Array<{
      employeeId: string;
      name: string;
      designation: string;
      band: string;
      department: string;
      weightedScore: number;
      fitmentLabel: string;
      lastEvaluatedAt: string;
    }>;
  };
};

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function FitmentAnalysisPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [report, setReport] = useState<FitmentAnalysisReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function loadReport() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getFitmentAnalysisReport();
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load fitment analysis.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
  }, []);

  useEffect(() => {
    const refreshOnDataUpdate = () => {
      loadReport();
    };

    const refreshInterval = window.setInterval(() => {
      loadReport();
    }, 30000);

    window.addEventListener('bper:data-updated', refreshOnDataUpdate as EventListener);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener('bper:data-updated', refreshOnDataUpdate as EventListener);
    };
  }, []);

  const summary = report?.summary || {};
  const scoreDistribution = Array.isArray(report?.charts?.scoreDistribution) ? report!.charts!.scoreDistribution! : [];
  const byLabel = Array.isArray(report?.tabs?.byLabel) ? report!.tabs!.byLabel! : [];
  const allProfiles = Array.isArray(report?.tabs?.allProfiles) ? report!.tabs!.allProfiles! : [];

  function handleExportAllProfiles() {
    setIsExporting(true);
    try {
      exportToCSV(
        allProfiles,
        'Fitment-All-Profiles',
        ['employeeId', 'name', 'designation', 'band', 'department', 'weightedScore', 'fitmentLabel', 'lastEvaluatedAt']
      );
    } finally {
      setIsExporting(false);
    }
  }

  function handleExportByLabel(label: string) {
    setIsExporting(true);
    try {
      const labelData = byLabel.find((item) => item.label === label);
      if (labelData && labelData.profiles) {
        exportToCSV(
          labelData.profiles,
          `Fitment-${label}`,
          ['employeeId', 'name', 'designation', 'band', 'department', 'weightedScore', 'lastEvaluatedAt']
        );
      }
    } finally {
      setIsExporting(false);
    }
  }

  if (isLoading && !report) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[#1E5EAB]" />
            <span className="text-sm font-medium text-[#5D789A]">Loading fitment analysis...</span>
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-700">Unable to load fitment analysis</p>
              <p className="mt-1 text-xs text-red-600">{error}</p>
              <button
                type="button"
                onClick={loadReport}
                className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
        <div>
          <h1 className="text-2xl font-bold text-[#0F2649]">Fitment Analysis</h1>
          <p className="mt-1 text-sm text-[#5D789A]">Employee fitment assessment and role alignment</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Profiles Analyzed"
          value={String(safeNumber(summary.profiles))}
          helper="Total employees evaluated"
        />
        <KpiCard
          icon={TrendingUp}
          label="Avg Score"
          value={safeNumber(summary.avgWeightedScore).toFixed(1)}
          helper="Out of 100"
        />
        <KpiCard
          icon={Award}
          label="Coverage"
          value={`${safeNumber(summary.coveragePct).toFixed(1)}%`}
          helper="Of total employees"
        />
        <KpiCard
          icon={BarChart3}
          label="FIT Profiles"
          value={String(safeNumber(summary.labelBreakdown?.fit))}
          helper="Ready role fit"
        />
      </section>

      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-[0_6px_18px_rgba(16,42,80,0.08)]">
        <div className="inline-flex rounded-xl border border-[#DDE7F3] bg-[#F8FBFF] p-1 mb-5">
          <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <TabButton label="By Label" active={activeTab === 'byLabel'} onClick={() => setActiveTab('byLabel')} />
          <TabButton label="All Profiles" active={activeTab === 'allProfiles'} onClick={() => setActiveTab('allProfiles')} />
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {scoreDistribution.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4">
                  <div className="flex items-end gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-[#8AA0BA] font-semibold">Score Range</p>
                      <p className="mt-1 text-2xl font-bold text-[#0F2649]">{item.label}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-[#5D789A]">Employees</p>
                      <p className="mt-1 text-3xl font-bold text-[#1E5EAB]">{item.count}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-[#0F2649]">FIT</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 bg-linear-to-r from-[#169F54] to-[#0F9C5E] rounded-full" style={{width: '100px'}}></div>
                    <span className="text-sm font-bold text-[#169F54]">{safeNumber(summary.labelBreakdown?.fit)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-[#0F2649]">TRAIN TO FIT</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 bg-linear-to-r from-[#F59E0B] to-[#FCD34D] rounded-full" style={{width: '70px'}}></div>
                    <span className="text-sm font-bold text-[#D97706]">{safeNumber(summary.labelBreakdown?.trainToFit)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-[#0F2649]">UNFIT</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 bg-linear-to-r from-[#DC2626] to-[#EF4444] rounded-full" style={{width: '50px'}}></div>
                    <span className="text-sm font-bold text-[#DC2626]">{safeNumber(summary.labelBreakdown?.unfit)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'byLabel' && (
          <div className="space-y-6">
            {byLabel.map((labelGroup) => (
              <div key={labelGroup.label}>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-[#0F2649]">
                    {labelGroup.label} ({labelGroup.profiles?.length || 0})
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleExportByLabel(labelGroup.label)}
                    disabled={isExporting}
                    className="flex items-center gap-2 rounded-lg border border-[#D2DEED] bg-[#F7FAFF] px-3 py-1.5 text-xs font-semibold text-[#1E5EAB] hover:bg-[#EAF2FF] disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </button>
                </div>
                {(labelGroup.profiles?.length || 0) === 0 ? (
                  <div className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4 text-center text-sm text-[#8AA0BA]">
                    No {labelGroup.label} profiles available.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-200 border-collapse text-left text-sm">
                      <thead>
                        <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                          <th className="px-5 py-3">Employee ID</th>
                          <th className="px-5 py-3">Name</th>
                          <th className="px-5 py-3">Designation</th>
                          <th className="px-5 py-3">Band</th>
                          <th className="px-5 py-3">Department</th>
                          <th className="px-5 py-3 text-right">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {labelGroup.profiles?.map((profile, idx) => (
                          <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                            <td className="px-5 py-3 font-mono text-[#5D789A]">{profile.employeeId}</td>
                            <td className="px-5 py-3 font-medium text-[#0F2649]">{profile.name}</td>
                            <td className="px-5 py-3 text-[#5D789A]">{profile.designation}</td>
                            <td className="px-5 py-3 text-[#5D789A]">{profile.band}</td>
                            <td className="px-5 py-3 text-[#5D789A]">{profile.department}</td>
                            <td className="px-5 py-3 text-right text-[#1E5EAB] font-bold">{profile.weightedScore}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'allProfiles' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[#0F2649]">All Fitment Profiles ({allProfiles.length})</h3>
              <button
                type="button"
                onClick={handleExportAllProfiles}
                disabled={isExporting}
                className="flex items-center gap-2 rounded-lg border border-[#D2DEED] bg-[#F7FAFF] px-3 py-1.5 text-xs font-semibold text-[#1E5EAB] hover:bg-[#EAF2FF] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            {allProfiles.length === 0 ? (
              <div className="rounded-lg border border-[#E3EAF4] bg-[#F8FBFF] p-4 text-center text-sm text-[#8AA0BA]">
                No fitment profiles available.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-200 border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
                      <th className="px-5 py-3">Employee ID</th>
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Designation</th>
                      <th className="px-5 py-3">Band</th>
                      <th className="px-5 py-3">Department</th>
                      <th className="px-5 py-3 text-right">Score</th>
                      <th className="px-5 py-3">Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allProfiles.map((profile, idx) => (
                      <tr key={idx} className="border-b border-[#E3EAF4] hover:bg-[#F8FBFF]">
                        <td className="px-5 py-3 font-mono text-[#5D789A]">{profile.employeeId}</td>
                        <td className="px-5 py-3 font-medium text-[#0F2649]">{profile.name}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{profile.designation}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{profile.band}</td>
                        <td className="px-5 py-3 text-[#5D789A]">{profile.department}</td>
                        <td className="px-5 py-3 text-right text-[#1E5EAB] font-bold">{profile.weightedScore}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${
                            profile.fitmentLabel === 'FIT'
                              ? 'bg-emerald-100 text-emerald-700'
                              : profile.fitmentLabel === 'TRAIN TO FIT'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {profile.fitmentLabel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-[#D9E4F2] bg-white p-4 shadow-[0_2px_8px_rgba(16,42,80,0.05)]">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8AA0BA]">{label}</p>
          <p className="mt-2 text-2xl font-bold text-[#0F2649]">{value}</p>
          <p className="mt-1 text-xs text-[#5D789A]">{helper}</p>
        </div>
        <Icon className="h-5 w-5 text-[#1E5EAB] opacity-50" />
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        active
          ? 'bg-white text-[#1E5EAB] shadow-sm'
          : 'bg-transparent text-[#8AA0BA] hover:text-[#5D789A]'
      }`}
    >
      {label}
    </button>
  );
}
