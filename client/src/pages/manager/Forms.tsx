import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Flag, Printer, X, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
	applyManagerReviewToSubmission,
	loadBperSubmissions,
	type BperSubmissionRecord,
} from '../employee/bperSubmissionStorage';

type QueueTab = 'pending' | 'history';

type PendingUserApproval = {
	id: string;
	name: string;
	email: string;
	requestedRole: 'Employee';
};

const initialPendingUserApprovals: PendingUserApproval[] = [];

function reviewBadgeClass(status: BperSubmissionRecord['status']) {
	if (status === 'Approved') return 'border-emerald-200 bg-emerald-100 text-emerald-800';
	if (status === 'Changes Requested') return 'border-amber-300 bg-amber-100 text-amber-800';
	return 'border-blue-200 bg-blue-100 text-blue-800';
}

function initialsOf(name: string) {
	return name
		.split(' ')
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');
}

export default function FormsPage() {
	const [refreshTick, setRefreshTick] = useState(0);
	const [activeTab, setActiveTab] = useState<QueueTab>('pending');
	const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
	const [flagRowIndex, setFlagRowIndex] = useState<number | null>(null);
	const [flagDraft, setFlagDraft] = useState('');
	const [savedFlags, setSavedFlags] = useState<Record<string, { rowIndex: number; note: string }[]>>({});
	const [pendingUserApprovals, setPendingUserApprovals] = useState<PendingUserApproval[]>(initialPendingUserApprovals);
	const [managerProfile, setManagerProfile] = useState<any>(null);
	const [allSubmissions, setAllSubmissions] = useState<BperSubmissionRecord[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
	const [reviewStatus, setReviewStatus] = useState<'Approved' | 'Changes Requested' | 'Grant Edit'>('Approved');
	const [reviewComment, setReviewComment] = useState('');

	const [isMutating, setIsMutating] = useState(false);

	useEffect(() => {
		async function init() {
			setIsLoading(true);
			try {
				const profileRes = await apiFetch('/auth/me');
				if (profileRes.ok) {
					const profileData = await profileRes.json();
					setManagerProfile(profileData);
					
					// Fetch pending users if admin/manager
					if (profileData.role === 'admin' || profileData.userType === 'manager') {
						const usersRes = await apiFetch('/auth/users');
						if (usersRes.ok) {
							const users = await usersRes.json();
							const pending = users.filter((u: any) => u.status === 'pending' || !u.isActive);
							setPendingUserApprovals(pending.map((u: any) => ({
								id: u._id,
								name: u.name,
								email: u.email,
								requestedRole: u.requestedRole || 'Employee'
							})));
						}
					}
				}

				// Fetch Submissions
				const subsData = await loadBperSubmissions();
				setAllSubmissions(subsData);
			} catch (error) {
				console.error('Forms init failed:', error);
			} finally {
				setIsLoading(false);
			}
		}
		init();
	}, [refreshTick]);

	const pendingQueue = useMemo(
		() => allSubmissions.filter((record) => record.status === 'Under Review'),
		[allSubmissions]
	);

	const historyQueue = useMemo(
		() => allSubmissions.filter((record) => record.status !== 'Under Review'),
		[allSubmissions]
	);

	const activeQueue = activeTab === 'pending' ? pendingQueue : historyQueue;

	const selectedRecord = useMemo(() => {
		if (!activeQueue.length) return null;
		const match = activeQueue.find((record) => record.referenceId === selectedReferenceId);
		return match || activeQueue[0];
	}, [activeQueue, selectedReferenceId]);

	useEffect(() => {
		if (!selectedRecord) return;
		setSelectedReferenceId(selectedRecord.referenceId);
	}, [selectedRecord?.referenceId]);

	const selectedRows = selectedRecord?.payload.rows ?? [];
	const selectedFlags = selectedRecord ? savedFlags[selectedRecord.referenceId] ?? [] : [];
	const flaggedCount = selectedFlags.length;
	const totalHours = selectedRows.reduce((sum, row) => sum + Number(row.timeTakenHoursPerMonth || 0), 0);
	const canReviewSelected = Boolean(selectedRecord && activeTab === 'pending' && selectedRecord.status === 'Under Review');
	const canUnlockSelected = Boolean(selectedRecord && activeTab === 'history' && selectedRecord.status === 'Approved');
	const latestReviewComment = selectedRecord?.reviewHistory[0]?.comment ?? '';

	function refreshQueue() {
		setFlagRowIndex(null);
		setFlagDraft('');
		setReviewComment('');
		setIsReviewModalOpen(false);
		setRefreshTick((prev) => prev + 1);
	}

	useEffect(() => {
		if (!canReviewSelected) {
			setFlagRowIndex(null);
			setFlagDraft('');
		}
	}, [canReviewSelected]);

	function openReviewModal(status: 'Approved' | 'Changes Requested' | 'Grant Edit') {
		setReviewStatus(status);
		// Pre-fill with a summary of flags if any
		if (status === 'Changes Requested' && flaggedCount > 0) {
			const summary = selectedFlags.map(f => `Row ${f.rowIndex + 1}: ${f.note}`).join('\n');
			setReviewComment(`Please address the following items:\n${summary}`);
		} else if (status === 'Grant Edit') {
			setReviewComment('Edit access is granted. Please finish updating your submission.');
		} else {
			setReviewComment('');
		}
		setIsReviewModalOpen(true);
	}

	async function submitReview() {
		if (!selectedRecord || !managerProfile) return;
		setIsMutating(true);
		
		const commentPrefix = flaggedCount > 0 && reviewStatus === 'Changes Requested' 
			? `[System] Returned with ${flaggedCount} flags attached.\n` 
			: '';
			
		const finalComment = reviewComment.trim() || (reviewStatus === 'Approved' ? 'Submission approved.' : reviewStatus === 'Changes Requested' ? 'Changes requested.' : 'Edit access granted.');
			
		await applyManagerReviewToSubmission({
			referenceId: selectedRecord.referenceId,
			status: reviewStatus,
			comment: commentPrefix + finalComment,
			managerName: managerProfile.name,
		});
		
		setIsMutating(false);
		refreshQueue();
	}

	function saveFlag() {
		if (!selectedRecord || flagRowIndex === null || !flagDraft.trim()) return;

		setSavedFlags((prev) => {
			const existing = prev[selectedRecord.referenceId] ?? [];
			const nextForRecord = existing.some((item) => item.rowIndex === flagRowIndex)
				? existing.map((item) =>
						item.rowIndex === flagRowIndex ? { rowIndex: flagRowIndex, note: flagDraft.trim() } : item
					)
				: [...existing, { rowIndex: flagRowIndex, note: flagDraft.trim() }];
			return {
				...prev,
				[selectedRecord.referenceId]: nextForRecord,
			};
		});

		setFlagDraft('');
		setFlagRowIndex(null);
	}

	async function resolvePendingUserApproval(id: string, activate: boolean) {
		try {
			setIsMutating(true);
			await apiFetch('/auth/users/bulk-update', {
				method: 'POST',
				body: JSON.stringify({
					userIds: [id],
					action: activate ? 'activate' : 'deactivate',
					role: activate ? 'employee' : undefined
				})
			});
			if (activate) {
				// We also need to set their status to active! We can do it broadly or let backend handle it, 
				// The authController sets isActive: true on activate
			}
			setPendingUserApprovals((prev) => prev.filter((item) => item.id !== id));
		} catch (error) {
			console.error("Failed to approve user", error);
		} finally {
			setIsMutating(false);
		}
	}

	return (
		<div className="space-y-4 animate-in fade-in duration-500">
			{isLoading ? (
				<div className="flex h-96 items-center justify-center rounded-2xl border border-[#D9E4F2] bg-white shadow-sm">
					<Loader2 className="h-10 w-10 animate-spin text-[#1A5BA7]" />
				</div>
			) : (
			<section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_6px_18px_rgba(16,42,80,0.08)] overflow-hidden">
				<div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
					<aside className="border-r border-[#DDE7F3] bg-[#F8FBFF]">
						<div className="px-4 py-3 border-b border-[#E1EAF6]">
							<h1 className="text-2xl font-bold text-[#0F2649]">Review Queue</h1>
							<p className="mt-0.5 text-xs font-semibold text-[#8CA0BA]">Team Submissions</p>
						</div>

						<div className="flex border-b border-[#E1EAF6]">
							<button
								type="button"
								onClick={() => setActiveTab('pending')}
								className={`flex-1 px-3 py-2.5 text-sm font-semibold transition-colors ${
									activeTab === 'pending'
										? 'text-[#1A5BA7] border-b-3 border-[#1A5BA7] bg-white'
										: 'text-[#8A9FB9] hover:text-[#5E7898]'
								}`}
							>
								Pending ({pendingQueue.length})
							</button>
							<button
								type="button"
								onClick={() => setActiveTab('history')}
								className={`flex-1 px-3 py-2.5 text-sm font-semibold transition-colors ${
									activeTab === 'history'
										? 'text-[#1A5BA7] border-b-3 border-[#1A5BA7] bg-white'
										: 'text-[#8A9FB9] hover:text-[#5E7898]'
								}`}
							>
								History
							</button>
						</div>

						<div className="space-y-2.5 p-2.5">
							{activeQueue.length === 0 ? (
								<div className="rounded-xl border border-[#DCE6F3] bg-white px-3 py-4 text-xs text-[#7086A1]">
									No submissions in this queue.
								</div>
							) : (
								activeQueue.map((record) => (
									<button
										key={record.referenceId}
										type="button"
										onClick={() => setSelectedReferenceId(record.referenceId)}
										className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
											selectedRecord?.referenceId === record.referenceId
												? 'border-[#B7CBE7] bg-white shadow-[0_4px_12px_rgba(16,42,80,0.08)]'
												: 'border-[#DDE7F3] bg-white hover:border-[#BCD1EB]'
										}`}
									>
										<div className="flex items-center gap-2.5">
											<div className="h-8 w-8 rounded-full bg-[#E8EEF7] text-[#5C7597] text-xs font-bold flex items-center justify-center">
												{initialsOf(record.employee.name)}
											</div>
											<div>
												<p className="text-base font-bold text-[#102846]">{record.employee.name}</p>
												<p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#8CA0BA]">{record.employee.title || 'Employee'}</p>
											</div>
										</div>

										<span
											className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest ${reviewBadgeClass(record.status)}`}
										>
											{record.status === 'Approved' ? 'Final Approval Granted' : record.status}
										</span>

										<p className="mt-2 text-xs italic text-[#6F86A4] line-clamp-2">
											{record.payload.rows[0]?.comments || 'Awaiting manager review comments.'}
										</p>
									</button>
								))
							)}
						</div>
					</aside>

					<div className="bg-[#F4F8FD]">
						{selectedRecord ? (
							<>
								<div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#E1EAF6]">
									<div>
										<h2 className="text-2xl font-bold text-[#1C5FA8]">WDT Detailed Analysis</h2>
										<p className="mt-1 text-sm text-[#5D789A]">Employee: {selectedRecord.employee.name}</p>
									</div>
									<div className="flex gap-2">
										<button type="button" className="h-9 w-9 rounded-lg border border-[#D2DEED] bg-white text-[#6D85A5] flex items-center justify-center hover:bg-[#F7FAFF]">
											<Printer className="h-4 w-4" />
										</button>
										<button type="button" className="h-9 w-9 rounded-lg border border-[#D2DEED] bg-white text-[#6D85A5] flex items-center justify-center hover:bg-[#F7FAFF]">
											<Download className="h-4 w-4" />
										</button>
									</div>
								</div>

								<div className="space-y-2.5 px-5 py-4">
									{selectedRows.map((row, index) => {
										const isFlagOpen = canReviewSelected && flagRowIndex === index;
										const savedRowFlag = selectedFlags.find((item) => item.rowIndex === index);

										return (
											<div key={`${row.process}-${row.subProcess}-${index}`} className="overflow-hidden rounded-xl border border-[#DCE6F3] bg-white">
												<div className="flex items-start justify-between gap-4 px-4 py-3.5">
													<div>
														<p className="text-lg font-bold text-[#1E5EA9]">{row.subProcess || row.process}</p>
														<p className="mt-0.5 text-sm text-[#3E5778]">{row.process || row.majorProcess}</p>
													</div>
													<div className="flex items-center gap-3">
														<p className="text-2xl font-bold text-[#0F2242]">{Number(row.timeTakenHoursPerMonth || 0).toFixed(1)}</p>
														{canReviewSelected ? (
															<button
																type="button"
																onClick={() => {
																	setFlagRowIndex(index);
																	setFlagDraft(savedRowFlag?.note ?? '');
																}}
																className={`rounded-md p-1.5 transition-colors ${isFlagOpen || savedRowFlag ? 'text-red-500' : 'text-[#B8C6D8] hover:text-[#7E95B1]'}`}
																aria-label="Flag task"
															>
																<Flag className="h-4 w-4" />
															</button>
														) : (
															<span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
																Reviewed
															</span>
														)}
													</div>
												</div>

												{savedRowFlag && !isFlagOpen && (
													<div className="border-t border-[#F2D3D7] bg-[#FFF6F7] px-4 py-2.5">
														<p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#C42E2F]">Saved Flag</p>
														<p className="mt-1 text-xs text-[#8A3E49]">{savedRowFlag.note}</p>
													</div>
												)}

												{isFlagOpen && (
													<div className="border-t border-[#F0C3C7] bg-[#FFF3F4] px-4 py-3">
														<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#C42E2F]">Supervisor Revision Request</p>
														<textarea
															value={flagDraft}
															onChange={(event) => setFlagDraft(event.target.value)}
															placeholder="Please clarify if this coordination included the weekend surge shift..."
															className="mt-2.5 h-20 w-full resize-none rounded-xl border border-[#F2C5CA] bg-white px-3 py-2.5 text-xs text-[#4C627E] outline-none focus:border-[#E79AA4] focus:ring-2 focus:ring-[#FAD9DE]"
														/>
														<div className="mt-2.5 flex items-center justify-end gap-3">
															<button type="button" onClick={() => setFlagRowIndex(null)} className="text-xs font-semibold text-[#6E829D] hover:text-[#4D6380]">
																Discard
															</button>
															<button
																type="button"
																onClick={saveFlag}
																className="rounded-lg bg-[#E92D2D] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#CF2424]"
															>
																Save Flag
															</button>
														</div>
													</div>
												)}
											</div>
										);
									})}

									<div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
										<div className="rounded-xl border border-[#DDE7F3] bg-white p-4">
											<p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8FA4BE]">Self-Assessment Narrative</p>
											<p className="mt-2.5 text-sm text-[#3E5878]">{selectedRows[0]?.comments || 'No comments provided.'}</p>
										</div>
										<div className="rounded-xl border border-[#DDE7F3] bg-white p-4 flex items-center justify-center text-center">
											<p className="text-sm text-[#97AABF]">No additional documents attached.</p>
										</div>
									</div>
								</div>

								<div className="border-t border-[#DFE8F4] bg-white px-5 py-3.5">
									<div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
										<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-y-4 gap-x-3 items-center">
											<Metric label="Total Hours" value={totalHours.toFixed(1)} accent="text-[#0F2444]" />
											<Metric label="Flags Raised" value={String(flaggedCount).padStart(2, '0')} accent="text-[#D92D2D]" />
											<Metric label="Avg Turnaround" value={`${selectedRows.length ? (totalHours / selectedRows.length).toFixed(1) : '0.0'}h`} accent="text-[#0F2444]" />
											<Metric label="Submission Rate" value="100%" accent="text-[#0F2444]" />
											<Metric label="Team Compliance" value="50%" accent="text-[#169F54]" />
										</div>

										{canReviewSelected ? (
											<div className="flex flex-wrap items-center justify-end gap-2.5">
												<button
													type="button"
													onClick={() => openReviewModal('Grant Edit')}
													className="rounded-xl border border-[#CFDBEB] bg-white px-4 py-2.5 text-sm font-semibold text-[#374F70] hover:bg-[#F7FAFF]"
												>
													Grant Edit
												</button>
												<button
													type="button"
													onClick={() => openReviewModal('Changes Requested')}
													className="rounded-xl border border-[#CFDBEB] bg-white px-4 py-2.5 text-sm font-semibold text-[#374F70] hover:bg-[#F7FAFF]"
												>
													Return for Revision
												</button>
												<button
													type="button"
													onClick={() => openReviewModal('Approved')}
													className="inline-flex items-center gap-2 rounded-xl bg-[#031F45] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#062B5F]"
												>
													<Check className="h-4 w-4" />
													Complete Review
												</button>
											</div>
										) : canUnlockSelected ? (
											<div className="flex flex-wrap items-center justify-end gap-2.5">
												<div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
													<span className="font-semibold">Review Completed:</span>{' '}
													Approved
													{latestReviewComment ? ` · ${latestReviewComment}` : ''}
												</div>
												<button
													type="button"
													onClick={() => openReviewModal('Grant Edit')}
													className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100"
												>
													Unlock / Grant Edit
												</button>
											</div>
										) : (
											<div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
												<span className="font-semibold">Review Completed:</span>{' '}
												{selectedRecord.status === 'Approved' ? 'Approved' : 'Returned for Revision'}
												{latestReviewComment ? ` · ${latestReviewComment}` : ''}
											</div>
										)}
									</div>
								</div>
							</>
						) : (
							<div className="px-8 py-12 text-[#7087A2]">No forms available to review right now.</div>
						)}
					</div>
				</div>
			</section>
			)}

			{isReviewModalOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
					<div className="w-full max-w-lg rounded-2xl border border-[#DDE7F3] bg-white shadow-2xl">
						<div className="flex items-center justify-between border-b border-[#E1EAF6] px-6 py-4">
							<h3 className="text-xl font-bold text-[#102846]">Confirm {reviewStatus}</h3>
							<button onClick={() => setIsReviewModalOpen(false)} className="text-[#8CA0BA] hover:text-[#5C7597]">
								<X size={20} />
							</button>
						</div>
						<div className="p-6">
							<p className="text-sm text-[#4D6380]">
								You are about to {reviewStatus === 'Approved' ? 'approve' : reviewStatus === 'Changes Requested' ? 'request changes for' : 'grant edit access to'} <strong>{selectedRecord?.employee.name}'s</strong> submission.
							</p>
							<div className="mt-4">
								<label className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8FA4BE]">
									Review Comments / Guidance
								</label>
								<textarea
									value={reviewComment}
									onChange={(e) => setReviewComment(e.target.value)}
									placeholder="Add general comments or specific instructions..."
									className="mt-2 h-32 w-full resize-none rounded-xl border border-[#CFDBEB] p-3 text-sm outline-none focus:border-[#1A5BA7] focus:ring-2 focus:ring-[#EBF4FF]"
								/>
							</div>
							<div className="mt-6 flex gap-3">
								<button
									onClick={() => setIsReviewModalOpen(false)}
									className="flex-1 rounded-xl border border-[#CFDBEB] py-2.5 text-sm font-semibold text-[#374F70] hover:bg-slate-50"
								>
									Cancel
								</button>
								<button
									onClick={submitReview}
									disabled={isMutating}
									className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white ${
										isMutating ? 'opacity-70 cursor-not-allowed bg-slate-500 hover:bg-slate-500' :
										reviewStatus === 'Approved' ? 'bg-[#031F45] hover:bg-[#062B5F]' : reviewStatus === 'Grant Edit' ? 'bg-[#D98326] hover:bg-[#C97218]' : 'bg-[#E92D2D] hover:bg-[#CF2424]'
									}`}
								>
									{isMutating ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Processing...</span> : `Confirm ${reviewStatus}`}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			<section className="rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_6px_18px_rgba(16,42,80,0.08)] overflow-hidden">
				<div className="border-b border-[#E1EAF6] px-5 py-4">
					<h3 className="text-xl font-bold text-[#0F2649]">Pending User Approvals</h3>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full min-w-140 border-collapse text-left">
						<thead>
							<tr className="bg-[#F5F8FD] text-[11px] font-bold uppercase tracking-[0.12em] text-[#617D9D] border-b border-[#E3EAF4]">
								<th className="px-5 py-3">Name</th>
								<th className="px-5 py-3">Email</th>
								<th className="px-5 py-3">Requested Role</th>
								<th className="px-5 py-3 text-right">Actions</th>
							</tr>
						</thead>
						<tbody>
							{pendingUserApprovals.length === 0 ? (
								<tr>
									<td colSpan={4} className="px-5 py-8 text-center text-xs text-[#6D839F]">
										No pending user approvals.
									</td>
								</tr>
							) : (
								pendingUserApprovals.map((item) => (
									<tr key={item.id} className="border-b border-[#E7EDF6] last:border-b-0">
										<td className="px-5 py-4 text-sm font-semibold text-[#102846]">{item.name}</td>
										<td className="px-5 py-4 text-sm text-[#3A587D]">{item.email}</td>
										<td className="px-5 py-4">
											<span className="inline-flex rounded-full border border-[#C8D8EF] bg-[#EAF2FF] px-3 py-1 text-xs font-semibold uppercase text-[#1E5CCA]">
												{item.requestedRole}
											</span>
										</td>
										<td className="px-5 py-4">
											<div className="flex justify-end gap-2">
												<button
													type="button"
													disabled={isMutating}
													onClick={() => resolvePendingUserApproval(item.id, true)}
													className="inline-flex items-center gap-1 rounded-lg bg-[#0D9E67] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B8758] disabled:opacity-50"
												>
													<Check className="h-3.5 w-3.5" />
													Approve
												</button>
												<button
													type="button"
													disabled={isMutating}
													onClick={() => resolvePendingUserApproval(item.id, false)}
													className="inline-flex items-center gap-1 rounded-lg bg-[#EB2020] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#CF1C1C] disabled:opacity-50"
												>
													<X className="h-3.5 w-3.5" />
													Reject
												</button>
											</div>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</section>

		</div>
	);
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
	return (
		<div className="space-y-0.5">
			<p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8A9FBA]">{label}</p>
			<p className={`text-lg font-bold ${accent}`}>{value}</p>
		</div>
	);
}
