import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Link2, MailPlus, Search, Users, X, Pencil, Trash2, FileUp, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiFetch } from '../../lib/api';
import { getInviteSignupLink, loadAuthUser } from '../../lib/authStorage';
import { TableLoadingRow } from '../../components/PortalSkeletons';

type UserRole = 'employee' | 'manager' | 'admin';
type UserStatus = 'Active' | 'Inactive';

type UserRow = {
	employeeId: string;
	name: string;
	email: string;
	department: string;
	band: string;
	designation: string;
	role: UserRole;
	status: UserStatus;
	maxMonthlyHours: number;
	_id?: string;
};

type CreateUserFormState = {
	employeeId: string;
	fullName: string;
	email: string;
	role: UserRole;
	jobTitle: string;
	jobBand: string;
	department: string;
	location: string;
	employeeType: string;
	supervisorName: string;
	supervisorTitle: string;
	maxMonthlyHours: string;
	password?: string;
	confirmPassword?: string;
};

const initialCreateUserForm: CreateUserFormState = {
	employeeId: '',
	fullName: '',
	email: '',
	role: 'employee',
	jobTitle: '',
	jobBand: 'L1',
	department: '',
	location: '',
	employeeType: 'Full-time',
	supervisorName: '',
	supervisorTitle: '',
	maxMonthlyHours: '160',
	password: '',
	confirmPassword: '',
};

export default function UsersPage() {
	const [userRows, setUserRows] = useState<UserRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [query, setQuery] = useState('');
	const [roleFilter, setRoleFilter] = useState<'All' | UserRole>('All');
	const [departmentFilter, setDepartmentFilter] = useState<'All' | string>('All');
	const [statusFilter, setStatusFilter] = useState<'All' | UserStatus>('All');
	const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
	const [isEditUserOpen, setIsEditUserOpen] = useState(false);
	const [editingUser, setEditingUser] = useState<UserRow | null>(null);
	const [createUserForm, setCreateUserForm] = useState<CreateUserFormState>(initialCreateUserForm);
	const [createUserError, setCreateUserError] = useState('');
	const [isInviteOpen, setIsInviteOpen] = useState(false);
	const [inviteError, setInviteError] = useState('');
	const [inviteCopied, setInviteCopied] = useState(false);
	const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');
	const fileInputRef = React.useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [uploadResult, setUploadResult] = useState<{ added: number, updated: number, errors: string[] } | null>(null);
	const modalRoot = typeof document !== 'undefined' ? document.body : null;

	const fetchUsers = async () => {
		setIsLoading(true);
		try {
			const response = await apiFetch('/auth/users');
			const data = await response.json().catch(() => null);
			if (response.ok) {
				const mapped: UserRow[] = (Array.isArray(data) ? data : []).map((u: any) => ({
					employeeId: u.employeeId || '-',
					name: u.name || 'Unknown User',
					email: u.email,
					department: u.organization || u.client || 'Unassigned',
					band: u.band || 'B1',
					designation: u.designation || 'Employee',
					role: (u.role.charAt(0).toUpperCase() + u.role.slice(1)) as UserRole,
					status: u.isActive ? 'Active' : 'Inactive',
					maxMonthlyHours: u.maxMonthlyHours ?? 160,
					_id: u._id,
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
			const matchesDepartment = departmentFilter === 'All' || user.department === departmentFilter;
			const matchesStatus = statusFilter === 'All' || user.status === statusFilter;

			return matchesQuery && matchesRole && matchesDepartment && matchesStatus;
		});
	}, [query, roleFilter, departmentFilter, statusFilter, userRows]);

	async function handleUpdateUser(event: React.FormEvent) {
		event.preventDefault();
		if (!editingUser) return;
		
		setIsLoading(true);
		try {
			const payload = { ...editingUser, organization: editingUser.department };
			const response = await apiFetch(`/auth/users/${editingUser._id}`, {
				method: 'PATCH',
				body: JSON.stringify(payload),
			});
			if (response.ok) {
				setIsEditUserOpen(false);
				setEditingUser(null);
				fetchUsers();
			} else {
				const data = await response.json();
				alert(data.message || 'Update failed');
			}
		} catch (error) {
			console.error('Update user error:', error);
		} finally {
			setIsLoading(false);
		}
	}

	const openCreateUserModal = () => setIsCreateUserOpen(true);
	const closeCreateUserModal = () => {
		setIsCreateUserOpen(false);
		setCreateUserError('');
		setCreateUserForm(initialCreateUserForm);
	};

	const openEditUserModal = (user: UserRow) => {
		setEditingUser(user);
		setIsEditUserOpen(true);
	};
	const closeEditUserModal = () => {
		setIsEditUserOpen(false);
		setEditingUser(null);
	};

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
		const password = createUserForm.password?.trim() || '';
		const confirmPassword = createUserForm.confirmPassword?.trim() || '';

		if (!employeeId || !fullName || !email || !password) {
			setCreateUserError('Employee ID, Full Name, Email Address, and Password are required.');
			return;
		}

		if (password !== confirmPassword) {
			setCreateUserError('Passwords do not match.');
			return;
		}

		if (password.length < 6) {
			setCreateUserError('Password must be at least 6 characters.');
			return;
		}

		setCreateUserError('');
		try {
			const response = await apiFetch('/auth/register', {
				method: 'POST',
				body: JSON.stringify({
					name: fullName,
					email,
					password,
					employeeId,
					designation: createUserForm.jobTitle.trim(),
					band: createUserForm.jobBand,
					organization: createUserForm.department,
					role: createUserForm.role,
					maxMonthlyHours: Number(createUserForm.maxMonthlyHours) || 160
				})
			});

			const data = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(data?.message || 'Failed to create user');
			}

			fetchUsers();
			closeCreateUserModal();
		} catch (err: any) {
			setCreateUserError(err.message);
		}
	}

	async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;

		setIsUploading(true);
		try {
			const data = await file.arrayBuffer();
			const workbook = XLSX.read(data);
			const firstSheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[firstSheetName];
			const json = XLSX.utils.sheet_to_json(worksheet) as any[];

			const usersPayload = json.map(row => ({
				name: row['Employee Name'] || row['Name'],
				email: row['Email ID'] || row['Email'] || row['Email Address'],
				employeeId: row['Employee ID'],
				organization: row['Department'] || row['Organization'],
				designation: row['Designation'] || row['Job Title'],
				location: row['Location / Unit'] || row['Location'] || row['Unit'],
				supervisorName: row['Manager'] || row['Supervisor'] || row['Supervisor Name']
			}));

			const response = await apiFetch('/auth/users/upload', {
				method: 'POST',
				body: JSON.stringify({ users: usersPayload })
			});

			const result = await response.json().catch(() => null);
			if (!response.ok) throw new Error(result?.message || 'Upload failed');
			
			setUploadResult({
				added: result.added || 0,
				updated: result.updated || 0,
				errors: result.errors || []
			});
			fetchUsers();
		} catch (error: any) {
			setUploadResult({
				added: 0,
				updated: 0,
				errors: [error.message]
			});
		} finally {
			setIsUploading(false);
			if (fileInputRef.current) fileInputRef.current.value = '';
		}
	}

	return (
		<main className="space-y-4 animate-in fade-in duration-500">
			<section className="rounded-2xl border border-[#D9E4F2] bg-white p-4 md:p-5 shadow-[0_3px_12px_rgba(10,42,80,0.06)]">
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div className="space-y-1.5">
						<h1 className="text-xl font-bold tracking-tight text-[#102B52]">Admin Users Management</h1>
						<p className="text-xs text-[#4E6787]">Manage platform access and role assignments for BPER users.</p>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<input 
							type="file" 
							ref={fileInputRef} 
							accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
							className="hidden" 
							onChange={handleFileUpload}
						/>
						<div className="relative group">
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								disabled={isUploading}
								className="inline-flex items-center gap-2 rounded-lg border border-[#BFD3EA] bg-white px-3.5 py-2 text-xs font-semibold text-[#1E5EAB] transition-all hover:bg-[#F4F8FF] disabled:opacity-50"
							>
								{isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
								Upload CSV/Excel
							</button>

							{/* Tooltip */}
							<div className="absolute right-[-260px] top-full mt-2.5 z-50 w-max max-w-[800px] rounded-xl border border-[#DCE6F3] bg-white p-3 shadow-[0_12px_32px_rgba(10,42,80,0.15)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none origin-[calc(100%-308px)_top] transform group-hover:scale-100 scale-95">
								<div className="absolute -top-2 right-[308px] border-8 border-transparent border-b-[#DCE6F3]"></div>
								<div className="absolute -top-[7px] right-[308px] border-8 border-transparent border-b-white"></div>
								
								<div className="mb-3 flex items-center gap-2 border-b border-[#F0F4FA] pb-2.5">
									<div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#EEF5FF] border border-[#C4D9F5]">
										<FileUp className="h-3.5 w-3.5 text-[#1E5EAB]" />
									</div>
									<div>
										<h3 className="text-[11px] font-bold uppercase tracking-wider text-[#102B52]">File Format Guide</h3>
										<p className="text-[9px] text-[#6A82A0] leading-tight mt-0.5">Required data fields for bulk import</p>
									</div>
								</div>

								<div className="overflow-x-auto rounded-lg border border-[#E4EBF6] bg-[#F7FAFF]">
									<table className="w-full text-left text-[10px] whitespace-nowrap">
										<thead className="bg-[#EEF3FA] text-[#4E6787]">
											<tr>
												<th className="px-3 py-2 font-bold border-b border-r border-[#E4EBF6]">Employee Name*</th>
												<th className="px-3 py-2 font-bold border-b border-r border-[#E4EBF6]">Email ID*</th>
												<th className="px-3 py-2 font-bold border-b border-r border-[#E4EBF6]">Employee ID*</th>
												<th className="px-3 py-2 font-bold border-b border-r border-[#E4EBF6]">Department</th>
												<th className="px-3 py-2 font-bold border-b border-r border-[#E4EBF6]">Designation</th>
												<th className="px-3 py-2 font-bold border-b border-r border-[#E4EBF6]">Location / Unit</th>
												<th className="px-3 py-2 font-bold border-b border-[#E4EBF6]">Manager</th>
											</tr>
										</thead>
										<tbody className="text-[#243A59]">
											<tr className="bg-white hover:bg-[#F9FBFF] transition-colors">
												<td className="px-3 py-2 border-r border-[#E4EBF6]">Display name</td>
												<td className="px-3 py-2 border-r border-[#E4EBF6]">Login/user identification</td>
												<td className="px-3 py-2 border-r border-[#E4EBF6]">Used in password logic</td>
												<td className="px-3 py-2 border-r border-[#E4EBF6] text-[#8AA0BC] italic">Optional</td>
												<td className="px-3 py-2 border-r border-[#E4EBF6] text-[#8AA0BC] italic">Optional</td>
												<td className="px-3 py-2 border-r border-[#E4EBF6] text-[#8AA0BC] italic">Optional</td>
												<td className="px-3 py-2 text-[#8AA0BC] italic">Optional</td>
											</tr>
										</tbody>
									</table>
								</div>
								<p className="mt-2.5 text-[9px] text-[#8AA0BC] italic font-medium">* Asterisk denotes mandatory data fields.</p>
							</div>
						</div>
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
							onClick={openCreateUserModal}
							className="inline-flex items-center gap-2 rounded-lg bg-[#165BAA] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_5px_12px_rgba(22,91,170,0.18)] transition-all hover:bg-[#124B8D] hover:-translate-y-0.5"
						>
							<Users className="h-3.5 w-3.5" />
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
						<span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#637F9F]">Department</span>
						<select
							value={departmentFilter}
							onChange={(event) => setDepartmentFilter(event.target.value)}
							className="h-9 w-full rounded-lg border border-[#D6E0EE] bg-white px-3 text-xs font-medium text-[#243A59] outline-none transition-all focus:border-[#6E97CB] focus:ring-2 focus:ring-[#D7E6F7]"
						>
							<option value="All">All Departments</option>
							{Array.from(new Set(userRows.map(u => u.department))).filter(d => d && d !== 'Unassigned').map(dept => (
								<option key={dept} value={dept}>{dept}</option>
							))}
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
									<th className="px-4 py-3">Department</th>
									<th className="px-4 py-3">Band</th>
									<th className="px-4 py-3">Max Hrs</th>
									<th className="px-4 py-3">Role</th>
									<th className="px-5 py-3">Status</th>
									<th className="px-5 py-3 text-right">Actions</th>
								</tr>
							</thead>
							<tbody>
								{isLoading ? (
									<TableLoadingRow colSpan={9} />
								) : filteredUsers.length === 0 ? (
									<tr>
										<td colSpan={9} className="px-4 py-7 text-center text-xs text-[#6B829E]">
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
														{user.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')}
													</div>
													<div>
														<p className="text-[16px] font-bold leading-tight text-[#1A2E4D]">{user.name}</p>
														<p className="mt-0.5 text-xs text-[#6A82A0]">{user.designation}</p>
													</div>
												</div>
											</td>
											<td className="px-4 py-3 text-sm text-[#586F8D]">{user.email}</td>
											<td className="px-4 py-3 text-sm font-semibold text-[#4E6687]">{user.department}</td>
											<td className="px-4 py-3">
												<span className="inline-flex min-w-10 items-center justify-center rounded-md bg-[#F0F4FA] px-2 py-0.5 text-xs font-bold text-[#6A7F9C] border border-[#E1E9F4]">
													{user.band}
												</span>
											</td>
											<td className="px-4 py-3">
												<span className="inline-flex items-center gap-1 rounded-md bg-[#EEF5FF] px-2 py-0.5 text-xs font-bold text-[#1E5BAA] border border-[#C4D9F5]">
													{user.maxMonthlyHours}h
												</span>
											</td>
											<td className="px-4 py-3">
												<span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${user.role === 'Manager' ? 'border-[#BCD3EF] bg-[#E8F1FF] text-[#235BA7]' : 'border-[#D6DEE9] bg-[#F4F7FB] text-[#5E718A]'}`}>
													{user.role}
												</span>
											</td>
											<td className="px-5 py-3 text-sm text-[#6A82A0]">{user.status}</td>
											<td className="px-5 py-3 text-right">
												<button
													onClick={() => openEditUserModal(user)}
													className="rounded-lg p-2 text-[#7D94B1] hover:bg-[#F0F4FA] hover:text-[#1E5BAA] transition-colors"
													title="Edit User"
												>
													<Pencil className="h-4 w-4" />
												</button>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			{isCreateUserOpen && modalRoot && createPortal(
				<div className="fixed inset-0 z-50 bg-[#0F203B]/45 px-4 py-6 md:px-6 md:py-10" onClick={closeCreateUserModal}>
					<div className="flex min-h-full items-center justify-center overflow-y-auto">
						<div
							className="w-full max-w-5xl overflow-hidden rounded-2xl border border-[#D7E2F0] bg-white shadow-[0_24px_64px_rgba(15,32,59,0.28)] max-h-[calc(100vh-3rem)] flex flex-col"
							onClick={(event) => event.stopPropagation()}
						>
							<div className="flex items-start justify-between border-b border-[#E3EBF7] px-6 py-5">
								<div>
									<h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[#152542]">Create New User</h2>
									<p className="mt-1 text-sm md:text-base text-[#667C99]">Fill in the details to register a new member to the workforce ledger.</p>
								</div>
								<button type="button" onClick={closeCreateUserModal} className="rounded-md p-2 text-[#8FA2BC] transition-colors hover:bg-[#F1F5FB] hover:text-[#607A9E]">
									<X className="h-5 w-5" />
								</button>
							</div>

							<div className="bg-[#F3F7FC] px-6 py-6 overflow-y-auto">
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
											<option value="employee">Employee</option>
											<option value="manager">Manager</option>
											<option value="admin">Admin</option>
										</select>
									</label>

									<label className="md:col-span-3 space-y-1.5">
										<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Password</span>
										<input
											type="password"
											value={createUserForm.password}
											onChange={(event) => setCreateUserForm((prev) => ({ ...prev, password: event.target.value }))}
											placeholder="Enter password"
											className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none placeholder:text-[#95A7BF] focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
										/>
									</label>

									<label className="md:col-span-3 space-y-1.5">
										<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Confirm Password</span>
										<input
											type="password"
											value={createUserForm.confirmPassword}
											onChange={(event) => setCreateUserForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
											placeholder="Re-type password"
											className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none placeholder:text-[#95A7BF] focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
										/>
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
										<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Department</span>
										<input
											type="text"
											value={createUserForm.department}
											onChange={(event) => setCreateUserForm((prev) => ({ ...prev, department: event.target.value }))}
											placeholder="e.g. Finance"
											className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none placeholder:text-[#95A7BF] focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
										/>
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

									<div className="md:col-span-6 space-y-1.5">
										<label className="text-[11px] font-bold uppercase tracking-wider text-[#6B829E]">Max Monthly Hours</label>
										<input
											type="number"
											className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none placeholder:text-[#95A7BF] focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]"
											placeholder="160"
											value={createUserForm.maxMonthlyHours}
											onChange={(e) => setCreateUserForm((prev) => ({ ...prev, maxMonthlyHours: e.target.value }))}
										/>
										<p className="text-[10px] text-[#8AA1BD]">Standard is 160h. This defines the 100% capacity for this employee.</p>
									</div>

									{createUserError && <div className="md:col-span-6 rounded-xl border border-[#F4D2D3] bg-[#FFF5F5] px-4 py-3 text-sm font-medium text-[#AC373A]">{createUserError}</div>}
								</form>
							</div>

							<div className="flex items-center justify-end gap-4 border-t border-[#E3EBF7] bg-white px-6 py-4">
								<button type="button" onClick={closeCreateUserModal} className="rounded-lg px-4 py-2 text-sm font-semibold text-[#4C617E] transition-colors hover:bg-[#F3F7FC]">Cancel</button>
								<button type="button" onClick={handleCreateUser} className="rounded-xl bg-[#165BAA] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_14px_rgba(22,91,170,0.22)] transition-colors hover:bg-[#124B8D]">Create User</button>
							</div>
						</div>
					</div>
				</div>,
				modalRoot
			)}

			{isInviteOpen && modalRoot && createPortal(
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F203B]/45 p-4" onClick={closeInviteModal}>
					<div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#D7E2F0] bg-white shadow-[0_24px_64px_rgba(15,32,59,0.28)]" onClick={(event) => event.stopPropagation()}>
						<div className="flex items-start justify-between border-b border-[#E3EBF7] px-6 py-5">
							<div>
								<h2 className="text-2xl font-bold tracking-tight text-[#152542]">Invite Employee</h2>
								<p className="mt-1 text-sm text-[#667C99]">Generate and copy an invite URL to share with the employee.</p>
							</div>
							<button type="button" onClick={closeInviteModal} className="rounded-md p-2 text-[#8FA2BC] transition-colors hover:bg-[#F1F5FB] hover:text-[#607A9E]">
								<X className="h-5 w-5" />
							</button>
						</div>

						<div className="px-6 py-6 space-y-4">
							<div className="space-y-1.5">
								<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Copy Invite URL</span>
								<div className="flex items-center gap-2">
									<div className="relative flex-1">
										<Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8AA0BC]" />
										<input readOnly value={generatedInviteUrl} className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-[#F6FAFF] pl-9 pr-4 text-sm text-[#243A59] outline-none cursor-default select-all" />
									</div>
									<button
										type="button"
										onClick={handleCopyInviteUrl}
										className={`inline-flex h-11 min-w-22.5 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-[0_8px_14px_rgba(22,91,170,0.22)] transition-all ${inviteCopied ? 'bg-[#1A9A52]' : 'bg-[#165BAA]'}`}
									>
										{inviteCopied ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy</>}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>,
				modalRoot
			)}

			{isEditUserOpen && editingUser && modalRoot && createPortal(
				<div className="fixed inset-0 z-50 bg-[#0F203B]/45 px-4 py-6 md:px-6 md:py-10" onClick={closeEditUserModal}>
					<div className="flex min-h-full items-center justify-center overflow-y-auto">
						<div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-[#D7E2F0] bg-white shadow-[0_24px_64px_rgba(15,32,59,0.28)] max-h-[calc(100vh-3rem)] flex flex-col" onClick={(event) => event.stopPropagation()}>
							<div className="flex items-start justify-between border-b border-[#E3EBF7] px-6 py-5">
								<div>
									<h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[#152542]">Edit User</h2>
									<p className="mt-1 text-sm md:text-base text-[#667C99]">Update account details and monthly limits for {editingUser.name}.</p>
								</div>
								<button type="button" onClick={closeEditUserModal} className="rounded-md p-2 text-[#8FA2BC] transition-colors hover:bg-[#F1F5FB] hover:text-[#607A9E]">
									<X className="h-5 w-5" />
								</button>
							</div>

							<div className="bg-[#F3F7FC] px-6 py-6 overflow-y-auto">
								<form onSubmit={handleUpdateUser} className="grid grid-cols-1 gap-5 md:grid-cols-6">
									<label className="md:col-span-2 space-y-1.5">
										<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Employee ID</span>
										<input type="text" value={editingUser.employeeId} onChange={(e) => setEditingUser(prev => prev ? {...prev, employeeId: e.target.value} : null)} className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]" />
									</label>

									<label className="md:col-span-4 space-y-1.5">
										<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Full Name</span>
										<input type="text" value={editingUser.name} onChange={(e) => setEditingUser(prev => prev ? {...prev, name: e.target.value} : null)} className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]" />
									</label>

									<label className="md:col-span-3 space-y-1.5">
										<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Email Address</span>
										<input type="email" value={editingUser.email} onChange={(e) => setEditingUser(prev => prev ? {...prev, email: e.target.value} : null)} className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]" />
									</label>

									<label className="md:col-span-3 space-y-1.5">
										<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Designation</span>
										<input type="text" value={editingUser.designation} onChange={(e) => setEditingUser(prev => prev ? {...prev, designation: e.target.value} : null)} className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]" />
									</label>

									<label className="md:col-span-2 space-y-1.5">
										<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Department</span>
										<input type="text" value={editingUser.department} onChange={(e) => setEditingUser(prev => prev ? {...prev, department: e.target.value} : null)} className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]" />
									</label>

									<label className="md:col-span-2 space-y-1.5">
										<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Role</span>
										<select value={editingUser.role} onChange={(e) => setEditingUser(prev => prev ? {...prev, role: e.target.value as UserRole} : null)} className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]">
											<option value="employee">Employee</option>
											<option value="manager">Manager</option>
											<option value="admin">Admin</option>
										</select>
									</label>

									<label className="md:col-span-2 space-y-1.5">
										<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Band</span>
										<input type="text" value={editingUser.band} onChange={(e) => setEditingUser(prev => prev ? {...prev, band: e.target.value} : null)} className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm text-[#243A59] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]" />
									</label>

									<label className="md:col-span-2 space-y-1.5">
										<span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6A809E]">Max Monthly Hours</span>
										<input type="number" value={editingUser.maxMonthlyHours} onChange={(e) => setEditingUser(prev => prev ? {...prev, maxMonthlyHours: Number(e.target.value)} : null)} className="h-11 w-full rounded-xl border border-[#D8E2F0] bg-white px-4 text-sm font-bold text-[#1E5BAA] outline-none focus:border-[#7BA0CF] focus:ring-2 focus:ring-[#D7E6F7]" />
									</label>

									<div className="md:col-span-6 mt-4 flex justify-end gap-3">
										<button type="button" onClick={closeEditUserModal} className="rounded-xl border border-[#D6E2F0] bg-white px-6 py-2.5 text-sm font-bold text-[#5D789A] transition-all hover:bg-[#F8FBFF]">Cancel</button>
										<button type="submit" disabled={isLoading} className="rounded-xl bg-[#1E5BAA] px-8 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#194F8D] hover:-translate-y-0.5 disabled:opacity-50">
											{isLoading ? 'Saving...' : 'Update User'}
										</button>
									</div>
								</form>
							</div>
						</div>
					</div>
				</div>,
				modalRoot
			)}

			{uploadResult && modalRoot && createPortal(
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F203B]/45 p-4" onClick={() => setUploadResult(null)}>
					<div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#D7E2F0] bg-white shadow-[0_24px_64px_rgba(15,32,59,0.28)]" onClick={(event) => event.stopPropagation()}>
						<div className="flex items-start justify-between border-b border-[#E3EBF7] px-6 py-5">
							<div>
								<h2 className="text-xl font-bold tracking-tight text-[#152542]">Upload Complete</h2>
								<p className="mt-1 text-sm text-[#667C99]">Summary of the employee database import.</p>
							</div>
							<button type="button" onClick={() => setUploadResult(null)} className="rounded-md p-2 text-[#8FA2BC] transition-colors hover:bg-[#F1F5FB] hover:text-[#607A9E]">
								<X className="h-5 w-5" />
							</button>
						</div>

						<div className="px-6 py-6 space-y-5">
							<div className="flex gap-4">
								<div className="flex-1 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] p-4 text-center">
									<p className="text-[11px] font-bold uppercase tracking-widest text-[#166534]">Added</p>
									<p className="mt-1 text-3xl font-black text-[#15803D]">{uploadResult.added}</p>
								</div>
								<div className="flex-1 rounded-xl bg-[#EFF6FF] border border-[#DBEAFE] p-4 text-center">
									<p className="text-[11px] font-bold uppercase tracking-widest text-[#1E40AF]">Updated</p>
									<p className="mt-1 text-3xl font-black text-[#1D4ED8]">{uploadResult.updated}</p>
								</div>
							</div>

							{uploadResult.errors.length > 0 && (
								<div className="rounded-xl border border-[#FEE2E2] bg-[#FEF2F2] p-4">
									<p className="text-xs font-bold text-[#991B1B] mb-2 uppercase tracking-wide">Errors encountered ({uploadResult.errors.length}):</p>
									<ul className="list-disc pl-4 text-xs text-[#7F1D1D] space-y-1 max-h-32 overflow-y-auto">
										{uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
									</ul>
								</div>
							)}
						</div>
						
						<div className="border-t border-[#E3EBF7] bg-[#F8FAFC] px-6 py-4 flex justify-end">
							<button type="button" onClick={() => setUploadResult(null)} className="rounded-xl bg-[#165BAA] px-6 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#124B8D]">
								Close
							</button>
						</div>
					</div>
				</div>,
				modalRoot
			)}
		</main>
	);
}
