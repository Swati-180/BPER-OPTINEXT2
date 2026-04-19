import { useMemo, useState, useEffect } from 'react';
import { Check, Copy, Link2, MailPlus, Search, UserPlus, X } from 'lucide-react';
import { API_ENDPOINTS } from '../../lib/config';
import { apiFetch } from '../../lib/api';
import { getInviteSignupLink, loadAuthUser } from '../../lib/authStorage';

type UserRole = 'Employee' | 'Manager';
type UserStatus = 'Active' | 'Inactive';

type UserRow = {
	employeeId: string;
	name: string;
	email: string;
	client: string;
	band: string;
	designation: string;
	role: UserRole;
	status: UserStatus;
};

type CreateUserFormState = {
	employeeId: string;
	fullName: string;
	email: string;
	role: UserRole;
	jobTitle: string;
	jobBand: string;
	client: string;
	location: string;
	employeeType: string;
	supervisorName: string;
	supervisorTitle: string;
};

const initialUsers: UserRow[] = [
	{
		employeeId: 'QG-1002',
		name: 'QG User2',
		email: 'manager.demo@bper.local',
		client: 'BU011',
		band: 'M4',
		designation: 'Manager',
		role: 'Manager',
		status: 'Active',
	},
	{
		employeeId: 'QG-1004',
		name: 'QG User1',
		email: 'employee.demo@bper.local',
		client: 'BU011',
		band: 'D2',
		designation: 'Sr. Executive',
		role: 'Employee',
		status: 'Active',
	},
];

const initialCreateUserForm: CreateUserFormState = {
	employeeId: '',
	fullName: '',
	email: '',
	role: 'Employee',
	jobTitle: '',
	jobBand: 'L1',
	client: 'QG Global',
	location: '',
	employeeType: 'Full-time',
	supervisorName: '',
	supervisorTitle: '',
};

export default function UsersPage() {
	const [userRows, setUserRows] = useState<UserRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [query, setQuery] = useState('');
	const [roleFilter, setRoleFilter] = useState<'All' | UserRole>('All');
	const [clientFilter, setClientFilter] = useState<'All' | string>('All');
	const [statusFilter, setStatusFilter] = useState<'All' | UserStatus>('All');
	const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
	const [createUserForm, setCreateUserForm] = useState<CreateUserFormState>(initialCreateUserForm);
	const [createUserError, setCreateUserError] = useState('');
	const [isInviteOpen, setIsInviteOpen] = useState(false);
	const [inviteError, setInviteError] = useState('');
	const [inviteCopied, setInviteCopied] = useState(false);
	const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');

	const fetchUsers = async () => {
		setIsLoading(true);
		try {
			const token = localStorage.getItem('bper.auth.token');
			const response = await fetch(`${API_ENDPOINTS.AUTH}/users`, {
				headers: { 'Authorization': `Bearer ${token}` }
			});
			const data = await response.json();
			if (response.ok) {
				// Map backend users to frontend UserRow structure
				const mapped: UserRow[] = data.map((u: any) => ({
					employeeId: u.employeeId || 'NA',
					name: u.name,
					email: u.email,
					client: u.client || 'BU011',
					band: u.band || 'NA',
					designation: u.designation || 'NA',
					role: (u.role.charAt(0).toUpperCase() + u.role.slice(1)) as UserRole,
					status: u.isActive ? 'Active' : 'Inactive'
				}));
				setUserRows(mapped);
			}
		} catch (error) {
			console.error('Failed to fetch users:', error);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchUsers();
	}, []);

	const filteredUsers = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		return userRows.filter((user) => {
			const matchesQuery =
				normalized.length === 0 ||
				user.employeeId.toLowerCase().includes(normalized) ||
				user.name.toLowerCase().includes(normalized) ||
				user.email.toLowerCase().includes(normalized);

			const matchesRole = roleFilter === 'All' || user.role === roleFilter;
			const matchesClient = clientFilter === 'All' || user.client === clientFilter;
			const matchesStatus = statusFilter === 'All' || user.status === statusFilter;

			return matchesQuery && matchesRole && matchesClient && matchesStatus;
		});
	}, [query, roleFilter, clientFilter, statusFilter, userRows]);

	function closeCreateUserModal() {
		setIsCreateUserOpen(false);
		setCreateUserError('');
		setCreateUserForm(initialCreateUserForm);
	}

	function closeInviteModal() {
		setIsInviteOpen(false);
		setInviteError('');
		setInviteCopied(false);
		setGeneratedInviteUrl('');
	}

	function openInviteModal() {
		generateInviteUrl();
		setIsInviteOpen(true);
	}

	function generateInviteUrl() {
		const inviteOrg = loadAuthUser()?.organization?.trim() || 'QGGlobal';
		const url = getInviteSignupLink(inviteOrg);
		setGeneratedInviteUrl(url);
		setInviteError('');
		setInviteCopied(false);
		return url;
	}

	async function handleCopyInviteUrl() {
		let url = generatedInviteUrl;
		if (!url) {
			url = generateInviteUrl();
			if (!url) return;
		}

		try {
			await navigator.clipboard.writeText(url);
			setInviteCopied(true);
			setInviteError('');
			setTimeout(() => setInviteCopied(false), 2000);
		} catch {
			setInviteError('Invite URL could not be copied.');
		}
	}

	async function handleCreateUser() {
		const employeeId = createUserForm.employeeId.trim();
		const fullName = createUserForm.fullName.trim();
		const email = createUserForm.email.trim().toLowerCase();

		if (!employeeId || !fullName || !email) {
			setCreateUserError('Employee ID, Full Name, and Email Address are required.');
			return;
		}

		setCreateUserError('');
		try {
			const response = await apiFetch('/auth/register', {
				method: 'POST',
				body: JSON.stringify({
					name: fullName,
					email,
					password: 'DefaultPassword123!', // Admin created default
					employeeId,
					designation: createUserForm.jobTitle.trim(),
					band: createUserForm.jobBand,
					client: createUserForm.client,
					role: createUserForm.role === 'Employee' ? 'employee' : 'manager',
					organization: createUserForm.client
				})
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.message || 'Failed to create user');
			}

			// Refresh list
			fetchUsers();
			closeCreateUserModal();
		} catch (err: any) {
			setCreateUserError(err.message);
		}
	}

	return (
		<div className="space-y-4 animate-in fade-in duration-500">
			<section className="rounded-2xl border border-[#D9E4F2] bg-white p-4 md:p-5 shadow-[0_3px_12px_rgba(16,42,80,0.06)]">
					<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div className="space-y-1.5">
						<h1 className="text-xl font-bold tracking-tight text-[#102B52]">Admin Users Management</h1>
						<p className="text-xs text-[#4E6787]">
							Manage platform access and role assignments for BPER users.
						</p>
					</div>

						<div className="flex flex-wrap items-center gap-2">
							<button
								type="button"
								onClick={openInviteModal}
								className="inline-flex items-center gap-2 rounded-lg border border-[#BFD3EA] bg-[#F4F8FF] px-3.5 py-2 text-xs font-semibold text-[#1E5EAB] transition-all hover:bg-[#EAF2FF]"
							>
								<MailPlus className="h-3.5 w-3.5" />
								Invite Employee
							</button>
							<button
								type="button"
								onClick={() => setIsCreateUserOpen(true)}
								className="inline-flex items-center gap-2 rounded-lg bg-[#165BAA] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_5px_12px_rgba(22,91,170,0.18)] transition-all hover:bg-[#124B8D] hover:-translate-y-0.5"
							>
								<UserPlus className="h-3.5 w-3.5" />
								Create User
							</button>
						</div>
				</div>

				<div className="mt-3 grid grid-cols-1 gap-2.5 rounded-xl border border-[#E4EBF6] bg-[#F7FAFF] p-2.5 md:grid-cols-12 md:items-end">
					<label className="md:col-span-5 space-y-1.5">
						<span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#637F9F]">Global Search</span>
						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8AA0BC]" />
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Employee ID, Name, or Email..."
								className="h-9 w-full rounded-lg border border-[#D6E0EE] bg-white pl-9 pr-3 text-xs text-[#243A59] outline-none transition-all placeholder:text-[#9AAEC6] focus:border-[#6E97CB] focus:ring-2 focus:ring-[#D7E6F7]"
							/>
						</div>
					</label>

					<label className="md:col-span-2 space-y-1.5">
						<span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#637F9F]">Role</span>
						<select
							value={roleFilter}
							onChange={(event) => setRoleFilter(event.target.value as 'All' | UserRole)}
							className="h-9 w-full rounded-lg border border-[#D6E0EE] bg-white px-3 text-xs font-medium text-[#243A59] outline-none transition-all focus:border-[#6E97CB] focus:ring-2 focus:ring-[#D7E6F7]"
						>
							<option value="All">All Roles</option>
							<option value="Manager">Manager</option>
							<option value="Employee">Employee</option>
						</select>
					</label>

					<label className="md:col-span-2 space-y-1.5">
						<span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#637F9F]">Client</span>
						<select
							value={clientFilter}
							onChange={(event) => setClientFilter(event.target.value)}
							className="h-9 w-full rounded-lg border border-[#D6E0EE] bg-white px-3 text-xs font-medium text-[#243A59] outline-none transition-all focus:border-[#6E97CB] focus:ring-2 focus:ring-[#D7E6F7]"
						>
							<option value="All">All Clients</option>
							<option value="BU011">BU011</option>
						</select>
					</label>

					<label className="md:col-span-3 space-y-1.5">
						<span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#637F9F]">Status</span>
						<select
							value={statusFilter}
							onChange={(event) => setStatusFilter(event.target.value as 'All' | UserStatus)}
							className="h-9 w-full rounded-lg border border-[#D6E0EE] bg-white px-3 text-xs font-medium text-[#243A59] outline-none transition-all focus:border-[#6E97CB] focus:ring-2 focus:ring-[#D7E6F7]"
						>
							<option value="All">Any Status</option>
							<option value="Active">Active</option>
							<option value="Inactive">Inactive</option>
						</select>
					</label>
				</div>

				<div className="mt-3 overflow-hidden rounded-xl border border-[#DCE6F3]">
					<div className="overflow-x-auto">
						<table className="w-full min-w-180 border-collapse text-left">
							<thead>
								<tr className="bg-[#F5F8FD] text-[10px] font-bold uppercase tracking-[0.14em] text-[#617D9D] border-b border-[#E3EAF4]">
									<th className="px-4 py-3">Employee ID</th>
									<th className="px-4 py-3">Name</th>
									<th className="px-4 py-3">Email</th>
									<th className="px-4 py-3">Client</th>
									<th className="px-4 py-3">Band</th>
									<th className="px-4 py-3">Role</th>
									<th className="px-4 py-3">Status</th>
								</tr>
							</thead>
							<tbody>
								{isLoading ? (
									<tr>
										<td colSpan={7} className="px-4 py-12 text-center text-sm text-[#6B829E]">
											<div className="flex flex-col items-center gap-3">
												<div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1E5EAB] border-t-transparent"></div>
												<span>Loading workforce ledger...</span>
											</div>
										</td>
									</tr>
								) : filteredUsers.length === 0 ? (
									<tr>
										<td colSpan={7} className="px-4 py-7 text-center text-xs text-[#6B829E]">
											No users match the selected filters.
										</td>
									</tr>
								) : (
									filteredUsers.map((user, index) => (
										<tr
											key={user.employeeId}
											className={`border-b border-[#E7EDF6] text-[#1A3556] transition-colors hover:bg-[#FAFCFF] ${index === filteredUsers.length - 1 ? 'border-b-0' : ''}`}
										>
											<td className="px-4 py-3 text-[14px] font-bold leading-none text-[#1A5AA6]">
												{user.employeeId}
											</td>
											<td className="px-4 py-3">
												<div className="flex items-center gap-2.5">
													<div className="h-8 w-8 rounded-full bg-linear-to-br from-[#CFE1F6] to-[#A8C3EA] text-[#123E73] font-bold text-[11px] flex items-center justify-center border border-[#BCD2ED]">
														{user.name
															.split(' ')
															.filter(Boolean)
															.slice(0, 2)
															.map((part) => part[0]?.toUpperCase() ?? '')
															.join('')}
													</div>
													<div>
														<p className="text-[16px] font-bold leading-tight text-[#1A2E4D]">
															{user.name}
														</p>
														<p className="mt-0.5 text-xs text-[#6A82A0]">{user.designation}</p>
													</div>
												</div>
											</td>
											<td className="px-4 py-3 text-sm text-[#586F8D]">{user.email}</td>
											<td className="px-4 py-3 text-lg font-semibold text-[#4E6687]">{user.client}</td>
											<td className="px-4 py-3">
												<span className="inline-flex min-w-10 items-center justify-center rounded-md bg-[#F0F4FA] px-2 py-0.5 text-xs font-bold text-[#6A7F9C] border border-[#E1E9F4]">
													{user.band}
												</span>
											</td>
											<td className="px-4 py-3">
												<span
													className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
														user.role === 'Manager'
															? 'border-[#BCD3EF] bg-[#E8F1FF] text-[#235BA7]'
															: 'border-[#D6DEE9] bg-[#F4F7FB] text-[#5E718A]'
													}`}
												>
													{user.role}
												</span>
											</td>
											<td className="px-4 py-3">
												<span
													className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
														user.status === 'Active'
															? 'border-[#BFE1CA] bg-[#E9F8EE] text-[#1F9A52]'
															: 'border-[#D3DCE8] bg-[#EFF3F8] text-[#7B90AB]'
													}`}
												>
													<span
														className={`h-2 w-2 rounded-full ${
															user.status === 'Active' ? 'bg-[#22A455]' : 'bg-[#8CA2BF]'
														}`}
													/>
													{user.status}
												</span>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			{isCreateUserOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F203B]/45 p-4 backdrop-blur-[2px]" onClick={closeCreateUserModal}>
					<div
						className="w-full max-w-4xl overflow-hidden rounded-2xl border border-[#D7E2F0] bg-white shadow-[0_24px_64px_rgba(15,32,59,0.28)]"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="flex items-start justify-between border-b border-[#E3EBF7] px-6 py-5">
							<div>
								<h2 className="text-4xl font-bold tracking-tight text-[#152542]">Create New User</h2>
								<p className="mt-1 text-lg text-[#667C99]">
									Fill in the details to register a new member to the workforce ledger.
								</p>
							</div>
							<button
								type="button"
								onClick={closeCreateUserModal}
								className="rounded-md p-2 text-[#8FA2BC] transition-colors hover:bg-[#F1F5FB] hover:text-[#607A9E]"
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						<div className="bg-[#F3F7FC] px-6 py-6">
							<form className="grid grid-cols-1 gap-5 md:grid-cols-6">
								<label className="md:col-span-2 space-y-1.5">
									<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Employee ID</span>
									<input
										type="text"
										value={createUserForm.employeeId}
										onChange={(event) => setCreateUserForm((prev) => ({ ...prev, employeeId: event.target.value }))}
										placeholder="e.g. QG-12345"
										className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none placeholder:text-[#95A7BF] focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
									/>
								</label>

								<label className="md:col-span-4 space-y-1.5">
									<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Full Name</span>
									<input
										type="text"
										value={createUserForm.fullName}
										onChange={(event) => setCreateUserForm((prev) => ({ ...prev, fullName: event.target.value }))}
										placeholder="Enter full legal name"
										className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none placeholder:text-[#95A7BF] focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
									/>
								</label>

								<label className="md:col-span-4 space-y-1.5">
									<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Email Address</span>
									<input
										type="email"
										value={createUserForm.email}
										onChange={(event) => setCreateUserForm((prev) => ({ ...prev, email: event.target.value }))}
										placeholder="official.email@qgtools.com"
										className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none placeholder:text-[#95A7BF] focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
									/>
								</label>

								<label className="md:col-span-2 space-y-1.5">
									<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Role</span>
									<select
										value={createUserForm.role}
										onChange={(event) => setCreateUserForm((prev) => ({ ...prev, role: event.target.value as UserRole }))}
										className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm font-medium text-[#243A59] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
									>
										<option value="Employee">Employee</option>
										<option value="Manager">Manager</option>
									</select>
								</label>

								<label className="md:col-span-4 space-y-1.5">
									<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Job Title</span>
									<input
										type="text"
										value={createUserForm.jobTitle}
										onChange={(event) => setCreateUserForm((prev) => ({ ...prev, jobTitle: event.target.value }))}
										placeholder="e.g. Senior Operations Manager"
										className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none placeholder:text-[#95A7BF] focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
									/>
								</label>

								<label className="md:col-span-2 space-y-1.5">
									<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Job Band</span>
									<select
										value={createUserForm.jobBand}
										onChange={(event) => setCreateUserForm((prev) => ({ ...prev, jobBand: event.target.value }))}
										className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm font-medium text-[#243A59] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
									>
										<option>L1</option>
										<option>L2</option>
										<option>M4</option>
									</select>
								</label>

								<label className="md:col-span-2 space-y-1.5">
									<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Client/Business Unit</span>
									<select
										value={createUserForm.client}
										onChange={(event) => setCreateUserForm((prev) => ({ ...prev, client: event.target.value }))}
										className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm font-medium text-[#243A59] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
									>
										<option>QG Global</option>
										<option>BU011</option>
									</select>
								</label>

								<label className="md:col-span-2 space-y-1.5">
									<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Location</span>
									<input
										type="text"
										value={createUserForm.location}
										onChange={(event) => setCreateUserForm((prev) => ({ ...prev, location: event.target.value }))}
										placeholder="e.g. Mumbai, India"
										className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none placeholder:text-[#95A7BF] focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
									/>
								</label>

								<label className="md:col-span-2 space-y-1.5">
									<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Employee Type</span>
									<select
										value={createUserForm.employeeType}
										onChange={(event) => setCreateUserForm((prev) => ({ ...prev, employeeType: event.target.value }))}
										className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm font-medium text-[#243A59] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
									>
										<option>Full-time</option>
										<option>Contract</option>
										<option>Intern</option>
									</select>
								</label>

								<label className="md:col-span-3 space-y-1.5">
									<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Supervisor Name</span>
									<input
										type="text"
										value={createUserForm.supervisorName}
										onChange={(event) => setCreateUserForm((prev) => ({ ...prev, supervisorName: event.target.value }))}
										placeholder="Direct reporting manager"
										className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none placeholder:text-[#95A7BF] focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
									/>
								</label>

								<label className="md:col-span-3 space-y-1.5">
									<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Supervisor Title</span>
									<input
										type="text"
										value={createUserForm.supervisorTitle}
										onChange={(event) => setCreateUserForm((prev) => ({ ...prev, supervisorTitle: event.target.value }))}
										placeholder="e.g. VP Operations"
										className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none placeholder:text-[#95A7BF] focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
									/>
								</label>

								{createUserError && (
									<div className="md:col-span-6 rounded-xl border border-[#F4D2D3] bg-[#FFF5F5] px-4 py-3 text-sm font-medium text-[#AC373A]">
										{createUserError}
									</div>
								)}
							</form>
						</div>

						<div className="flex items-center justify-end gap-4 border-t border-[#E3EBF7] bg-white px-6 py-4">
							<button
								type="button"
								onClick={closeCreateUserModal}
								className="rounded-lg px-4 py-2 text-sm font-semibold text-[#4C617E] transition-colors hover:bg-[#F3F7FC]"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleCreateUser}
								className="rounded-xl bg-[#165BAA] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_14px_rgba(22,91,170,0.22)] transition-colors hover:bg-[#124B8D]"
							>
								Create User
							</button>
						</div>
					</div>
				</div>
			)}

			{isInviteOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F203B]/45 p-4 backdrop-blur-[2px]" onClick={closeInviteModal}>
					<div
						className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#D7E2F0] bg-white shadow-[0_24px_64px_rgba(15,32,59,0.28)]"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="flex items-start justify-between border-b border-[#E3EBF7] px-6 py-5">
							<div>
								<h2 className="text-2xl font-bold tracking-tight text-[#152542]">Invite Employee</h2>
								<p className="mt-1 text-sm text-[#667C99]">
									Generate and copy an invite URL to share with the employee. The link will open the signup page with the organization pre-filled and employee onboarding enabled.
								</p>
							</div>
							<button
								type="button"
								onClick={closeInviteModal}
								className="rounded-md p-2 text-[#8FA2BC] transition-colors hover:bg-[#F1F5FB] hover:text-[#607A9E]"
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						<div className="px-6 py-6 space-y-4">
							<div className="space-y-1.5">
								<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Copy Invite URL</span>
								<div className="flex items-center gap-2">
									<div className="relative flex-1">
										<Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" />
										<input
											readOnly
											value={generatedInviteUrl}
											className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-[#F6FAFF] pl-9 pr-4 text-sm text-[#243A59] outline-none cursor-default select-all"
											/>
									</div>
									<button
										type="button"
										onClick={handleCopyInviteUrl}
										className={`inline-flex h-11 min-w-22.5 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-[0_8px_14px_rgba(22,91,170,0.22)] transition-all ${
											inviteCopied
											? 'bg-[#1A9A52] hover:bg-[#178044]'
											: 'bg-[#165BAA] hover:bg-[#124B8D]'
										}`}
									>
										{inviteCopied ? (
											<><Check className="h-4 w-4" /> Copied!</>
										) : (
											<><Copy className="h-4 w-4" /> Copy</>
										)}
									</button>
								</div>
								{generatedInviteUrl && !inviteError && (
									<p className="text-xs font-semibold text-[#1A5EA3] mt-1">Invite link ready. Click copy to copy to clipboard.</p>
								)}
								{inviteError && (
									<p className="text-xs font-semibold text-[#AC373A] mt-1">{inviteError}</p>
								)}
								<button
									type="button"
									onClick={closeInviteModal}
									className="rounded-lg px-4 py-2 text-sm font-semibold text-[#4C617E] transition-colors hover:bg-[#F3F7FC]"
								>
									Close
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
