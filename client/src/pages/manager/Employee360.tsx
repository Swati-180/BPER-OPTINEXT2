import { useMemo } from 'react';
import { MapPin, ShieldCheck } from 'lucide-react';
import { demoEmployeeProfile } from '../employee/demoEmployeeData';
import { formatDateISO, loadBperSubmissions } from '../employee/bperSubmissionStorage';

type FitmentParameter = {
	parameter: string;
	response: string;
	score: number;
	weight: number;
};

const DEFAULT_BPER_ROWS = [
	{ majorProcess: 'Operational', process: 'Validate Vendor Invoice', subProcess: 'Activity from latest submission', hours: 88 },
	{ majorProcess: 'Operational', process: 'Post Invoice In ERP', subProcess: 'Activity from latest submission', hours: 56 },
	{ majorProcess: 'Operational', process: 'Monthly accrual reconciliations', subProcess: 'Activity from latest submission', hours: 20 },
];

const FITMENT_PARAMETERS: FitmentParameter[] = [
	{ parameter: 'PMS Rating', response: 'Exceeds Expectations', score: 5, weight: 5 },
	{ parameter: 'Complexity of Work', response: 'Requires more stakeholders and analytical effort', score: 4, weight: 10 },
	{ parameter: 'Change Readiness', response: 'Volunteers with improvement ideas', score: 4, weight: 10 },
	{ parameter: 'Service Orientation', response: 'Win-win stakeholder alignment', score: 5, weight: 10 },
	{ parameter: 'Team Player & Collaboration', response: 'Appreciates consensus and strengths', score: 4, weight: 8 },
	{ parameter: 'Location Preference', response: 'May be amenable to relocate', score: 3.5, weight: 5 },
	{ parameter: 'Additional Qualifications', response: 'Relevant certifications for role', score: 5, weight: 9 },
	{ parameter: 'Experience in Current Role', response: 'More than 8 years', score: 5, weight: 10 },
	{ parameter: 'Total Work Experience', response: 'Between 5 to 8 years', score: 3, weight: 6 },
	{ parameter: 'Current CTC', response: 'Below median for role', score: 4, weight: 5 },
	{ parameter: 'Multiplexer', response: 'Juggles multiple responsibilities', score: 4, weight: 7 },
	{ parameter: 'Communicativeness', response: 'Communicates and seeks alignment', score: 5, weight: 7 },
	{ parameter: 'Self Motivated', response: 'Works independently with minimum follow-up', score: 5, weight: 8 },
];

const PROCESS_RISK_CARDS = [
	{
		title: 'Inter-company reconciliations',
		level: 'High Risk',
		score: 92,
		consolidate: 'Y',
		note: 'Process shows 80%+ repetitiveness and high digital footprint. Recommended for immediate RPA migration.',
		tone: 'high' as const,
	},
	{
		title: 'Regulatory Filing',
		level: 'Standard',
		score: 44,
		consolidate: 'N',
		note: 'High complexity and manual oversight required by MAS regulations. Not feasible for consolidation.',
		tone: 'standard' as const,
	},
	{
		title: 'Budget Forecasting',
		level: 'Standard',
		score: 58,
		consolidate: 'N',
		note: 'Requires cross-functional context, scenario modelling, and frequent executive judgement.',
		tone: 'standard' as const,
	},
];

function formatReviewDate(value: string | null) {
	if (!value) return '-';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '-';
	return date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Employee360Page() {
	const { employeeId } = useParams<{ employeeId: string }>();
	const [profile, setProfile] = useState<any>(null);
	const [fitment, setFitment] = useState<any>(null);
	const [submissions, setSubmissions] = useState<BperSubmissionRecord[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		async function fetchData() {
			if (!employeeId) return;
			setIsLoading(true);
			try {
				const token = localStorage.getItem('bper.auth.token');
				
				// Fetch Profile (Searching by employeeId)
				const usersRes = await fetch(`http://localhost:5000/api/auth/users?employeeId=${employeeId}`, {
					headers: { 'Authorization': `Bearer ${token}` }
				});
				const users = await usersRes.json();
				const targetProfile = Array.isArray(users) ? users.find(u => u.employeeId === employeeId) : null;
				setProfile(targetProfile);

				// Fetch Fitment
				const fitmentRes = await fetch(`http://localhost:5000/api/fitment/${employeeId}`, {
					headers: { 'Authorization': `Bearer ${token}` }
				});
				if (fitmentRes.ok) {
					setFitment(await fitmentRes.json());
				}

				// Fetch Submissions
				const subs = await loadBperSubmissions();
				setSubmissions(subs.filter(s => s.employee.employeeId === employeeId));

			} catch (error) {
				console.error('Failed to load Employee 360 data:', error);
			} finally {
				setIsLoading(false);
			}
		}
		fetchData();
	}, [employeeId]);

	const bperRows = useMemo(() => {
		const latest = submissions[0];
		const rows = latest?.payload.rows ?? [];
		if (rows.length === 0) return DEFAULT_BPER_ROWS;

		return rows.slice(0, 3).map((row) => ({
			majorProcess: 'Operational',
			process: row.subProcess || row.process || '-',
			subProcess: 'Activity from latest submission',
			hours: Number(row.timeTakenHoursPerMonth || 0),
		}));
	}, [submissions]);

	const totalWeeklyHours = bperRows.reduce((sum, item) => sum + item.hours, 0);

	const weightedFitmentScore = fitment?.weightedScore ?? 0;
	const fitmentLabel = fitment?.fitmentLabel ?? 'UNFIT';
	const fitmentParameters = fitment?.parameters ?? [];

	const efficiencyRating = submissions[0]?.status === 'Approved' ? '100.0%' : '86.0%';
	const ratingDelta = submissions[0]?.status === 'Approved' ? '+2.4' : '+1.1';
	const lastEvaluationDate = formatReviewDate(
		submissions[0]?.reviewHistory[0]?.reviewedAt ?? submissions[0]?.submittedAt ?? null
	);

	const latestStatus = submissions[0]?.status ?? 'Under Review';

	if (isLoading) {
		return (
			<div className="flex h-96 items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-[#1A5CA8]" />
			</div>
		);
	}

	return (
		<div className="space-y-3 animate-in fade-in duration-500">
			<section className="rounded-2xl border border-[#D9E4F2] bg-white p-3.5 shadow-[0_5px_14px_rgba(16,42,80,0.07)]">
				<div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr] lg:items-center">
					<div className="flex items-start gap-3.5">
						<div className="h-20 w-20 rounded-2xl border border-[#D7E4F5] bg-[#EAF4FF] shadow-[0_3px_8px_rgba(18,62,115,0.12)] flex items-center justify-center text-5xl">
							👨‍💼
						</div>
						<div className="space-y-1">
							<div className="flex items-center gap-2.5">
								<h1 className="text-3xl font-bold text-[#0F2649]">{profile?.name || 'User not found'}</h1>
								<span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold tracking-[0.12em] ${profile?.isActive ? 'bg-[#E7F7EE] text-[#15935A]' : 'bg-gray-100 text-gray-500'}`}>
									{profile?.isActive ? 'ACTIVE' : 'INACTIVE'}
								</span>
							</div>

							<p className="text-base text-[#4E6787]">{profile?.band} {profile?.designation}</p>

							<div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#7A92AF]">
								<span className="inline-flex items-center gap-1 rounded-lg bg-[#F3F7FC] px-3 py-1"># {profile?.employeeId}</span>
								<span className="inline-flex items-center gap-1 rounded-lg bg-[#F3F7FC] px-3 py-1">
									<MapPin className="h-3.5 w-3.5" /> {profile?.client || 'BPER'}
								</span>
							</div>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-2.5 border-l border-[#E5EDF8] pl-3.5">
						<MetricCard
							label="Efficiency Rating"
							value={efficiencyRating}
							helper={ratingDelta}
							helperTone="positive"
						/>
						<MetricCard label="Last Evaluation" value={lastEvaluationDate} helper={formatDateISO(latestSubmission?.submittedAt ?? '')} helperTone="default" />
					</div>
				</div>
			</section>

			<section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_5px_14px_rgba(16,42,80,0.05)] overflow-hidden">
				<div className="flex flex-col gap-1.5 border-b border-[#E4ECF7] px-4 py-3.5 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 className="text-2xl font-bold text-[#102846]">BPER Summary</h2>
						<p className="mt-0.5 text-xs text-[#617C9E]">Business Process Execution Record for current fiscal cycle</p>
					</div>
					<div className="inline-flex items-center gap-2 text-xs font-medium text-[#556F91]">
						Latest Submission:
						<span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
							latestStatus === 'Approved'
								? 'bg-emerald-100 text-emerald-700 border-emerald-200'
								: latestStatus === 'Changes Requested'
									? 'bg-amber-100 text-amber-700 border-amber-200'
									: 'bg-blue-100 text-blue-700 border-blue-200'
						}`}>
							{latestStatus.toUpperCase()}
						</span>
					</div>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-left">
						<thead>
							<tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.12em] text-[#738BA9] border-b border-[#E3EAF4]">
								<th className="px-4 py-2.5">Major Process</th>
								<th className="px-4 py-2.5">Process</th>
								<th className="px-4 py-2.5">Sub Process</th>
								<th className="px-4 py-2.5 text-right">Weekly Hours</th>
							</tr>
						</thead>
						<tbody>
							{bperRows.map((item, index) => (
								<tr key={`${item.process}-${index}`} className="border-b border-[#E8EEF7] last:border-b-0">
									<td className="px-4 py-3 text-xs font-semibold text-[#1A5CA8]">{item.majorProcess}</td>
									<td className="px-4 py-3 text-xs text-[#1E304B]">{item.process}</td>
									<td className="px-4 py-3 text-xs italic text-[#6C83A0]">{item.subProcess}</td>
									<td className="px-4 py-3 text-right text-base font-bold text-[#102846]">{item.hours.toFixed(1)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="flex justify-end bg-[#F3F8FF] px-4 py-2.5 border-t border-[#E5EDF8]">
					<p className="text-xs font-bold tracking-[0.11em] text-[#1A5CA8] uppercase">
						Total Weekly Hours
						<span className="ml-3 text-2xl normal-case tracking-normal">{totalWeeklyHours.toFixed(1)}</span>
					</p>
				</div>
			</section>

			<section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.25fr_1fr]">
				<article className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_5px_14px_rgba(16,42,80,0.05)] overflow-hidden">
					<div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-[#E4ECF7] px-4 py-3.5">
						<div>
							<h3 className="text-2xl font-bold text-[#102846]">Fitment Profile</h3>
							<p className="mt-0.5 text-xs text-[#617C9E]">Mechanical fitment and competency mapping score</p>
						</div>
						<div className="text-right">
							<p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8AA0BA]">Weighted Score</p>
							<p className="text-3xl font-bold text-[#1A5CA8]">{weightedFitmentScore}</p>
							<p className="text-xs text-[#7B92AD]">/100</p>
							<span className="inline-flex rounded-md bg-[#E4F0FF] px-3 py-1 text-sm font-bold text-[#1D5AA9]">{fitmentLabel}</span>
						</div>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full border-collapse text-left">
							<thead>
								<tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.12em] text-[#738BA9] border-b border-[#E3EAF4]">
									<th className="px-4 py-2.5">Parameter</th>
									<th className="px-4 py-2.5">Response</th>
									<th className="px-4 py-2.5 text-center">Score</th>
									<th className="px-4 py-2.5 text-right">Weighted</th>
								</tr>
							</thead>
							<tbody>
								{fitmentParameters.length === 0 ? (
									<tr>
										<td colSpan={4} className="px-4 py-8 text-center text-sm text-[#6B829E]">
											No fitment parameters mapped for this employee.
										</td>
									</tr>
								) : (
									<>
									{fitmentParameters.map((item: any) => {
									const weighted = Number(((item.score / 5) * item.weight).toFixed(1));
									return (
										<tr key={item.parameter} className="border-b border-[#E8EEF7] last:border-b-0">
											<td className="px-4 py-3 text-xs font-semibold text-[#1E304B]">{item.parameter}</td>
											<td className="px-4 py-3 text-xs text-[#4F6785]">{item.response}</td>
											<td className="px-4 py-3 text-center text-xs font-semibold text-[#16925E]">{item.score}/5</td>
											<td className="px-4 py-3 text-right text-xs font-bold text-[#1D5AA9]">{weighted.toFixed(1)}</td>
										</tr>
									);
									})}
									</>
								)}
							</tbody>
						</table>
					</div>
				</article>

				<article className="space-y-2.5">
					<div>
						<h3 className="text-2xl font-bold text-[#102846]">Process Risk</h3>
						<p className="mt-0.5 text-xs text-[#617C9E]">Automation and consolidation feasibility</p>
					</div>

					{PROCESS_RISK_CARDS.map((card) => (
						<div
							key={card.title}
							className={`rounded-2xl border p-4 shadow-[0_5px_14px_rgba(16,42,80,0.06)] ${
								card.tone === 'high'
									? 'border-[#F0D9B3] bg-[#FFF7E8]'
									: 'border-[#DCE7F4] bg-white'
							}`}
						>
							<div className="flex items-start justify-between gap-3">
								<h4 className="text-xl font-bold text-[#1E304B]">{card.title}</h4>
								<span className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${
									card.tone === 'high' ? 'bg-[#8A430A] text-white' : 'bg-[#E7EDF7] text-[#5D7696]'
								}`}>
									{card.level}
								</span>
							</div>

							<div className="mt-3 grid grid-cols-2 gap-3 border-b border-[#E9E3D7] pb-2.5">
								<div>
									<p className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#8A6B4F]">Score</p>
									<p className="text-3xl font-bold text-[#0F2649]">{card.score}%</p>
								</div>
								<div className="text-right">
									<p className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#8A6B4F]">Consolidate</p>
									<p className="text-3xl font-bold text-[#8A430A]">{card.consolidate}</p>
								</div>
							</div>

							<p className="mt-2.5 text-xs italic text-[#6D7F95]">{card.note}</p>
						</div>
					))}

						<div className="relative overflow-hidden rounded-2xl border border-[#1E4F92] bg-[#184C89] p-3.5 shadow-[0_7px_18px_rgba(11,39,82,0.24)]">
						<ShieldCheck className="absolute -right-5 -bottom-5 h-28 w-28 text-[#2A5EA4]/35" />
							<h4 className="text-2xl font-bold text-white">Risk Insight</h4>
							<p className="mt-1.5 text-sm leading-relaxed text-[#D8E7FF]">
							{profile?.name} spends {efficiencyRating} of effort on activities that align with their core competencies. Optimized role evolution involves transitioning more responsibility toward {fitmentLabel} areas.
						</p>
						<button
							type="button"
								className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-[#3365AA] bg-[#1E4F92] px-4 py-2 text-[11px] font-bold tracking-[0.14em] uppercase text-[#DCEAFF] hover:bg-[#23589F]"
						>
							Full Library Look-up
						</button>
					</div>
				</article>
			</section>
		</div>
	);
}

function MetricCard({
	label,
	value,
	helper,
	helperTone,
}: {
	label: string;
	value: string;
	helper: string;
	helperTone: 'positive' | 'default';
}) {
	return (
		<div className="rounded-xl border border-[#E1EAF7] bg-[#FBFDFF] p-2.5">
			<p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8AA0BA]">{label}</p>
			<p className="mt-1 text-3xl font-bold text-[#0F2649]">{value}</p>
			<p
				className={`mt-0.5 text-[11px] font-bold ${
					helperTone === 'positive' ? 'text-[#1E9C60]' : 'text-[#7B92AD]'
				}`}
			>
				{helperTone === 'positive' ? `↑${helper}` : helper}
			</p>
		</div>
	);
}
