import { useState, useEffect } from 'react';
import { Users, UserX, GitCompare, Download, Filter, RefreshCw } from 'lucide-react';
import { getWorkforceCapacityReport, exportToExcelClient } from '../../lib/api';
import { InlineLoadingBlock } from '../../components/PortalSkeletons';

type ActiveView = 'actual' | 'vacancy' | 'gap';

export default function WorkforceCapacityPlanning() {
  const [activeView, setActiveView] = useState<ActiveView>('actual');
  const [gradePerspective, setGradePerspective] = useState<'historical' | 'current'>('historical');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All Departments');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getWorkforceCapacityReport(departmentFilter, gradePerspective);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load workforce capacity report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [departmentFilter, gradePerspective]);

  const handleExport = (exportData: any[], filename: string) => {
    if (!exportData || exportData.length === 0) return;
    exportToExcelClient(exportData, filename);
  };

  return (
    <div className="min-h-screen bg-[#F7FAFE] p-4 md:p-6 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <section className="rounded-2xl border border-[#D9E4F2] bg-white px-5 py-4.5 md:px-6 md:py-5 shadow-[0_4px_16px_rgba(16,42,80,0.05)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl md:text-[26px] font-bold tracking-tight text-[#0F2649]">
                Workforce Capacity
              </h1>
              <p className="text-xs md:text-sm text-[#5A7697]">
                Understand workload, vacancies, and capacity gaps.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
              {/* Grade Perspective Segmented Control */}
              <div className="inline-flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-[#637F9F] hidden lg:inline">
                  Grade perspective:
                </span>
                <div
                  role="radiogroup"
                  aria-label="Grade perspective"
                  className="inline-flex items-center rounded-xl bg-[#F0F4FA] p-1 border border-[#D6E2F0]"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={gradePerspective === 'historical'}
                    onClick={() => setGradePerspective('historical')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                      gradePerspective === 'historical'
                        ? 'bg-white text-[#0F2649] shadow-sm font-bold'
                        : 'text-[#5A7697] hover:text-[#0F2649]'
                    }`}
                    title="Submission Grade: Uses employee grade recorded at the time of submission"
                  >
                    At Submission
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={gradePerspective === 'current'}
                    onClick={() => setGradePerspective('current')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                      gradePerspective === 'current'
                        ? 'bg-white text-[#0F2649] shadow-sm font-bold'
                        : 'text-[#5A7697] hover:text-[#0F2649]'
                    }`}
                    title="Current Grade: Evaluates workload against current user grade"
                  >
                    Current Grade
                  </button>
                </div>
              </div>

              {/* Secondary Refresh Button */}
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                aria-label="Refresh data"
                title="Refresh report data"
                className="inline-flex items-center justify-center h-8.5 w-8.5 rounded-xl border border-[#D6E2F0] bg-white text-[#5A7697] hover:text-[#0F2649] hover:bg-[#F7FAFE] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </section>

        {/* View Switcher Tabs (Sir's Approved Views A, B, C) */}
        <section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_4px_16px_rgba(16,42,80,0.05)] p-1.5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setActiveView('actual')}
              className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs md:text-sm font-semibold transition-all ${
                activeView === 'actual'
                  ? 'bg-[#0F2649] text-white shadow-sm font-bold'
                  : 'bg-[#F8FAFD] text-[#5A7697] hover:bg-[#EEF4FC] hover:text-[#0F2649] border border-transparent'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Actual Workforce</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('vacancy')}
              className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs md:text-sm font-semibold transition-all ${
                activeView === 'vacancy'
                  ? 'bg-[#165BAA] text-white shadow-sm font-bold'
                  : 'bg-[#F8FAFD] text-[#5A7697] hover:bg-[#EEF4FC] hover:text-[#0F2649] border border-transparent'
              }`}
            >
              <UserX className="h-4 w-4" />
              <span>Vacancy & Capacity Planning</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('gap')}
              className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs md:text-sm font-semibold transition-all ${
                activeView === 'gap'
                  ? 'bg-[#0284C7] text-white shadow-sm font-bold'
                  : 'bg-[#F8FAFD] text-[#5A7697] hover:bg-[#EEF4FC] hover:text-[#0F2649] border border-transparent'
              }`}
            >
              <GitCompare className="h-4 w-4" />
              <span>Workforce Gap Analysis</span>
            </button>
          </div>
        </section>

        {loading ? (
          <InlineLoadingBlock />
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error}
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* VIEW A: ACTUAL WORKFORCE */}
            {activeView === 'actual' && (
              <div className="space-y-6">
                {/* View A Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold text-[#637F9F]">Occupied Staff Headcount</p>
                    <p className="mt-2 text-2xl font-bold text-[#0F2649]">{data.actualWorkforce?.summary?.occupiedHeadcount || 0}</p>
                    <p className="mt-1 text-[11px] text-[#718BAA]">Excludes all vacant positions</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold text-[#637F9F]">Actual Staffed Workload</p>
                    <p className="mt-2 text-2xl font-bold text-[#0F2649]">{data.actualWorkforce?.summary?.staffedHours?.toLocaleString()} <span className="text-xs font-normal text-[#637F9F]">hrs</span></p>
                    <p className="mt-1 text-[11px] text-[#718BAA]">Recorded hours by named staff</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold text-[#637F9F]">Staffed FTE Contribution</p>
                    <p className="mt-2 text-2xl font-bold text-[#165BAA]">{data.actualWorkforce?.summary?.staffedFte} <span className="text-xs font-normal text-[#637F9F]">FTE</span></p>
                    <p className="mt-1 text-[11px] text-[#718BAA]">Based on 160h standard month</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold text-[#637F9F]">Staffed Avg. Utilization</p>
                    <p className="mt-2 text-2xl font-bold text-[#0F2649]">{data.actualWorkforce?.summary?.avgUtilizationPct}%</p>
                    <p className="mt-1 text-[11px] text-[#718BAA]">Real employee utilization</p>
                  </div>
                </div>

                {/* Grade Band Breakdown */}
                <section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-[#E3EAF4] px-5 py-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-[#0F2649]">Staffed Workload by Standardized Grade Band</h3>
                      <p className="text-xs text-[#637F9F]">All six approved grade bands ({gradePerspective === 'historical' ? 'Submission-Time Grade' : 'Current Grade'})</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleExport(data.actualWorkforce?.byGradeBand, `Staffed_Workforce_GradeBands_${gradePerspective}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D6E2F0] bg-white text-xs font-semibold text-[#0F2649] hover:bg-[#F4F8FD]"
                    >
                      <Download className="h-3.5 w-3.5" /> Export Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F5F8FD] text-[#617289] font-bold border-b border-[#E3EAF4]">
                        <tr>
                          <th className="px-5 py-3">Standardized Grade Band</th>
                          <th className="px-5 py-3 text-right">Occupied Headcount</th>
                          <th className="px-5 py-3 text-right">Workload Hours</th>
                          <th className="px-5 py-3 text-right">FTE Contribution</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8EEF7]">
                        {data.actualWorkforce?.byGradeBand?.map((row: any) => (
                          <tr key={row.band} className="hover:bg-[#F9FBFD]">
                            <td className="px-5 py-3 font-semibold text-[#0F2649]">{row.band}</td>
                            <td className="px-5 py-3 text-right tabular-nums text-[#314E72]">{row.headcount}</td>
                            <td className="px-5 py-3 text-right tabular-nums text-[#314E72]">{row.hours.toLocaleString()} hrs</td>
                            <td className="px-5 py-3 text-right tabular-nums font-bold text-[#165BAA]">{row.fte} FTE</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {/* VIEW B: VACANCY & CAPACITY PLANNING */}
            {activeView === 'vacancy' && (
              <div className="space-y-6">
                {/* View B Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold text-[#637F9F]">Identified Vacant Positions</p>
                    <p className="mt-2 text-2xl font-bold text-[#0F2649]">{data.vacancyCapacityPlanning?.summary?.vacantPositionsCount || 0}</p>
                    <p className="mt-1 text-[11px] text-[#718BAA]">Detected strictly by occupancy name logic</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold text-[#637F9F]">Preserved Planned Workload</p>
                    <p className="mt-2 text-2xl font-bold text-[#0F2649]">{data.vacancyCapacityPlanning?.summary?.plannedWorkloadHours?.toLocaleString()} <span className="text-xs font-normal text-[#637F9F]">hrs</span></p>
                    <p className="mt-1 text-[11px] text-[#718BAA]">Unassigned / planned operational workload</p>
                  </div>
                  <div className="rounded-2xl border border-[#D9E4F2] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold text-[#637F9F]">Planned Capacity Requirement</p>
                    <p className="mt-2 text-2xl font-bold text-[#165BAA]">{data.vacancyCapacityPlanning?.summary?.plannedCapacityFte} <span className="text-xs font-normal text-[#637F9F]">FTE</span></p>
                    <p className="mt-1 text-[11px] text-[#718BAA]">Capacity planned for open positions</p>
                  </div>
                </div>

                {/* Vacancy Distribution Table */}
                <section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-[#E3EAF4] px-5 py-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-[#0F2649]">Vacancy Planned Capacity by Standardized Grade Band</h3>
                      <p className="text-xs text-[#637F9F]">Workforce capacity planned for vacant positions</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleExport(data.vacancyCapacityPlanning?.byGradeBand, 'Vacancy_Capacity_GradeBands')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D6E2F0] bg-white text-xs font-semibold text-[#0F2649] hover:bg-[#F4F8FD]"
                    >
                      <Download className="h-3.5 w-3.5" /> Export Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F5F8FD] text-[#617289] font-bold border-b border-[#E3EAF4]">
                        <tr>
                          <th className="px-5 py-3">Standardized Grade Band</th>
                          <th className="px-5 py-3 text-right">Vacant Positions</th>
                          <th className="px-5 py-3 text-right">Planned Workload Hours</th>
                          <th className="px-5 py-3 text-right">Planned FTE Capacity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8EEF7]">
                        {data.vacancyCapacityPlanning?.byGradeBand?.map((row: any) => (
                          <tr key={row.band} className="hover:bg-[#F9FBFD]">
                            <td className="px-5 py-3 font-semibold text-[#0F2649]">{row.band}</td>
                            <td className="px-5 py-3 text-right tabular-nums text-[#314E72]">{row.headcount}</td>
                            <td className="px-5 py-3 text-right tabular-nums text-[#314E72]">{row.hours.toLocaleString()} hrs</td>
                            <td className="px-5 py-3 text-right tabular-nums font-bold text-[#165BAA]">{row.fte} FTE</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {/* VIEW C: WORKFORCE GAP ANALYSIS */}
            {activeView === 'gap' && (
              <div className="space-y-6">
                {/* View C Summary Banner */}
                <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-[#0F2649]">Evidence-Based Capacity Planning & Gap Matrix</h3>
                      <p className="mt-1 text-xs text-[#3B5B82]">
                        {data.workforceGapAnalysis?.summary?.deficitNotice}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-semibold">
                      <div className="bg-white px-3 py-2 rounded-xl border border-blue-200 shadow-sm">
                        <span className="text-[#637F9F]">Staffed Capacity: </span>
                        <span className="font-bold text-[#0F2649]">{data.workforceGapAnalysis?.summary?.availableStaffedCapacityFte} FTE</span>
                      </div>
                      <div className="bg-white px-3 py-2 rounded-xl border border-blue-200 shadow-sm">
                        <span className="text-[#637F9F]">Required Workload: </span>
                        <span className="font-bold text-[#0F2649]">{data.workforceGapAnalysis?.summary?.requiredCapacityFte} FTE</span>
                      </div>
                      <div className="bg-white px-3 py-2 rounded-xl border border-blue-200 shadow-sm">
                        <span className="text-[#637F9F]">Net Capacity Gap: </span>
                        <span className="font-bold text-red-600">{data.workforceGapAnalysis?.summary?.netGapFte} FTE</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Grade Band Gap Matrix */}
                <section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-[#E3EAF4] px-5 py-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-[#0F2649]">Capacity Gap Analysis by Standardized Grade Band</h3>
                      <p className="text-xs text-[#637F9F]">Compares current staffed headcount capacity against required workload and vacant requirements</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleExport(data.workforceGapAnalysis?.gradeBandGapMatrix, 'Workforce_Gap_GradeBands')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D6E2F0] bg-white text-xs font-semibold text-[#0F2649] hover:bg-[#F4F8FD]"
                    >
                      <Download className="h-3.5 w-3.5" /> Export Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F5F8FD] text-[#617289] font-bold border-b border-[#E3EAF4]">
                        <tr>
                          <th className="px-5 py-3">Grade Band</th>
                          <th className="px-4 py-3 text-right">Staffed Headcount</th>
                          <th className="px-4 py-3 text-right">Staffed Workload</th>
                          <th className="px-4 py-3 text-right">Vacant Workload</th>
                          <th className="px-4 py-3 text-right">Total Required</th>
                          <th className="px-4 py-3 text-right">Capacity Gap</th>
                          <th className="px-5 py-3 text-center">Planning Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8EEF7]">
                        {data.workforceGapAnalysis?.gradeBandGapMatrix?.map((row: any) => (
                          <tr key={row.gradeBand} className="hover:bg-[#F9FBFD]">
                            <td className="px-5 py-3 font-semibold text-[#0F2649]">{row.gradeBand}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[#314E72]">{row.staffedHeadcount}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[#314E72]">{row.staffedWorkloadFte} FTE</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[#314E72]">{row.vacantPlannedFte} FTE</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-[#0F2649]">{row.requiredTotalFte} FTE</td>
                            <td className={`px-4 py-3 text-right tabular-nums font-bold ${row.gapFte > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {row.gapFte > 0 ? `+${row.gapFte}` : row.gapFte} FTE
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                row.gapFte > 0 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
