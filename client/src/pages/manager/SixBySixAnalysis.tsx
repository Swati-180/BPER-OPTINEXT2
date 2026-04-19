import { useMemo, useState, useEffect } from 'react';

type Department = 'F&A' | 'HR' | 'Logistics' | 'SCM';
type CriteriaValue = 'H' | 'M' | 'L';
type AnalysisTab = 'overview' | 'matrix' | 'distribution';

type ProcessRow = {
	_id?: string;
	process: string;
	department: Department;
	type: string;
	criteria: CriteriaValue[] | string[];
	score: number;
	consolidated: boolean;
};

const PERFORMANCE_LABELS: Record<string, string> = {
  'ML': 'Multiple Locations',
  'R': 'Routine',
  'V': 'Volumes',
  'M': 'Manpower',
  'S': 'SOPs',
  'E': 'ERP/Tech'
};

const CHARACTERISTIC_LABELS: Record<string, string> = {
  'S': 'Sensitivity',
  'Cr': 'Criticality',
  'Co': 'Controls',
  'P': 'Proximity',
  'R': 'Regulatory',
  'Sk': 'Skill'
};



const SCORE_BUCKETS = [
	{ label: '0-4', min: 0, max: 4 },
	{ label: '5-6', min: 5, max: 6 },
	{ label: '7-8', min: 7, max: 8 },
	{ label: '9-10', min: 9, max: 10 },
	{ label: '11-12', min: 11, max: 12 },
];

export default function SixBySixAnalysisPage() {
	const [activeTab, setActiveTab] = useState<AnalysisTab>('overview');
	const [departmentFilter, setDepartmentFilter] = useState<'All Departments' | Department>('All Departments');
	const [processData, setProcessData] = useState<ProcessRow[]>([]);
	const [draftRows, setDraftRows] = useState<ProcessRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		const fetchData = async () => {
			setIsLoading(true);
			try {
				const token = localStorage.getItem('bper.auth.token');
				const response = await fetch(`${import.meta.env.VITE_API_URL}/api/analysis/six-by-six?department=${encodeURIComponent(departmentFilter)}`, {
					headers: {
						'Authorization': `Bearer ${token}`
					}
				});
				const data = await response.json();
				if (response.ok) {
					setProcessData(data);
					setDraftRows(data);
				}
			} catch (error) {
				console.error('Failed to fetch 6x6 data:', error);
			} finally {
				setIsLoading(false);
			}
		};
		fetchData();
	}, [departmentFilter]);

	const departments = useMemo(() => ['All Departments', 'F&A', 'HR', 'Logistics', 'SCM'] as const, []);

	const filteredRows = draftRows;

	const handleCriteriaToggle = (processId: string, colIndex: number) => {
		setDraftRows(prev => prev.map(row => {
			if (row.process !== processId) return row;
			const currentVal = row.criteria[colIndex];
			const nextVal = currentVal === '-' ? 'H' : currentVal === 'H' ? 'M' : currentVal === 'M' ? 'L' : '-';
			const newCriteria = [...row.criteria];
			newCriteria[colIndex] = nextVal as CriteriaValue;
			
			// PRD Algorithm: +1 for H in Performance (idx 0-5), +1 for L in Characteristics (idx 6-11)
			const performanceScore = newCriteria.slice(0, 6).filter(v => v === 'H').length;
			const characteristicScore = newCriteria.slice(6, 12).filter(v => v === 'L').length;
			const newScore = performanceScore + characteristicScore;
			
			return { 
				...row, 
				criteria: newCriteria, 
				score: newScore, 
				consolidated: newScore >= 7 
			};
		}));
	};

	const saveChanges = async () => {
		setIsSaving(true);
		try {
			const token = localStorage.getItem('bper.auth.token');
			const response = await fetch(`${import.meta.env.VITE_API_URL}/api/analysis/six-by-six`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
				body: JSON.stringify({ rows: draftRows })
			});
			if (response.ok) {
				const saved = await response.json();
				// Ideally refetch or just sync
				setProcessData(draftRows);
			}
		} catch (error) {
			console.error('Failed to save scores:', error);
		} finally {
			setIsSaving(false);
		}
	};

	const departmentStats = useMemo(() => {
		const map = new Map<Department, { consolidated: number; notConsolidated: number }>();

		filteredRows.forEach((item) => {
			const existing = map.get(item.department) ?? { consolidated: 0, notConsolidated: 0 };
			if (item.consolidated) {
				existing.consolidated += 1;
			} else {
				existing.notConsolidated += 1;
			}
			map.set(item.department, existing);
		});

		return Array.from(map.entries()).map(([department, values]) => ({
			department,
			...values,
			total: values.consolidated + values.notConsolidated,
		}));
	}, [filteredRows]);

	const summaryRows = useMemo(() => {
		const grouped = new Map<string, { department: Department; type: string; total: number; consolidated: number; notConsolidated: number }>();

		filteredRows.forEach((item) => {
			const key = `${item.department}::${item.type}`;
			const existing = grouped.get(key) ?? {
				department: item.department,
				type: item.type,
				total: 0,
				consolidated: 0,
				notConsolidated: 0,
			};

			existing.total += 1;
			if (item.consolidated) {
				existing.consolidated += 1;
			} else {
				existing.notConsolidated += 1;
			}
			grouped.set(key, existing);
		});

		const order: Department[] = ['F&A', 'HR', 'Logistics', 'SCM'];
		return Array.from(grouped.values()).sort((a, b) => {
			const deptDiff = order.indexOf(a.department) - order.indexOf(b.department);
			if (deptDiff !== 0) return deptDiff;
			return a.type.localeCompare(b.type);
		});
	}, [filteredRows]);

	const scoreDistribution = useMemo(
		() =>
			SCORE_BUCKETS.map((bucket) => ({
				...bucket,
				count: filteredRows.filter((item) => item.score >= bucket.min && item.score <= bucket.max).length,
			})),
		[filteredRows]
	);

	const total = filteredRows.length;
	const consolidatedCount = filteredRows.filter((item) => item.consolidated).length;
	const notConsolidatedCount = total - consolidatedCount;
	const consolidatedPct = total === 0 ? 0 : Math.round((consolidatedCount / total) * 100);
	const notConsolidatedPct = Math.max(0, 100 - consolidatedPct);

	const maxDeptBar = Math.max(1, ...departmentStats.flatMap((item) => [item.consolidated, item.notConsolidated]));
	const maxScoreBucket = Math.max(1, ...scoreDistribution.map((item) => item.count));

	return (
		<div className="space-y-3 animate-in fade-in duration-500">
			<section className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_16px_rgba(16,42,80,0.07)]">
				<div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
					<div>
						<h1 className="text-2xl font-bold text-[#0F2649]">6x6 Analysis</h1>
						<p className="mt-0.5 text-xs text-[#647D9D]">
							Process consolidation analysis using 6 Performance + 6 Characteristic criteria
						</p>
					</div>

					<select
						value={departmentFilter}
						onChange={(event) => setDepartmentFilter(event.target.value as 'All Departments' | Department)}
						className="h-10 w-full rounded-xl border border-[#C8D7EC] bg-white px-3.5 text-sm font-semibold text-[#2B4467] outline-none focus:border-[#6E97CB] focus:ring-2 focus:ring-[#D7E6F7] md:w-60"
					>
						{departments.map((department) => (
							<option key={department} value={department}>
								{department}
							</option>
						))}
					</select>
				</div>

				<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
					<div className="inline-flex rounded-xl border border-[#DDE7F3] bg-[#F8FBFF] p-1">
						<TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
						<TabButton label="6x6 Matrix" active={activeTab === 'matrix'} onClick={() => setActiveTab('matrix')} />
						<TabButton label="Score Distribution" active={activeTab === 'distribution'} onClick={() => setActiveTab('distribution')} />
					</div>
					{activeTab === 'matrix' && draftRows !== processData && (
						<button
							onClick={saveChanges}
							disabled={isSaving}
							className="rounded-lg bg-[#031F45] px-4 py-2 text-sm font-semibold text-white hover:bg-[#062B5F] disabled:opacity-50"
						>
							{isSaving ? 'Saving...' : 'Save Matrix Scores'}
						</button>
					)}
				</div>
			</section>

			{activeTab === 'overview' && (
				<div className="space-y-3">
					<section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
						<article className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.05)]">
							<h3 className="text-lg font-bold text-[#102846]">Consolidation by Department</h3>
							<div className="mt-3.5 h-56 rounded-xl border border-dashed border-[#E3EBF6] bg-[#FBFDFF] p-3">
								{departmentStats.length === 0 ? (
									<EmptyState />
								) : (
									<div className="flex h-full items-end justify-around gap-3">
										{departmentStats.map((item) => (
											<div key={item.department} className="flex w-full max-w-20 flex-col items-center gap-1.5">
												<div className="flex h-36 w-full items-end justify-center gap-1">
													<div
														className="w-7 rounded-t-md bg-[#2FA497]"
														style={{ height: `${Math.max(6, (item.consolidated / maxDeptBar) * 100)}%` }}
														title={`Consolidated: ${item.consolidated}`}
													/>
													<div
														className="w-7 rounded-t-md bg-[#E72A2A]"
														style={{ height: `${Math.max(6, (item.notConsolidated / maxDeptBar) * 100)}%` }}
														title={`Not Consolidated: ${item.notConsolidated}`}
													/>
												</div>
												<p className="text-xs font-semibold text-[#5D7696]">{item.department}</p>
											</div>
										))}
									</div>
								)}
							</div>
							<div className="mt-2.5 flex items-center gap-3 text-xs font-medium">
								<Legend colorClass="bg-[#2FA497]" label="Consolidate" />
								<Legend colorClass="bg-[#E72A2A]" label="Not Consolidate" />
							</div>
						</article>

						<article className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.05)]">
							<h3 className="text-lg font-bold text-[#102846]">Grand Total</h3>
							<div className="mt-4 flex flex-col items-center gap-2.5">
								<div
									className="h-48 w-48 rounded-full"
									style={{ background: `conic-gradient(#2FA497 ${consolidatedPct}%, #E72A2A ${consolidatedPct}% 100%)` }}
								>
									<div className="m-10 h-28 w-28 rounded-full border border-[#E3EBF7] bg-white" />
								</div>

								<div className="grid w-full grid-cols-2 gap-2.5">
									<div className="rounded-xl border border-[#CFE7E2] bg-[#F2FCF9] p-2.5 text-center">
										<p className="text-xs font-bold uppercase tracking-[0.12em] text-[#4A8E85]">Consolidate</p>
										<p className="mt-1 text-xl font-bold text-[#208777]">{consolidatedPct}%</p>
										<p className="text-xs text-[#5B7A9B]">{consolidatedCount} processes</p>
									</div>
									<div className="rounded-xl border border-[#F0D2D4] bg-[#FFF6F7] p-2.5 text-center">
										<p className="text-xs font-bold uppercase tracking-[0.12em] text-[#BF4347]">Not Consolidate</p>
										<p className="mt-1 text-xl font-bold text-[#CB3136]">{notConsolidatedPct}%</p>
										<p className="text-xs text-[#5B7A9B]">{notConsolidatedCount} processes</p>
									</div>
								</div>

								<p className="text-2xl font-bold text-[#102846]">{total}</p>
								<p className="-mt-1 text-xs text-[#728BA8]">Total Processes</p>
							</div>
						</article>
					</section>

					<section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_5px_14px_rgba(16,42,80,0.05)] overflow-hidden">
						<div className="border-b border-[#E4ECF7] px-4 py-3">
							<h3 className="text-lg font-bold text-[#102846]">Department Summary</h3>
						</div>
						<div className="overflow-x-auto">
							<table className="w-full border-collapse text-left">
								<thead>
									<tr className="bg-[#F5F8FD] text-[10px] font-bold uppercase tracking-[0.13em] text-[#617D9D] border-b border-[#E3EAF4]">
										<th className="px-4 py-2.5">Department</th>
										<th className="px-4 py-2.5">Type</th>
										<th className="px-4 py-2.5">Total</th>
										<th className="px-4 py-2.5">Consolidate</th>
										<th className="px-4 py-2.5">Not Consolidate</th>
									</tr>
								</thead>
								<tbody>
									{summaryRows.length === 0 ? (
										<tr>
											<td colSpan={5} className="px-4 py-7 text-center text-xs text-[#7086A1]">
												No summary rows for this filter.
											</td>
										</tr>
									) : (
										summaryRows.map((item) => (
											<tr key={`${item.department}-${item.type}`} className="border-b border-[#E8EEF7] last:border-b-0">
												<td className="px-4 py-3 text-xs font-semibold text-[#203A5D]">{item.department}</td>
												<td className="px-4 py-3 text-xs text-[#314E72]">{item.type}</td>
												<td className="px-4 py-3 text-xs text-[#314E72]">{item.total}</td>
												<td className="px-4 py-3 text-xs font-semibold text-[#20916E]">{item.consolidated}</td>
												<td className="px-4 py-3 text-xs font-semibold text-[#D24545]">{item.notConsolidated}</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					</section>
				</div>
			)}

			{activeTab === 'matrix' && (
				<section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_5px_14px_rgba(16,42,80,0.05)] overflow-hidden">
					<div className="border-b border-[#E4ECF7] px-4 py-3.5">
						<h3 className="text-xl font-bold text-[#102846]">6x6 Process Matrix</h3>
						<p className="mt-0.5 text-xs text-[#647D9D]">
							6 Performance Criteria (H=consolidation friendly) + 6 Characteristic Criteria (L=consolidation friendly)
						</p>
					</div>

					<div className="overflow-x-auto relative shadow-md sm:rounded-lg">
						<table className="w-full border-collapse text-left min-w-max">
							<thead>
								<tr className="bg-[#F5F8FD] text-xs font-bold text-[#617289] border-b border-[#E3EAF4]">
									<th className="px-3 py-2.5 sticky left-0 z-20 bg-[#F5F8FD] shadow-[1px_0_0_#E3EAF4]">Process</th>
									{Object.entries(PERFORMANCE_LABELS).map(([label, fullName]) => (
										<th key={`p-${label}`} title={fullName} className="px-2 py-2.5 text-center text-[#2860D3] cursor-help border-x border-[#F0F4F9]">{label}</th>
									))}
									{Object.entries(CHARACTERISTIC_LABELS).map(([label, fullName], index) => (
										<th key={`c-${label}-${index}`} title={fullName} className="px-2 py-2.5 text-center text-[#7A39DB] cursor-help border-x border-[#F0F4F9]">{label}</th>
									))}
									<th className="px-3 py-2.5 text-center">Score</th>
									<th className="px-3 py-2.5 text-center">Cons</th>
								</tr>
							</thead>
							<tbody>
								{filteredRows.length === 0 ? (
									<tr>
										<td colSpan={15} className="px-4 py-7 text-center text-xs text-[#7086A1]">
											No process rows available for this department.
										</td>
									</tr>
								) : (
									filteredRows.map((item) => (
										<tr key={item.process} className="border-b border-[#E8EEF7] last:border-b-0">
											<td className="px-3 py-3 sticky left-0 z-10 bg-white shadow-[1px_0_0_#E3EAF4]">
												<p className="max-w-82 truncate text-xs font-semibold text-[#1E304B]">{item.process}</p>
												<p className="text-xs text-[#7086A1]">{item.department}</p>
											</td>

											{item.criteria.map((value, index) => (
												<td key={`${item.process}-${index}`} className="px-2 py-2.5 text-center">
													<button
														type="button"
														onClick={() => handleCriteriaToggle(item.process, index)}
														className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold transition-all hover:ring-2 hover:ring-offset-1 hover:ring-[#E3EAF4] ${
															value === 'H'
																? 'bg-emerald-100 text-emerald-700'
																: value === 'M'
																	? 'bg-amber-100 text-amber-700'
																	: value === 'L'
																		? 'bg-red-100 text-red-700'
																		: 'bg-slate-100 text-slate-400'
														}`}
													>
														{value}
													</button>
												</td>
											))}

											<td className="px-3 py-2.5 text-center text-xl font-bold text-[#1A2E4D]">{item.score}</td>
											<td className="px-3 py-2.5 text-center">
												<span
													className={`inline-flex min-w-10 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
														item.consolidated ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
													}`}
												>
													{item.consolidated ? 'Y' : 'N'}
												</span>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</section>
			)}

			{activeTab === 'distribution' && (
				<section className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.05)]">
					<h3 className="text-xl font-bold text-[#102846]">Score Distribution</h3>
					<p className="mt-0.5 text-xs text-[#647D9D]">Distribution of process score bands for selected department</p>

					<div className="mt-3.5 rounded-xl border border-dashed border-[#E3EBF6] bg-[#FBFDFF] p-3">
						<div className="flex h-64 items-end justify-between gap-2.5">
							{scoreDistribution.map((bucket) => (
								<div key={bucket.label} className="flex w-full flex-col items-center gap-1.5">
									<div className="flex h-48 w-full items-end justify-center">
										<div
											className="w-full max-w-24 rounded-t-md bg-[#324ABF]"
											style={{ height: `${Math.max(4, (bucket.count / maxScoreBucket) * 100)}%` }}
											title={`${bucket.label}: ${bucket.count}`}
										/>
									</div>
									<p className="text-xs font-semibold text-[#617289]">{bucket.label}</p>
									<p className="-mt-1 text-xs text-[#7E94AF]">{bucket.count}</p>
								</div>
							))}
						</div>
					</div>
				</section>
			)}
		</div>
	);
}



function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
				active ? 'bg-white text-[#1B2F4F] shadow-[0_2px_8px_rgba(15,38,73,0.14)]' : 'text-[#687F9B] hover:text-[#425C7D]'
			}`}
		>
			{label}
		</button>
	);
}

function Legend({ colorClass, label }: { colorClass: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5 text-xs text-[#446182]">
			<span className={`h-2.5 w-2.5 rounded-sm ${colorClass}`} />
			{label}
		</span>
	);
}

function EmptyState() {
	return (
		<div className="flex h-full items-center justify-center text-xs text-[#8AA0BA]">
			No data for selected department
		</div>
	);
}
