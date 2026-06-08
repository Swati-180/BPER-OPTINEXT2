import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { API_ENDPOINTS } from '../lib/config';

type Stage = 'loading' | 'ready' | 'submitting' | 'success' | 'error';

export default function InviteRegistration() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>('loading');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function checkToken() {
      if (!token) {
        setMessage('Invalid invite link.');
        setStage('error');
        return;
      }
      try {
        const res = await fetch(`${API_ENDPOINTS.BASE}/invite/register/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setMessage(data.message || 'This invite link is invalid or expired.');
          setStage('error');
          return;
        }
        setName(data.name || '');
        setEmail(data.email || '');
        setStage('ready');
      } catch (e) {
        setMessage('Unable to verify invite link. Please try again.');
        setStage('error');
      }
    }
    checkToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setMessage('Passwords do not match.');
      return;
    }
    setMessage('');
    setStage('submitting');

    try {
      const res = await fetch(`${API_ENDPOINTS.BASE}/invite/register/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || 'Registration failed.');
        setStage('ready');
        return;
      }
      setStage('success');
    } catch (e) {
      setMessage('Registration failed. Please try again.');
      setStage('ready');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#165BAA]/8 to-slate-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img
            src="https://quintesglobal.com/wp-content/uploads/2021/11/logo-quintesglobal-1.png"
            alt="Quintes Global"
            className="h-14 object-contain"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-700 to-blue-600 px-8 py-6">
            <h1 className="text-2xl font-bold text-white tracking-tight">Complete Registration</h1>
            <p className="text-blue-200 text-sm mt-1">BPER Platform — Employee Account Setup</p>
          </div>

          <div className="px-8 py-7 space-y-5">
            {/* Loading */}
            {stage === 'loading' && (
              <div className="flex flex-col items-center py-6 gap-3 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-sm">Verifying invite link…</p>
              </div>
            )}

            {/* Error */}
            {stage === 'error' && (
              <div className="flex flex-col items-center py-6 gap-4 text-center">
                <AlertCircle className="h-10 w-10 text-red-500" />
                <p className="text-sm font-medium text-slate-700">{message}</p>
                <button
                  type="button"
                  onClick={() => navigate('/auth/login')}
                  className="rounded-lg bg-slate-800 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-900"
                >
                  Go to Login
                </button>
              </div>
            )}

            {/* Success */}
            {stage === 'success' && (
              <div className="flex flex-col items-center py-6 gap-4 text-center">
                <CheckCircle className="h-10 w-10 text-emerald-500" />
                <div>
                  <p className="text-lg font-bold text-slate-800">Registration Successful!</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Your account is ready. You can now log in with your email and password.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/auth/login')}
                  className="rounded-lg bg-blue-700 px-8 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
                >
                  Go to Login
                </button>
              </div>
            )}

            {/* Form */}
            {(stage === 'ready' || stage === 'submitting') && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name (read-only) */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Your Name
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                    {name}
                  </div>
                </div>

                {/* Email (read-only) */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Work Email
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                    {email}
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Create Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      required
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 pr-10 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* Error message */}
                {message && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                    <AlertCircle size={16} />
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={stage === 'submitting'}
                  className="w-full rounded-xl bg-blue-700 py-3 text-base font-bold text-white hover:bg-blue-800 disabled:opacity-60 transition-all shadow-lg shadow-blue-200/50"
                >
                  {stage === 'submitting' ? (
                    <span className="inline-flex items-center gap-2 justify-center">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating Account…
                    </span>
                  ) : (
                    'Create My Account'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => navigate('/auth/login')}
            className="text-blue-600 font-semibold hover:underline"
          >
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
