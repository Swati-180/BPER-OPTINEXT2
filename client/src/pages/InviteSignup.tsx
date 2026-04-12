import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { acceptInvite, findInviteByToken, type AppAuthUser } from '../lib/authStorage';

interface InviteSignupProps {
  onLogin: (user: AppAuthUser) => void;
}

export default function InviteSignupPage({ onLogin }: InviteSignupProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token')?.trim() ?? '';

  const invite = useMemo(() => (token ? findInviteByToken(token) : null), [token]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(invite?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!invite) {
      setError('This invite is invalid or expired. Please ask your manager to send a new invite.');
      return;
    }

    if (!fullName.trim() || !email.trim()) {
      setError('Full name and email are required.');
      return;
    }

    if (email.trim().toLowerCase() !== invite.email.toLowerCase()) {
      setError('The email must match the invited address.');
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
    await new Promise((resolve) => setTimeout(resolve, 900));

    acceptInvite(invite.token);
    const nextUser: AppAuthUser = {
      name: fullName.trim(),
      email: invite.email,
      role: 'employee',
      source: 'invite',
      inviteToken: invite.token,
    };

    onLogin(nextUser);
    navigate('/employee/dashboard', { replace: true });
    setIsLoading(false);
  };

  if (!invite) {
    return (
      <div className="min-h-screen bg-[#EAF2FB] px-4 py-10 flex items-center justify-center">
        <div className="w-full max-w-xl rounded-3xl border border-[#D9E4F2] bg-white p-6 shadow-[0_8px_24px_rgba(16,42,80,0.08)]">
          <div className="flex items-center gap-3 text-[#1E5EAB]">
            <MailCheck className="h-5 w-5" />
            <p className="text-sm font-bold uppercase tracking-[0.18em]">Invite Sign Up</p>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-[#102846]">Invite not found</h1>
          <p className="mt-2 text-sm text-[#607A9A]">
            The invite link is invalid or has already been replaced. Please contact your manager for a new invite.
          </p>
          <Button className="mt-5" onClick={() => navigate('/')}>
            Back to portal selection
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
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#5E7EA6]">BPER Invite</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-[#102846]">Complete your employee signup</h1>
          <p className="mt-2 text-sm text-[#607A9A]">
            Your manager invited you to the employee portal. Manager access is not shown for invited accounts.
          </p>
        </div>

        <div className="rounded-3xl border border-[#D9E4F2] bg-white p-6 shadow-[0_8px_24px_rgba(16,42,80,0.08)]">
          <div className="mb-5 rounded-2xl border border-[#DCE6F3] bg-[#F6FAFF] p-4 text-sm text-[#4E6787]">
            <p className="font-semibold text-[#102846]">Invited email</p>
            <p className="mt-1">{invite.email}</p>
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
              <Button type="button" variant="outline" onClick={() => navigate('/')}>Back</Button>
              <Button type="submit" disabled={isLoading} className="bg-[#165BAA] hover:bg-[#124B8D]">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Continue to Employee Portal
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
