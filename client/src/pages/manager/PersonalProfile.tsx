import { useEffect, useState } from 'react';
import {
  BriefcaseBusiness,
  Building2,
  Mail,
  MapPin,
  UserCircle2,
  Users,
  PencilLine,
  KeyRound,
  List,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { loadAuthUser, saveAuthUser } from '../../lib/authStorage';
import { ProfileSkeleton } from '../../components/PortalSkeletons';

type ProfileRecord = {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'employee';
  employeeId?: string;
  designation?: string;
  client?: string;
  location?: string;
  band?: string;
  supervisorName?: string;
  supervisorTitle?: string;
  organization?: string;
  isActive?: boolean;
  createdAt?: string;
};

const EMPTY_EDIT = {
  name: '',
  designation: '',
  location: '',
  organization: '',
  supervisorName: '',
  supervisorTitle: '',
  client: '',
  band: '',
};

const EMPTY_PASSWORD = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

type ProfilePanel = 'view' | 'edit' | 'password';

export default function PersonalProfile() {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<ProfilePanel>('view');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_EDIT);
  const [passwordDraft, setPasswordDraft] = useState(EMPTY_PASSWORD);

  const userRole = loadAuthUser()?.role;
  const isManager = userRole === 'manager';
  const isAdmin = userRole === 'admin';
  const roleLabel = isAdmin ? 'Admin' : isManager ? 'Manager' : 'Employee';

  useEffect(() => {
    async function fetchProfile() {
      setIsLoading(true);
      try {
        const response = await apiFetch('/auth/me');
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message || 'Failed to load profile.');
        }
        setProfile((await response.json()) as ProfileRecord);
      } catch (err: any) {
        setError(err?.message || 'Failed to load profile.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, []);

  function openEdit() {
    if (!profile) return;

    setError(null);
    setSuccess(null);
    setEditDraft({
      name: profile.name || '',
      designation: profile.designation || '',
      location: profile.location || '',
      organization: profile.organization || '',
      supervisorName: profile.supervisorName || '',
      supervisorTitle: profile.supervisorTitle || '',
      client: profile.client || '',
      band: profile.band || '',
    });
    setActivePanel('edit');
  }

  async function saveProfile() {
    setError(null);
    setSuccess(null);

    if (!editDraft.name.trim()) {
      setError('Full name is required.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const response = await apiFetch('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(editDraft),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to update profile.');
      }

      const updated = data?.user as ProfileRecord;
      setProfile(updated);
      setActivePanel('view');
      setSuccess('Profile updated successfully.');

      const authUser = loadAuthUser();
      if (authUser) {
        saveAuthUser({
          ...authUser,
          name: updated.name || authUser.name,
          organization: updated.organization || authUser.organization || '',
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function savePassword() {
    setError(null);
    setSuccess(null);

    if (!passwordDraft.currentPassword || !passwordDraft.newPassword || !passwordDraft.confirmPassword) {
      setError('All password fields are required.');
      return;
    }

    if (passwordDraft.newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const response = await apiFetch('/auth/me/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordDraft.currentPassword,
          newPassword: passwordDraft.newPassword,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to change password.');
      }

      setPasswordDraft(EMPTY_PASSWORD);
      setActivePanel('view');
      setSuccess('Password changed successfully.');
    } catch (err: any) {
      setError(err?.message || 'Failed to change password.');
    } finally {
      setIsSavingPassword(false);
    }
  }

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  const profileFields = [
    { label: 'Employee ID', value: profile?.employeeId || '-', icon: UserCircle2 },
    { label: 'Name', value: profile?.name || '-', icon: Users },
    { label: 'Email', value: profile?.email || '-', icon: Mail },
    { label: 'Title', value: profile?.designation || '-', icon: BriefcaseBusiness },
    { label: 'Client', value: profile?.client || '-', icon: Building2 },
    { label: 'Location', value: profile?.location || '-', icon: MapPin },
    { label: 'Band', value: profile?.band || '-', icon: BriefcaseBusiness },
    { label: 'Organization', value: profile?.organization || '-', icon: Building2 },
    { label: 'Supervisor', value: profile?.supervisorName || '-', icon: Users },
    { label: 'Supervisor Title', value: profile?.supervisorTitle || '-', icon: BriefcaseBusiness },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Your Profile</h2>
            <p className="text-sm text-gray-500 max-w-3xl">{roleLabel} profile details, reporting context, and account security controls.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm w-fit">
            <span className={`h-2 w-2 rounded-full ${profile?.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            {profile?.isActive ? 'Active' : 'Inactive'} {profile?.role || 'manager'}
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-linear-to-r from-[#165BAA] via-[#144E92] to-[#0B2A55] px-6 py-8 text-white md:px-8">
          <div className="absolute inset-y-0 right-0 w-72 rounded-full bg-white/10 blur-3xl translate-x-20" aria-hidden="true" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 shadow-lg backdrop-blur-sm">
                <UserCircle2 className="h-14 w-14 text-white/80" />
                <span className={`absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${profile?.isActive ? 'bg-emerald-400' : 'bg-gray-400'}`} aria-hidden="true" />
              </div>

              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blue-100/90 mb-2">{roleLabel} Profile</p>
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{profile?.name}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-blue-100">
                  <span className="inline-flex items-center gap-1.5">
                    <UserCircle2 size={14} /> Employee ID {profile?.employeeId || '-'}
                  </span>
                  <span className="hidden md:inline text-white/25">•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={14} /> {profile?.location || 'Unassigned'}
                  </span>
                  <span className="hidden md:inline text-white/25">•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <BriefcaseBusiness size={14} /> {profile?.band || 'NA'} Band
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:min-w-72">
              <ProfilePill label="Role" value={(profile?.role || 'manager').toUpperCase()} />
              <ProfilePill label="Organization" value={profile?.organization || 'Quintes Global'} />
            </div>
          </div>
        </div>

        <div className="space-y-6 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-[#D6E4F5] bg-[#F5F9FF] p-1.5">
              <button
                type="button"
                onClick={() => setActivePanel('view')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  activePanel === 'view'
                    ? 'bg-[#165BAA] text-white shadow-sm'
                    : 'text-[#1D3655] hover:bg-white'
                }`}
              >
                <List size={14} />
                Profile Details
              </button>
              <button
                type="button"
                onClick={openEdit}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  activePanel === 'edit'
                    ? 'bg-[#165BAA] text-white shadow-sm'
                    : 'text-[#1D3655] hover:bg-white'
                }`}
              >
                <PencilLine size={14} />
                Edit Profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                  setActivePanel('password');
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  activePanel === 'password'
                    ? 'bg-[#165BAA] text-white shadow-sm'
                    : 'text-[#1D3655] hover:bg-white'
                }`}
              >
                <KeyRound size={14} />
                Change Password
              </button>
            </div>

            {activePanel !== 'view' && (
              <button
                type="button"
                onClick={() => setActivePanel('view')}
                className="rounded-lg border border-[#D2DEED] bg-white px-4 py-2 text-xs font-bold text-[#1D3655] hover:bg-[#F7FAFF]"
              >
                Back to Profile
              </button>
            )}
          </div>

          {activePanel === 'edit' && (
            <section className="rounded-xl border border-[#DCE8F6] bg-[#F8FBFF] p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-bold text-[#102846]">Edit Profile</p>
                <span className="rounded-full bg-[#E9F2FF] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#165BAA]">Editable</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <InputField label="Full Name" value={editDraft.name} onChange={(value) => setEditDraft((prev) => ({ ...prev, name: value }))} />
                <InputField label="Designation" value={editDraft.designation} onChange={(value) => setEditDraft((prev) => ({ ...prev, designation: value }))} />
                <InputField label="Location" value={editDraft.location} onChange={(value) => setEditDraft((prev) => ({ ...prev, location: value }))} />
                <InputField label="Organization" value={editDraft.organization} onChange={(value) => setEditDraft((prev) => ({ ...prev, organization: value }))} />
                <InputField label="Supervisor Name" value={editDraft.supervisorName} onChange={(value) => setEditDraft((prev) => ({ ...prev, supervisorName: value }))} />
                <InputField label="Supervisor Title" value={editDraft.supervisorTitle} onChange={(value) => setEditDraft((prev) => ({ ...prev, supervisorTitle: value }))} />
                <InputField label="Client" value={editDraft.client} onChange={(value) => setEditDraft((prev) => ({ ...prev, client: value }))} />
                <InputField label="Band" value={editDraft.band} onChange={(value) => setEditDraft((prev) => ({ ...prev, band: value }))} />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button type="button" onClick={saveProfile} disabled={isSavingProfile} className="inline-flex items-center gap-2 rounded-lg bg-[#165BAA] px-4 py-2 text-xs font-bold text-white hover:bg-[#124B8E] disabled:opacity-70">
                  Save Changes
                </button>
                <button type="button" onClick={() => setActivePanel('view')} className="rounded-lg border border-[#D2DEED] bg-white px-4 py-2 text-xs font-bold text-[#1D3655] hover:bg-[#F7FAFF]">
                  Cancel
                </button>
              </div>
            </section>
          )}

          {activePanel === 'password' && (
            <section className="rounded-xl border border-[#DCE8F6] bg-[#FBFCFF] p-4">
              <p className="mb-4 text-sm font-bold text-[#102846]">Change Password</p>
              <div className="grid gap-3 md:grid-cols-3">
                <InputField
                  label="Current Password"
                  type="password"
                  value={passwordDraft.currentPassword}
                  onChange={(value) => setPasswordDraft((prev) => ({ ...prev, currentPassword: value }))}
                />
                <InputField
                  label="New Password"
                  type="password"
                  value={passwordDraft.newPassword}
                  onChange={(value) => setPasswordDraft((prev) => ({ ...prev, newPassword: value }))}
                />
                <InputField
                  label="Confirm Password"
                  type="password"
                  value={passwordDraft.confirmPassword}
                  onChange={(value) => setPasswordDraft((prev) => ({ ...prev, confirmPassword: value }))}
                />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button type="button" onClick={savePassword} disabled={isSavingPassword} className="inline-flex items-center gap-2 rounded-lg bg-[#165BAA] px-4 py-2 text-xs font-bold text-white hover:bg-[#124B8E] disabled:opacity-70">
                  Update Password
                </button>
                <button type="button" onClick={() => setActivePanel('view')} className="rounded-lg border border-[#D2DEED] bg-white px-4 py-2 text-xs font-bold text-[#1D3655] hover:bg-[#F7FAFF]">
                  Cancel
                </button>
              </div>
            </section>
          )}

          {activePanel === 'view' && (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <ProfileCard title="Identity" fields={profileFields.slice(0, 4)} />
                <ProfileCard title="Employment" fields={profileFields.slice(4, 8)} />
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <ProfileCard title="Reporting" fields={profileFields.slice(8)} />
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#165BAA] font-semibold">Account Snapshot</p>
                  </div>
                  <div className="grid gap-3 p-5">
                    <MetricCard label="Role" value={(profile?.role || 'manager').toUpperCase()} />
                    <MetricCard label="Status" value={profile?.isActive ? 'Active' : 'Inactive'} />
                    <MetricCard label="Joined" value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '-'} />
                    <MetricCard label="Email" value={profile?.email || '-'} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7E97B4]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-[#D2DEED] bg-white px-3 text-sm text-[#102846] outline-none focus:border-[#6B97CD] focus:ring-2 focus:ring-[#D8E8FA]"
      />
    </label>
  );
}

function ProfileCard({
  title,
  fields,
}: {
  title: string;
  fields: Array<{ label: string; value: string; icon: LucideIcon }>;
}) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#165BAA] font-semibold">{title}</p>
      </div>
      <div className="divide-y divide-gray-100">
        {fields.map((field) => {
          const Icon = field.icon;
          return (
            <div key={field.label} className="flex items-start gap-3 px-5 py-4">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#165BAA]/8 text-[#165BAA] border border-[#165BAA]/10">
                <Icon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">{field.label}</p>
                <p className="mt-1 text-[15px] font-medium text-gray-900 wrap-break-word">{field.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProfilePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <p className="text-[10px] uppercase tracking-[0.18em] text-blue-100/80 font-semibold">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
