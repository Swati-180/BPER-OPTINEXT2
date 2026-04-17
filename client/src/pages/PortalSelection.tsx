import { ArrowRight, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PortalSelectionPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#EAF2FB] px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-5xl">
        <div className="mb-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#5E7EA6]">BPER Platform</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-[#102846]">Choose your portal</h1>
          <p className="mt-2 text-sm text-[#607A9A]">Select the workspace you want to open for this session.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate('/employee-portal')}
            className="group rounded-3xl border border-[#D9E4F2] bg-white p-6 text-left shadow-[0_8px_24px_rgba(16,42,80,0.08)] transition-transform hover:-translate-y-1"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF4FF] text-[#1E5EAB]">
                <UserRound className="h-7 w-7" />
              </div>
              <ArrowRight className="h-5 w-5 text-[#90A4BC] transition-transform group-hover:translate-x-1" />
            </div>
            <h2 className="mt-5 text-2xl font-bold text-[#102846]">Employee Portal</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#607A9A]">
              Submit BPER forms, track status, and review your work profile.
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate('/manager-portal')}
            className="group rounded-3xl border border-[#D9E4F2] bg-white p-6 text-left shadow-[0_8px_24px_rgba(16,42,80,0.08)] transition-transform hover:-translate-y-1"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF4FF] text-[#1E5EAB]">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <ArrowRight className="h-5 w-5 text-[#90A4BC] transition-transform group-hover:translate-x-1" />
            </div>
            <h2 className="mt-5 text-2xl font-bold text-[#102846]">Manager Portal</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#607A9A]">
              Review employee submissions, manage users, and analyze workload.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
