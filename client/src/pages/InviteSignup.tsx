import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, MailCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { type AppAuthUser } from '../lib/authStorage';
import { apiFetch } from '../lib/api';

interface InviteSignupProps {
  onLogin: (user: AppAuthUser) => void;
}

export default function InviteSignupPage({ onLogin }: InviteSignupProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Normal signup flow - role is always manager on frontend (backend upgrades to admin if whitelisted)
  const roleParam = searchParams.get('role')?.trim().toLowerCase();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('QGGlobal');
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');


    if (!fullName.trim() || !email.trim()) {
      setError('Full name and email are required.');
      return;
    }

    if (!organization.trim()) {
      setError('Organization is required.');
      return;
    }

    if (!department.trim()) {
      setError('Department is required.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and confirmation do not match.');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await apiFetch('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          role: 'manager',
          organization: organization.trim(),
          department: department.trim(),
        })
      });

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null;

      if (!response.ok) {
        throw new Error(data?.message || 'Signup failed');
      }

      const nextUser: AppAuthUser = {
        name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role: 'manager',
        organization: organization.trim(),
        source: 'normal',
      };

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('bper.auth.token', data.token);
      }

      onLogin(nextUser);
      if (nextUser.role === 'admin') {
        navigate('/admin-portal', { replace: true });
      } else if (nextUser.role === 'manager') {
        navigate('/choose-portal', { replace: true });
      } else {
        navigate('/employee-portal', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#EAF2FB] px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-2xl">
        <div className="mb-5 text-center">
          <img
            src="https://quintesglobal.com/wp-content/uploads/2021/11/logo-quintesglobal-1.png"
            alt="QG Tools"
            className="mx-auto mb-3 h-14 w-auto"
          />
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#5E7EA6]">BPER Platform</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-[#102846]">Create your account</h1>
          <p className="mt-2 text-sm text-[#607A9A]">
            Sign up to access manager workflows and portal navigation.
          </p>
          
          <Alert className="mt-4 border-[#165BAA]/20 bg-[#165BAA]/5 text-[#102846] text-left">
              <AlertCircle className="h-4 w-4 text-[#165BAA]" />
              <AlertDescription className="text-xs ml-2">
                <strong>Note:</strong> Employee accounts are created through invitations. If you're joining as an employee, please contact your administrator for an invite.
              </AlertDescription>
          </Alert>
        </div>

        <div className="rounded-3xl border border-[#D9E4F2] bg-white p-6 shadow-[0_8px_24px_rgba(16,42,80,0.08)]">
          <div className="mb-5 rounded-2xl border border-[#DCE6F3] bg-[#F6FAFF] p-4 text-sm text-[#4E6787]">
            <p className="font-semibold text-[#102846]">Account role</p>
            <p className="mt-1 capitalize">manager</p>
            <p className="mt-4 font-semibold text-[#102846]">Organization</p>
            <p className="mt-1">{organization || 'Set during signup'}</p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4 border-none bg-destructive/10 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs ml-2">{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="fullName" className="text-[11px] font-bold uppercase tracking-wider text-[#667C99]">
                Full Name
              </Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Enter your full name"
                className="h-11 bg-[#F8FAFC] border-[#E2E8F0]"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="email" className="text-[11px] font-bold uppercase tracking-wider text-[#667C99]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 bg-[#F8FAFC] border-[#E2E8F0]"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="department" className="text-[11px] font-bold uppercase tracking-wider text-[#667C99]">
                Department
              </Label>
              <select
                id="department"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="h-11 w-full rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm outline-none transition-colors disabled:opacity-100 disabled:text-[#243A59] focus:border-[#165BAA] focus:ring-2 focus:ring-[#165BAA]/20"
              >
                <option value="" disabled>Select Department</option>
                <option value="F&A">F&A</option>
                <option value="HR">HR</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[11px] font-bold uppercase tracking-wider text-[#667C99]">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Create password"
                className="h-11 bg-[#F8FAFC] border-[#E2E8F0]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-[11px] font-bold uppercase tracking-wider text-[#667C99]">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                className="h-11 bg-[#F8FAFC] border-[#E2E8F0]"
              />
            </div>

            <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/auth/login')}>Back</Button>
              <Button type="submit" disabled={isLoading} className="bg-[#165BAA] hover:bg-[#124B8D]">
                <>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 auth-spinner" />}
                  Create Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              </Button>
            </div>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-6 text-center">
            <p className="text-sm text-[#607A9A]">
              Already part of the organization?{' '}
              <Link to="/auth/login" className="font-bold text-[#165BAA] hover:underline">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
