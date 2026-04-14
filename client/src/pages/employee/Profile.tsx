import { useEffect, useState } from 'react';
import { BriefcaseBusiness, Building2, Mail, MapPin, UserCircle2, Users, Loader2, type LucideIcon } from 'lucide-react';
import { apiFetch } from '../../lib/api';

export default function Profile() {
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      setIsLoading(true);
      try {
        const response = await apiFetch('/auth/me');
        if (response.ok) {
          setProfile(await response.json());
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProfile();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[#165BAA]" />
      </div>
    );
  }

  const profileFields = [
    { label: 'Employee ID', value: profile?.employeeId || '-', icon: UserCircle2 },
    { label: 'Employee Name', value: profile?.name || '-', icon: Users },
    { label: 'Employee Email', value: profile?.email || '-', icon: Mail },
    { label: 'Title', value: profile?.designation || '-', icon: BriefcaseBusiness },
    { label: 'Client', value: profile?.client || '-', icon: Building2 },
    { label: 'Location', value: profile?.location || '-', icon: MapPin },
    { label: 'Band', value: profile?.band || '-', icon: BriefcaseBusiness },
    { label: 'Employee Type', value: 'Permanent', icon: BriefcaseBusiness },
    { label: 'Name of Supervisor', value: profile?.supervisorName || '-', icon: Users },
    { label: 'Title of Supervisor', value: profile?.supervisorTitle || '-', icon: BriefcaseBusiness },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <nav className="flex items-center text-[10px] font-bold text-[#165BAA] uppercase tracking-[0.15em] mb-1">
          <span className="hover:opacity-80 cursor-pointer transition-opacity">OVERVIEW</span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-gray-400">PROFILE</span>
        </nav>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
            <p className="text-sm text-gray-500 max-w-3xl">
              Employee profile, role details, and reporting information for portal access.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm w-fit">
            <span className={`h-2 w-2 rounded-full ${profile?.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} /> {profile?.isActive ? 'Active' : 'Inactive'} Employee Record
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blue-100/90 mb-2">Employee Profile</p>
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{profile?.name}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-blue-100">
                  <span className="inline-flex items-center gap-1.5">
                    <UserCircle2 size={14} /> Employee ID {profile?.employeeId}
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

            <div className="grid grid-cols-2 gap-3 lg:w-[18rem]">
              <ProfilePill label="Employee Type" value="Full-Time" />
              <ProfilePill label="Client" value={profile?.client || 'BPER'} />
            </div>
          </div>
        </div>

        <div className="space-y-6 p-6 md:p-8">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600 shadow-sm">
            <p>
              This profile page provides a concise overview of employee identity, role, organizational details, and reporting line.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ProfileCard title="Identity" fields={profileFields.slice(0, 3)} />
            <ProfileCard title="Employment" fields={profileFields.slice(3, 8)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <ProfileCard title="Reporting" fields={profileFields.slice(8)} />

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#165BAA] font-semibold">Employee Snapshot</p>
              </div>
              <div className="grid gap-3 p-5">
                <MetricCard label="Designation" value={profile?.designation || '-'} />
                <MetricCard label="Client Unit" value={profile?.client || '-'} />
                <MetricCard label="Supervisor" value={profile?.supervisorName || '-'} />
                <MetricCard label="Supervisor Title" value={profile?.supervisorTitle || '-'} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-linear-to-br from-[#165BAA] to-[#0B2A55] p-6 text-white shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-blue-100 font-semibold mb-2">Profile Overview</p>
                <h3 className="text-2xl font-bold tracking-tight">Portal profile summary</h3>
                <p className="mt-2 text-sm text-blue-100/90 max-w-3xl">
                  A streamlined employee overview for quick access to role, location, and reporting information.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 md:min-w-72">
                <MiniStat label="Status" value={profile?.isActive ? 'Active' : 'Inactive'} />
                <MiniStat label="Access" value={profile?.role?.toUpperCase() || 'EMPLOYEE'} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 border border-white/10 px-4 py-3 backdrop-blur-sm">
      <p className="text-[10px] uppercase tracking-[0.18em] text-blue-100/80 font-semibold">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
