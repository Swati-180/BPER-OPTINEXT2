import { useState, useEffect } from 'react';
import { 
  User, 
  Mail, 
  Shield, 
  Building2, 
  Calendar, 
  Settings2, 
  Lock, 
  Bell, 
  Globe,
  Camera,
  CheckCircle2,
  X,
  Loader2
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { loadAuthUser, saveAuthUser } from '../../lib/authStorage';

type ManagerProfile = {
  _id: string;
  name: string;
  email: string;
  employeeId?: string;
  designation?: string;
  location?: string;
  organization?: string;
  supervisorName?: string;
  supervisorTitle?: string;
  client?: string;
  band?: string;
  role?: string;
};

type Preferences = {
  emailNotifications: boolean;
  analyticsDashboardDefault: boolean;
  desktopAlerts: boolean;
};

const PREFS_KEY = 'bper.manager.preferences';

const DEFAULT_PREFS: Preferences = {
  emailNotifications: true,
  analyticsDashboardDefault: true,
  desktopAlerts: false,
};

export default function PersonalProfile() {
  const [profile, setProfile] = useState<ManagerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [editDraft, setEditDraft] = useState({
    name: '',
    designation: '',
    location: '',
    organization: '',
    supervisorName: '',
    supervisorTitle: '',
    client: '',
    band: '',
  });

  const [passwordDraft, setPasswordDraft] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [prefs, setPrefs] = useState<Preferences>(() => {
    if (typeof window === 'undefined') return DEFAULT_PREFS;
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return DEFAULT_PREFS;
      return { ...DEFAULT_PREFS, ...JSON.parse(raw) } as Preferences;
    } catch {
      return DEFAULT_PREFS;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    async function fetchMyProfile() {
      try {
        const res = await apiFetch('/auth/me');
        if (res.ok) {
          setProfile(await res.json());
        }
      } catch (error) {
        console.error('Failed to fetch personal profile:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchMyProfile();
  }, []);

  function openEditProfile() {
    if (!profile) return;
    setProfileError(null);
    setSuccessMessage(null);
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
    setIsEditOpen(true);
  }

  async function submitProfileUpdate() {
    setProfileError(null);
    setSuccessMessage(null);

    if (!editDraft.name.trim()) {
      setProfileError('Full name is required.');
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

      const updated = data?.user as ManagerProfile;
      setProfile(updated);
      setIsEditOpen(false);
      setSuccessMessage('Profile updated successfully.');

      const authUser = loadAuthUser();
      if (authUser) {
        saveAuthUser({
          ...authUser,
          name: updated.name || authUser.name,
          organization: updated.organization || authUser.organization || '',
        });
      }
    } catch (error: any) {
      setProfileError(error?.message || 'Failed to update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function submitPasswordChange() {
    setPasswordError(null);
    setSuccessMessage(null);

    if (!passwordDraft.currentPassword || !passwordDraft.newPassword || !passwordDraft.confirmPassword) {
      setPasswordError('All password fields are required.');
      return;
    }

    if (passwordDraft.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
      setPasswordError('New password and confirm password do not match.');
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

      setPasswordDraft({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setIsPasswordOpen(false);
      setSuccessMessage('Password changed successfully.');
    } catch (error: any) {
      setPasswordError(error?.message || 'Failed to change password.');
    } finally {
      setIsSavingPassword(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#165BAA] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {successMessage && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </section>
      )}

      {profileError && (
        <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {profileError}
        </section>
      )}

      {passwordError && (
        <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {passwordError}
        </section>
      )}

      {/* Header Profile Section */}
      <section className="relative overflow-hidden rounded-3xl border border-[#D9E4F2] bg-white shadow-[0_8px_30px_rgba(16,42,80,0.06)]">
        <div className="h-32 bg-linear-to-r from-[#003366] via-[#165BAA] to-[#4D89C9]"></div>
        <div className="px-8 pb-8">
          <div className="relative -mt-16 flex items-end gap-6">
            <div className="relative group">
              <div className="h-32 w-32 rounded-3xl border-4 border-white bg-linear-to-br from-[#E1EAF7] to-[#B8D1F1] shadow-xl flex items-center justify-center text-5xl">
                {profile?.name?.charAt(0) || 'M'}
              </div>
              <button className="absolute -bottom-2 -right-2 rounded-full bg-white p-2 shadow-lg border border-[#D9E4F2] text-[#165BAA] hover:bg-[#F3F7FC] transition-colors">
                <Camera size={18} />
              </button>
            </div>
            <div className="mb-2 space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-[#102846]">{profile?.name}</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F7EE] px-3 py-1 text-xs font-bold text-[#15935A]">
                  <CheckCircle2 size={12} /> Verified Manager
                </span>
              </div>
              <p className="text-lg text-[#5D789A] font-medium">{profile?.designation || 'Senior Administrator'}</p>
              <div className="flex items-center gap-4 text-sm text-[#7A92AF]">
                <span className="flex items-center gap-1.5"><Building2 size={14} /> {profile?.organization || 'Quintes Global'}</span>
                <span className="flex items-center gap-1.5"><Globe size={14} /> {profile?.location || 'Mumbai, India'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Account Info */}
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl border border-[#D9E4F2] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#102846] flex items-center gap-2">
                <User className="text-[#165BAA]" size={20} /> Personal Information
              </h2>
              <button
                type="button"
                onClick={openEditProfile}
                className="text-sm font-bold text-[#165BAA] hover:underline"
              >
                Edit Profile
              </button>
            </div>

            {isEditOpen && (
              <div className="mb-6 rounded-xl border border-[#DCE8F6] bg-[#F8FBFF] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#102846]">Edit Profile Details</h3>
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    className="text-[#6E86A3] hover:text-[#3E5778]"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                  <button
                    type="button"
                    onClick={submitProfileUpdate}
                    disabled={isSavingProfile}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#165BAA] px-4 py-2 text-xs font-bold text-white hover:bg-[#124b8d] disabled:opacity-70"
                  >
                    {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    className="rounded-lg border border-[#D3DEEB] px-4 py-2 text-xs font-bold text-[#3F5878] hover:bg-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
              <InfoItem label="Full Name" value={profile?.name} icon={User} />
              <InfoItem label="Email Address" value={profile?.email} icon={Mail} />
              <InfoItem label="Employee ID" value={profile?.employeeId || 'QG-ADM-001'} icon={Shield} />
              <InfoItem label="Joined Date" value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'} icon={Calendar} />
              <InfoItem label="Direct Reports" value={profile?.role === 'admin' ? 'Administrative Access' : 'Managerial Access'} icon={Lock} />
              <InfoItem label="Access Level" value={(profile?.role || 'manager').toUpperCase()} icon={Shield} />
            </div>
          </section>

          <section className="rounded-2xl border border-[#D9E4F2] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#102846] mb-6 flex items-center gap-2">
              <Lock className="text-[#165BAA]" size={20} /> Security & Authentication
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-[#E9EFF7] bg-[#F8FBFF]">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-white border border-[#D9E4F2] flex items-center justify-center text-[#165BAA]">
                    <Lock size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-[#102846]">Password</p>
                    <p className="text-xs text-[#7A92AF]">Last changed 3 months ago</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordError(null);
                    setSuccessMessage(null);
                    setIsPasswordOpen((prev) => !prev);
                  }}
                  className="rounded-lg border border-[#D9E4F2] px-4 py-2 text-xs font-bold text-[#102846] hover:bg-white transition-colors"
                >
                  Change Password
                </button>
              </div>

              {isPasswordOpen && (
                <div className="rounded-xl border border-[#DCE8F6] bg-[#F8FBFF] p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                    <button
                      type="button"
                      onClick={submitPasswordChange}
                      disabled={isSavingPassword}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#165BAA] px-4 py-2 text-xs font-bold text-white hover:bg-[#124b8d] disabled:opacity-70"
                    >
                      {isSavingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Update Password
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPasswordOpen(false)}
                      className="rounded-lg border border-[#D3DEEB] px-4 py-2 text-xs font-bold text-[#3F5878] hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-4 rounded-xl border border-[#E9EFF7] bg-[#F8FBFF]">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-white border border-[#D9E4F2] flex items-center justify-center text-[#165BAA]">
                    <Shield size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-[#102846]">Multi-factor Authentication</p>
                    <p className="text-xs text-[#7A92AF]">Add an extra layer of security</p>
                  </div>
                </div>
                <button className="rounded-lg bg-[#E7F7EE] px-4 py-2 text-xs font-bold text-[#15935A]">Enabled</button>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column - Preferences */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#D9E4F2] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#102846] mb-6 flex items-center gap-2">
              <Settings2 className="text-[#165BAA]" size={20} /> Preferences
            </h2>
            <div className="space-y-5">
              <PreferenceToggle
                label="Email Notifications"
                description="Receive daily task summaries"
                value={prefs.emailNotifications}
                onChange={(value) => setPrefs((prev) => ({ ...prev, emailNotifications: value }))}
                icon={Bell}
              />
              <PreferenceToggle
                label="Analytics Dashboard"
                description="Show 6x6 metrics by default"
                value={prefs.analyticsDashboardDefault}
                onChange={(value) => setPrefs((prev) => ({ ...prev, analyticsDashboardDefault: value }))}
                icon={Globe}
              />
              <PreferenceToggle
                label="Desktop Alerts"
                description="Browser level notification alerts"
                value={prefs.desktopAlerts}
                onChange={(value) => setPrefs((prev) => ({ ...prev, desktopAlerts: value }))}
                icon={Bell}
              />
            </div>
          </section>

          <div className="rounded-2xl bg-linear-to-br from-[#003366] to-[#165BAA] p-6 text-white shadow-xl relative overflow-hidden">
            <Shield className="absolute -right-2 -bottom-2 h-24 w-24 text-white/10" />
            <h3 className="text-lg font-bold mb-2">Privacy Policy</h3>
            <p className="text-xs text-white/70 leading-relaxed mb-4">
              Your data is encrypted using enterprise-grade security. Only authorized users can see your performance metrics.
            </p>
            <button className="text-xs font-bold underline hover:text-white/90">View Data Policy</button>
          </div>
        </div>
      </div>
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

function InfoItem({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8AA0BA] flex items-center gap-1.5">
        <Icon size={12} /> {label}
      </p>
      <p className="text-base font-bold text-[#102846]">{value || 'Not Configured'}</p>
    </div>
  );
}

function PreferenceToggle({
  label,
  description,
  value,
  onChange,
  icon: Icon,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  icon: any;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-[#F8FBFF] border border-[#E9EFF7] flex items-center justify-center text-[#165BAA]">
          <Icon size={16} />
        </div>
        <div>
          <p className="text-sm font-bold text-[#102846]">{label}</p>
          <p className="text-[10px] text-[#7A92AF]">{description}</p>
        </div>
      </div>
      <button 
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${value ? 'bg-[#165BAA]' : 'bg-gray-200'}`}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
