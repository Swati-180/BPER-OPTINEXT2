import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Eye, 
  EyeOff, 
  Building2, 
  FolderKanban, 
  ShieldCheck, 
  Clock, 
  UserCheck,
  Lock,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { API_ENDPOINTS } from '../lib/config';

type Stage = 'loading' | 'ready' | 'submitting' | 'success' | 'error';

export default function InviteRegistration() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>('loading');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('employee');
  const [department, setDepartment] = useState('');
  const [company, setCompany] = useState<{ _id: string; name: string; code: string } | null>(null);
  const [project, setProject] = useState<{ _id: string; name: string; code: string; department?: string } | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isExistingAccount, setIsExistingAccount] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [hasVerificationCodeIssued, setHasVerificationCodeIssued] = useState(false);

  // Form fields
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [existingUserPassword, setExistingUserPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [codeMessage, setCodeMessage] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function verifyToken() {
      if (!token) {
        setMessage('Invalid or missing invitation link.');
        setStage('error');
        return;
      }
      try {
        const res = await fetch(`${API_ENDPOINTS.BASE}/invite/register/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setMessage(data.message || 'This invitation link is invalid or expired.');
          setStage('error');
          return;
        }

        setName(data.name || '');
        setEmail(data.email || '');
        setRole(data.role || 'employee');
        setDepartment(data.department || '');
        setCompany(data.company || null);
        setProject(data.project || null);
        setExpiresAt(data.expiresAt || null);
        setIsExistingAccount(Boolean(data.isExistingAccount));
        setIsEmailVerified(Boolean(data.isEmailVerified));
        setHasVerificationCodeIssued(Boolean(data.hasVerificationCodeIssued));
        setStage('ready');
      } catch (e: any) {
        setMessage('Unable to reach server to verify invitation. Please check your connection.');
        setStage('error');
      }
    }
    verifyToken();
  }, [token]);

  const handleRequestVerificationCode = async () => {
    if (!token) return;
    setIsRequestingCode(true);
    setCodeMessage('');
    try {
      const res = await fetch(`${API_ENDPOINTS.BASE}/invite/request-verification/${token}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) {
        setCodeMessage(data.message || 'Failed to dispatch verification code.');
      } else {
        setHasVerificationCodeIssued(true);
        setCodeMessage(data.message);
        if (data.devCode) {
          setVerificationCode(data.devCode);
        }
      }
    } catch {
      setCodeMessage('Network error requesting verification code.');
    } finally {
      setIsRequestingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!token || !verificationCode) {
      setCodeMessage('Please enter the 6-digit code.');
      return;
    }
    setIsVerifyingCode(true);
    setCodeMessage('');
    try {
      const res = await fetch(`${API_ENDPOINTS.BASE}/invite/verify-email/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verificationCode })
      });
      const data = await res.json();
      if (!res.ok) {
        setCodeMessage(data.message || 'Verification code invalid or expired.');
      } else {
        setIsEmailVerified(true);
        setCodeMessage('✓ Email address verified successfully!');
      }
    } catch {
      setCodeMessage('Network error verifying code.');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (isExistingAccount) {
      if (!existingUserPassword) {
        setMessage('Please enter your existing BPER account password to verify identity.');
        return;
      }
    } else {
      if (hasVerificationCodeIssued && !isEmailVerified) {
        setMessage('Please verify your email ownership using the 6-digit code before activating.');
        return;
      }
      if (password.length < 6) {
        setMessage('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setMessage('Passwords do not match.');
        return;
      }
    }

    setStage('submitting');

    try {
      const res = await fetch(`${API_ENDPOINTS.BASE}/invite/register/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: isExistingAccount ? undefined : password,
          existingUserPassword: isExistingAccount ? existingUserPassword : undefined,
          verificationCode: isExistingAccount ? undefined : (verificationCode || undefined)
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || 'Account activation failed.');
        setStage('ready');
        return;
      }

      setStage('success');
    } catch (e) {
      setMessage('Network error during activation. Please try again.');
      setStage('ready');
    }
  };

  const getRoleDisplayName = (r: string) => {
    switch (r) {
      case 'company_admin': return 'Company Administrator';
      case 'project_admin': return 'Project Administrator';
      case 'manager': return 'Workforce Operations Manager';
      case 'employee': return 'Employee / Workforce Participant';
      default: return r.replace(/_/g, ' ').toUpperCase();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A192F] via-[#0F2744] to-[#1E3A8A] flex flex-col justify-center items-center p-4 font-sans text-slate-800">
      
      {/* Container Card */}
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-2xl border border-white/20 overflow-hidden animate-fadeIn">
        
        {/* Brand Header */}
        <div className="bg-[#0b192c] text-white p-6 sm:p-8 border-b border-white/10 relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-36 h-36 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#165BAA] to-[#1E73D1] flex items-center justify-center font-black text-white shadow-lg text-base">
              BP
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                BPER Platform
                <span className="bg-blue-500/20 text-blue-200 border border-blue-400/40 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                  Account Activation
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">Business Process Excellence Review Portal</p>
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-6 sm:p-8 space-y-6">
          
          {/* Loading State */}
          {stage === 'loading' && (
            <div className="py-16 text-center space-y-4">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
              <p className="text-sm font-bold text-slate-700">Verifying your secure invitation link...</p>
              <p className="text-xs text-slate-400">Validating cryptographic credentials with BPER platform</p>
            </div>
          )}

          {/* Error State */}
          {stage === 'error' && (
            <div className="py-8 text-center space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center mx-auto shadow-sm">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">Invitation Invalid or Expired</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">{message}</p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-10 rounded-xl font-bold transition-all shadow-sm"
              >
                Go to BPER Login
              </button>
            </div>
          )}

          {/* Success State */}
          {stage === 'success' && (
            <div className="py-8 text-center space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">Account Activated Successfully!</h2>
                <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                  Your BPER account and authorized enterprise memberships are ready. You can now log in using your credentials.
                </p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-10 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <span>Proceed to BPER Login</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Ready & Submitting States: The Activation Form */}
          {(stage === 'ready' || stage === 'submitting') && (
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Invitation Scope Summary Card */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-4 space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/60">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Invited Role</span>
                  <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                    {getRoleDisplayName(role)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 block">Invited User</span>
                    <strong className="text-slate-800 truncate block">{name}</strong>
                    <span className="text-[11px] text-slate-500 truncate block">{email}</span>
                  </div>

                  {company && (
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block">Company</span>
                      <strong className="text-slate-800 truncate block">{company.name}</strong>
                      <span className="text-[10px] font-mono font-bold text-slate-500">[{company.code}]</span>
                    </div>
                  )}
                </div>

                {project && (
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Project Workspace:</span>
                    <strong className="text-slate-800">{project.name} ({project.code})</strong>
                  </div>
                )}
              </div>

              {/* Existing Account Notice */}
              {isExistingAccount ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-amber-600" />
                    Existing BPER Account Detected
                  </p>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    This email is already registered in BPER. Enter your existing password to verify ownership and link your new authorized role.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 leading-relaxed">
                  To complete your onboarding, set a secure password for your account.
                </p>
              )}

              {message && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{message}</span>
                </div>
              )}

              {/* Password Inputs */}
              {isExistingAccount ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Enter Your Current Password *</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={existingUserPassword}
                      onChange={e => setExistingUserPassword(e.target.value)}
                      placeholder="Your current password"
                      required
                      className="w-full h-10 px-3 pr-10 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Email Ownership Verification Box (Security Requirement 2) */}
                  <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        Email Ownership Verification
                      </span>
                      {isEmailVerified ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Verified
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                          Required
                        </span>
                      )}
                    </div>
                    
                    <p className="text-[11px] text-blue-800 leading-relaxed">
                      To ensure security and prevent unauthorized access via forwarded links, confirm ownership of <strong>{email}</strong>.
                    </p>

                    {!isEmailVerified && (
                      <div className="space-y-2 pt-1">
                        {!hasVerificationCodeIssued ? (
                          <button
                            type="button"
                            onClick={handleRequestVerificationCode}
                            disabled={isRequestingCode}
                            className="text-xs bg-[#165BAA] hover:bg-[#124a8a] text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
                          >
                            {isRequestingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                            <span>Send Verification Code</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              maxLength={6}
                              placeholder="6-digit code"
                              value={verificationCode}
                              onChange={e => setVerificationCode(e.target.value)}
                              className="h-8 w-32 px-2.5 text-xs font-mono font-bold tracking-widest border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              type="button"
                              onClick={handleVerifyCode}
                              disabled={isVerifyingCode || !verificationCode}
                              className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white px-3 rounded-lg font-semibold flex items-center gap-1 disabled:opacity-50"
                            >
                              {isVerifyingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              <span>Verify Code</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleRequestVerificationCode}
                              disabled={isRequestingCode}
                              className="text-[11px] text-blue-700 hover:underline px-1"
                            >
                              Resend
                            </button>
                          </div>
                        )}

                        {codeMessage && (
                          <p className={`text-[11px] font-medium ${codeMessage.includes('✓') ? 'text-emerald-700' : 'text-blue-700'}`}>
                            {codeMessage}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Create New Password *</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        required
                        className="w-full h-10 px-3 pr-10 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Confirm Password *</label>
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      required
                      className="w-full h-10 px-3 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={stage === 'submitting'}
                className="w-full h-10 bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
              >
                {stage === 'submitting' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Activating Account...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>{isExistingAccount ? 'Verify & Link Membership' : 'Accept & Activate Account'}</span>
                  </>
                )}
              </button>

              {expiresAt && (
                <p className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3" />
                  Invitation expires on {new Date(expiresAt).toLocaleDateString()} at {new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </form>
          )}

        </div>
      </div>
      
      {/* Footer Branding */}
      <p className="text-[11px] text-slate-400 mt-6 text-center">
        &copy; {new Date().getFullYear()} BPER Platform &middot; Enterprise Workforce & Process Governance
      </p>
    </div>
  );
}
