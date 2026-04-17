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
  CheckCircle2
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

export default function PersonalProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#165BAA] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
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
                <span className="flex items-center gap-1.5"><Building2 size={14} /> Quintes Global</span>
                <span className="flex items-center gap-1.5"><Globe size={14} /> Mumbai, India</span>
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
              <button className="text-sm font-bold text-[#165BAA] hover:underline">Edit Profile</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
              <InfoItem label="Full Name" value={profile?.name} icon={User} />
              <InfoItem label="Email Address" value={profile?.email} icon={Mail} />
              <InfoItem label="Employee ID" value={profile?.employeeId || 'QG-ADM-001'} icon={Shield} />
              <InfoItem label="Joined Date" value="Oct 12, 2024" icon={Calendar} />
              <InfoItem label="Direct Reports" value="12 Team Members" icon={Lock} />
              <InfoItem label="Access Level" value="Administrator / Manager" icon={Shield} />
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
                <button className="rounded-lg border border-[#D9E4F2] px-4 py-2 text-xs font-bold text-[#102846] hover:bg-white transiton-colors">Change Password</button>
              </div>

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
              <PreferenceToggle label="Email Notifications" description="Receive daily task summaries" initialValue={true} icon={Bell} />
              <PreferenceToggle label="Analytics Dashboard" description="Show 6x6 metrics by default" initialValue={true} icon={Globe} />
              <PreferenceToggle label="Desktop Alerts" description="Browser level notification alerts" initialValue={false} icon={Bell} />
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

function PreferenceToggle({ label, description, initialValue, icon: Icon }: { label: string, description: string, initialValue: boolean, icon: any }) {
  const [enabled, setEnabled] = useState(initialValue);
  
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
        onClick={() => setEnabled(!enabled)}
        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${enabled ? 'bg-[#165BAA]' : 'bg-gray-200'}`}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
