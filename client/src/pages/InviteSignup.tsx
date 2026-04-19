import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { type AppAuthUser } from '../lib/authStorage';
import { API_ENDPOINTS } from '../lib/config';

interface InviteSignupProps {
  onLogin: (user: AppAuthUser) => void;
}

export default function InviteSignupPage({ onLogin }: InviteSignupProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roleParam = searchParams.get('role')?.trim().toLowerCase();
  const orgParam = searchParams.get('org')?.trim() ?? '';
  const isEmployeeInvite = roleParam === 'employee' && orgParam.length > 0;
  const isBlockedEmployeeSignup = roleParam === 'employee' && !orgParam;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState(isEmployeeInvite ? orgParam : '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (isBlockedEmployeeSignup) {
      setError('Employee signup is allowed only via invite URL with organization details.');
      return;
    }

    if (!fullName.trim() || !email.trim()) {
      setError('Full name and email are required.');
      return;
    }

    if (!organization.trim()) {
      setError('Organization is required.');
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
      const response = await fetch(`${API_ENDPOINTS.AUTH}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          role: isEmployeeInvite ? 'employee' : 'manager',
          organization: organization.trim(),
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Signup failed');
      }

      const nextUser: AppAuthUser = {
        name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role: (isEmployeeInvite ? 'employee' : 'manager'),
        organization: organization.trim(),
        source: isEmployeeInvite ? 'invite' : 'normal',
      };

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('bper.auth.token', data.token);
      }

      onLogin(nextUser);
      navigate(nextUser.role === 'manager' ? '/choose-portal' : '/employee-portal', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (isBlockedEmployeeSignup) {
    return (
      <div className="min-h-screen bg-[#EAF2FB] px-4 py-10 flex items-center justify-center">
        <div className="w-full max-w-xl rounded-3xl border border-[#D9E4F2] bg-white p-6 shadow-[0_8px_24px_rgba(16,42,80,0.08)]">
          <div className="flex items-center gap-3 text-[#1E5EAB]">
            <MailCheck className="h-5 w-5" />
            <p className="text-sm font-bold uppercase tracking-[0.18em]">Sign Up</p>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-[#102846]">Invite link required</h1>
          <p className="mt-2 text-sm text-[#607A9A]">
            Employee signup is available only through an invite URL that includes your organization.
          </p>
          <Button className="mt-5" onClick={() => navigate('/auth/login')}>
            Back to login
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EAF2FB] px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-2xl">
        <div className="mb-5 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#5E7EA6]">BPER Platform</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-[#102846]">{isEmployeeInvite ? 'Complete your employee signup' : 'Create your manager account'}</h1>
          <p className="mt-2 text-sm text-[#607A9A]">
            {isEmployeeInvite
              ? 'Your invite URL has prefilled your role and organization for secure onboarding.'
              : 'Sign up to access manager workflows and portal navigation.'}
          </p>
        </div>

        <div className="rounded-3xl border border-[#D9E4F2] bg-white p-6 shadow-[0_8px_24px_rgba(16,42,80,0.08)]">
          <div className="mb-5 rounded-2xl border border-[#DCE6F3] bg-[#F6FAFF] p-4 text-sm text-[#4E6787]">
            <p className="font-semibold text-[#102846]">Account role</p>
            <p className="mt-1 capitalize">{isEmployeeInvite ? 'employee' : 'manager'}</p>
            <p className="mt-4 font-semibold text-[#102846]">Organization</p>
            <p className="mt-1">{organization || 'Set during signup'}</p>
            {isEmployeeInvite && (
              <p className="mt-4 rounded-xl bg-[#E8F0FF] p-3 text-xs text-[#3656A8]">
                This is an invited employee signup link. Your account will be created as an employee user for {organization}.
              </p>
            )}
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
              <Label htmlFor="organization" className="text-[11px] font-bold uppercase tracking-wider text-[#667C99]">
                Organization
              </Label>
              <Input
                id="organization"
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
                disabled={isEmployeeInvite}
                placeholder="Enter organization name"
                className="h-11 bg-[#F8FAFC] border-[#E2E8F0] disabled:opacity-100 disabled:text-[#243A59]"
              />
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
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    {isEmployeeInvite ? 'Continue to Employee Portal' : 'Continue to Portal Selection'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-6 text-center">
            <p className="text-sm text-[#607A9A]">
              Already part of the organization?{' '}
              <Link to="/auth/login/employee" className="font-bold text-[#165BAA] hover:underline">
                Log in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
