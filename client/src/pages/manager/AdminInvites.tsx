import React, { useEffect, useMemo, useState } from 'react';
import { Mail, RefreshCw, ShieldCheck, UserPlus, XCircle, CheckCircle, Clock } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface AdminInvite {
  _id: string;
  name: string;
  email: string;
  role: string;
  status: 'pending' | 'sent' | 'registered' | 'failed';
  inviteLink: string;
  createdAt?: string;
  sentAt?: string;
  registeredAt?: string;
  errorMessage?: string;
}

export default function AdminInvites() {
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const loadInvites = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/invite/admin-invites');
      if (res.ok) {
        const data = await res.json();
        setInvites(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to load admin invites', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvites();
  }, []);

  const pendingCount = useMemo(() => invites.filter((invite) => invite.status === 'pending').length, [invites]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await apiFetch('/invite/admin-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role: 'admin' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Unable to create invite');
      setMessage(data.message || 'Admin invite created.');
      setName('');
      setEmail('');
      await loadInvites();
    } catch (error: any) {
      setMessage(error.message || 'Unable to create invite');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (id: string) => {
    setResendingId(id);
    try {
      const res = await apiFetch(`/invite/admin-invites/${id}/resend`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Unable to resend invite');
      setMessage(data.message || 'Invite resent.');
      await loadInvites();
    } catch (error: any) {
      setMessage(error.message || 'Unable to resend invite');
    } finally {
      setResendingId(null);
    }
  };

  const handleCancel = async (id: string) => {
    setCancelingId(id);
    try {
      const res = await apiFetch(`/invite/admin-invites/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Unable to cancel invite');
      setMessage(data.message || 'Invite cancelled.');
      await loadInvites();
    } catch (error: any) {
      setMessage(error.message || 'Unable to cancel invite');
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Invites</h1>
          <p className="mt-1 text-sm text-slate-500">Invite new administrators and manage pending admin access requests.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
          <ShieldCheck size={14} />
          {pendingCount} pending admin invite{pendingCount === 1 ? '' : 's'}
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-800">
            <UserPlus size={18} />
            <h2 className="text-lg font-semibold">Invite a new Admin</h2>
          </div>
          <p className="mt-2 text-sm text-slate-500">Send an email invitation to create an administrator account.</p>

          <form onSubmit={handleCreate} className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                placeholder="Jordan Lee"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                placeholder="admin@company.com"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Mail size={14} />}
              {submitting ? 'Creating invite…' : 'Send Admin Invite'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-800">
            <Mail size={18} />
            <h2 className="text-lg font-semibold">Pending invitations</h2>
          </div>
          <p className="mt-2 text-sm text-slate-500">Resend or cancel invitations before they are accepted.</p>

          {loading ? (
            <div className="mt-5 text-sm text-slate-500">Loading admin invites…</div>
          ) : invites.length === 0 ? (
            <div className="mt-5 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              No admin invitations yet.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {invites.map((invite) => (
                <div key={invite._id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-800">{invite.name}</div>
                      <div className="text-sm text-slate-500">{invite.email}</div>
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      {invite.status === 'pending' && <Clock size={11} />}
                      {invite.status === 'sent' && <CheckCircle size={11} />}
                      {invite.status === 'registered' && <CheckCircle size={11} />}
                      {invite.status === 'failed' && <XCircle size={11} />}
                      {invite.status}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <button
                      type="button"
                      onClick={() => handleResend(invite._id)}
                      disabled={resendingId === invite._id || invite.status === 'registered'}
                      className="rounded-md border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {resendingId === invite._id ? 'Resending…' : 'Resend'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancel(invite._id)}
                      disabled={cancelingId === invite._id || invite.status === 'registered'}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {cancelingId === invite._id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
