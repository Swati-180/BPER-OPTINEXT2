import React, { useEffect, useState, useRef } from 'react';
import {
  Upload, Send, Copy, RefreshCw, CheckCircle, Clock, AlertCircle, XCircle,
  Users, Mail, Filter, Download, MailX
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface Invite {
  _id: string;
  name: string;
  email: string;
  employeeId?: string;
  status: 'pending' | 'sent' | 'registered' | 'failed';
  deliveryStatus?: 'pending' | 'email_sent' | 'link_copied' | 'manually_shared' | 'delivery_failed' | 'unknown';
  registrationStatus?: 'not_registered' | 'registered' | 'expired' | 'registration_failed';
  inviteLink: string;
  sentAt?: string;
  expiresAt?: string;
  linkCopiedAt?: string;
  manuallySharedAt?: string;
  registeredAt?: string;
  registrationFailedAt?: string;
  registrationFailureReason?: string;
  createdAt?: string;
  errorMessage?: string;
}

type ParsedRow = { name: string; email: string; employeeId?: string; rowNum: number; error?: string };

const DELIVERY_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending Dispatch', color: 'bg-slate-100 text-slate-700', icon: Clock },
  email_sent: { label: 'Email Sent', color: 'bg-blue-100 text-blue-700', icon: Mail },
  link_copied: { label: 'Link Copied', color: 'bg-indigo-100 text-indigo-700', icon: Copy },
  manually_shared: { label: 'Manually Shared', color: 'bg-purple-100 text-purple-700', icon: CheckCircle },
  delivery_failed: { label: 'Delivery Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
  unknown: { label: 'Direct / Legacy', color: 'bg-slate-100 text-slate-600', icon: Users },
};

const REGISTRATION_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  not_registered: { label: 'Awaiting Signup', color: 'bg-amber-100 text-amber-800', icon: Clock },
  registered: { label: 'Registered', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
  expired: { label: 'Expired', color: 'bg-rose-100 text-rose-800', icon: AlertCircle },
  registration_failed: { label: 'Reg. Failed', color: 'bg-red-100 text-red-800', icon: XCircle },
};

function DualStatusPills({ invite }: { invite: Invite }) {
  // Normalize delivery status
  const dKey = invite.deliveryStatus || (invite.sentAt ? 'email_sent' : (invite.status === 'failed' ? 'delivery_failed' : (invite.status === 'sent' ? 'email_sent' : (invite.status === 'registered' ? 'unknown' : 'pending'))));
  const dConf = DELIVERY_CONFIG[dKey] || DELIVERY_CONFIG.pending;
  const DIcon = dConf.icon;

  // Normalize registration status
  const isReg = invite.registrationStatus === 'registered' || invite.status === 'registered';
  const isFailed = invite.registrationStatus === 'registration_failed';
  const isExpired = !isReg && !isFailed && (invite.registrationStatus === 'expired' || (invite.expiresAt ? new Date(invite.expiresAt) < new Date() : false));
  const rKey = isReg ? 'registered' : (isFailed ? 'registration_failed' : (isExpired ? 'expired' : 'not_registered'));
  const rConf = REGISTRATION_CONFIG[rKey] || REGISTRATION_CONFIG.not_registered;
  const RIcon = rConf.icon;

  return (
    <div className="flex flex-col gap-1 items-start">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${dConf.color}`}>
        <DIcon size={10} />
        {dConf.label}
      </span>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${rConf.color}`}>
        <RIcon size={10} />
        {rConf.label}
      </span>
    </div>
  );
}

export default function EmployeeInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [sendingAll, setSendingAll] = useState(false);
  const [sendAllResult, setSendAllResult] = useState<string | null>(null);
  const [tab, setTab] = useState<'status' | 'upload'>('status');
  const [copied, setCopied] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Upload state
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [invalidRows, setInvalidRows] = useState<ParsedRow[]>([]);
  const [previewDone, setPreviewDone] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadInvites = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/invite/status');
      if (res.ok) {
        const data = await res.json();
        setInvites(data);
      }
    } catch (e) {
      console.error('Failed to load invites', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvites();
  }, []);

  // Calculate reviewer-aligned hierarchical & operational metrics
  const now = new Date();
  const counts = {
    total: invites.length,
    pending: 0,
    // Dispatched Main Funnel (Mutually exclusive partition of Total Dispatched)
    totalDispatched: 0,
    registered: 0,
    awaitingRegistration: 0, // Active, unexpired awaiting signup
    expiredUnregistered: 0,  // Expired / Not registered
    registrationFailed: 0,   // Permanent registration failures
    // Diagnostic indicators (Non-additive operational alerts)
    totalExpired: 0,
    deliveryFailed: 0,
    linkCopied: 0,
  };

  invites.forEach(i => {
    const isReg = i.registrationStatus === 'registered' || i.status === 'registered';
    const isRegFailed = !isReg && (i.registrationStatus === 'registration_failed');
    const isExpired = !isReg && !isRegFailed && (i.registrationStatus === 'expired' || (i.expiresAt ? new Date(i.expiresAt) < now : false));

    // Diagnostic total expired links
    if (isExpired) {
      counts.totalExpired++;
    }

    // Main Dispatched Funnel Membership
    // An invite is part of "Total Dispatched" if:
    // 1) It successfully registered (receipt proven across all channels)
    // 2) Registration was attempted and failed permanently (link was received)
    // 3) Delivery was confirmed via SMTP (email_sent) or explicit manual share (manually_shared)
    const isDispatched = isReg || isRegFailed || i.deliveryStatus === 'email_sent' || i.deliveryStatus === 'manually_shared' || i.status === 'sent';
    if (isDispatched) {
      counts.totalDispatched++;
      // Mutually exclusive breakdown of Total Dispatched:
      if (isReg) {
        counts.registered++;
      } else if (isRegFailed) {
        counts.registrationFailed++;
      } else if (isExpired) {
        counts.expiredUnregistered++;
      } else {
        counts.awaitingRegistration++;
      }
    }

    // Pending to be Sent
    // Only invites that have not been dispatched and not registered
    if (!isDispatched && (i.deliveryStatus === 'pending' || i.status === 'pending') && !isReg && !isRegFailed) {
      counts.pending++;
    }

    // Operational Attention Counts (Diagnostic views - not additive with Total Dispatched)
    if (!isReg && (i.deliveryStatus === 'delivery_failed' || i.status === 'failed')) {
      counts.deliveryFailed++;
    }
    if (!isReg && !isRegFailed && i.deliveryStatus === 'link_copied') {
      counts.linkCopied++;
    }
  });

  const filteredInvites = invites.filter(i => {
    if (filter === 'all') return true;
    const isReg = i.registrationStatus === 'registered' || i.status === 'registered';
    const isRegFailed = !isReg && (i.registrationStatus === 'registration_failed');
    const isExpired = !isReg && !isRegFailed && (i.registrationStatus === 'expired' || (i.expiresAt && new Date(i.expiresAt) < now));
    const isDispatched = isReg || isRegFailed || i.deliveryStatus === 'email_sent' || i.deliveryStatus === 'manually_shared' || i.status === 'sent';

    if (filter === 'dispatched') return isDispatched;
    if (filter === 'registered') return isReg;
    if (filter === 'awaiting') return isDispatched && !isReg && !isRegFailed && !isExpired;
    if (filter === 'expired_unregistered') return isDispatched && isExpired;
    if (filter === 'registration_failed') return isRegFailed;
    if (filter === 'pending') return !isDispatched && (i.deliveryStatus === 'pending' || i.status === 'pending');
    if (filter === 'expired') return isExpired;
    if (filter === 'failed') return !isReg && (i.deliveryStatus === 'delivery_failed' || i.status === 'failed');
    if (filter === 'link_copied') return !isReg && !isRegFailed && i.deliveryStatus === 'link_copied';
    return true;
  });

  const copyLink = async (link: string, id: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
      // Record copy event in backend
      await apiFetch(`/invite/${id}/mark-copied`, { method: 'POST' });
      await loadInvites();
    } catch (e) {
      console.error('Failed to copy link or record event', e);
    }
  };

  const handleConfirmShared = async (id: string) => {
    try {
      await apiFetch(`/invite/${id}/confirm-shared`, { method: 'POST' });
      await loadInvites();
    } catch (e) {
      alert('Failed to confirm manual share');
    }
  };

  const handleSendAll = async () => {
    setSendingAll(true);
    setSendAllResult(null);
    try {
      const res = await apiFetch('/invite/send', { method: 'POST' });
      const data = await res.json();
      setSendAllResult(data.message || 'Done');
      await loadInvites();
    } catch (e) {
      setSendAllResult('Failed to send invites.');
    } finally {
      setSendingAll(false);
    }
  };

  const handleResend = async (id: string) => {
    setResendingId(id);
    try {
      const res = await apiFetch(`/invite/resend/${id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSendAllResult(data.message);
        await loadInvites();
      } else {
        alert(data.message || 'Resend failed');
      }
    } catch (e) {
      alert('Failed to resend invite');
    } finally {
      setResendingId(null);
    }
  };

  // ─── Upload flow ───────────────────────────────────────────────────────────
  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    // Check header
    const firstLine = lines[0].toLowerCase();
    const hasHeader = (firstLine.includes('name') && firstLine.includes('email')) || firstLine.includes('employee');
    const startIdx = hasHeader ? 1 : 0;

    // Detect header layout if present
    let nameIdx = 0;
    let emailIdx = 1;
    let empIdIdx = 2;
    if (hasHeader) {
      const headers = firstLine.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      nameIdx = headers.findIndex(h => h.includes('name'));
      emailIdx = headers.findIndex(h => h.includes('email'));
      empIdIdx = headers.findIndex(h => h.includes('id') || h.includes('employee'));
      if (nameIdx === -1) nameIdx = 0;
      if (emailIdx === -1) emailIdx = 1;
    }

    return lines.slice(startIdx).map((line, i) => {
      const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      const name = parts[nameIdx] || parts[0] || '';
      const email = parts[emailIdx] || parts[1] || '';
      const employeeId = (empIdIdx !== -1 && parts[empIdIdx]) ? parts[empIdIdx] : (parts.length > 2 ? parts[2] : undefined);
      return { name, email, employeeId, rowNum: startIdx + i + 1 };
    });
  };

  const handlePreview = async () => {
    const rows = parseCSV(csvText);
    try {
      const res = await apiFetch('/invite/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
      });
      const data = await res.json();
      setParsedRows(data.valid || []);
      setInvalidRows(data.invalid || []);
      setPreviewDone(true);
    } catch (e) {
      alert('Preview failed');
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setConfirmResult(null);
    try {
      const res = await apiFetch('/invite/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows })
      });
      const data = await res.json();
      setConfirmResult(data.message || 'Saved');
      await loadInvites();
      setTab('status');
      setCsvText('');
      setParsedRows([]);
      setInvalidRows([]);
      setPreviewDone(false);
    } catch (e) {
      setConfirmResult('Failed to save invites');
    } finally {
      setConfirming(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string || '');
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Employee Invites</h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload employee lists, generate invite links, and track registration status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadInvites}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          {counts.pending > 0 && (
            <button
              type="button"
              onClick={handleSendAll}
              disabled={sendingAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
            >
              <Send size={14} />
              {sendingAll ? 'Sending…' : `Send Invites (${counts.pending})`}
            </button>
          )}
        </div>
      </div>

      {sendAllResult && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 flex items-center gap-2">
          <AlertCircle size={16} />
          {sendAllResult}
          <button onClick={() => setSendAllResult(null)} className="ml-auto text-blue-400 hover:text-blue-600">✕</button>
        </div>
      )}



      {/* Reviewer-Aligned Executive Onboarding Hierarchy */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        {/* Main Pipeline Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Total Invitations */}
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-xl border p-4 text-left transition-all ${filter === 'all' ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
          >
            <div className="text-3xl font-extrabold text-slate-900">{counts.total}</div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-1">Total Invitations</div>
            <p className="text-[11px] text-slate-400 mt-1">Total employee upload/target roster pool</p>
          </button>

          {/* Card 2: Pending Dispatch */}
          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`rounded-xl border p-4 text-left transition-all ${filter === 'pending' ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
          >
            <div className="text-3xl font-extrabold text-slate-700">{counts.pending}</div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mt-1">Pending to be Sent</div>
            <p className="text-[11px] text-slate-400 mt-1">Queued for email dispatch</p>
          </button>

          {/* Card 3: Total Sent / Dispatched Funnel */}
          <div className={`rounded-xl border p-4 transition-all ${filter === 'dispatched' ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20' : 'border-slate-200 bg-slate-50/50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <button
                  type="button"
                  onClick={() => setFilter('dispatched')}
                  className="text-3xl font-extrabold text-blue-700 hover:underline"
                >
                  {counts.totalDispatched}
                </button>
                <div className="text-xs font-bold uppercase tracking-wider text-blue-800 mt-0.5">Total Sent</div>
              </div>
              <span className="text-[10px] font-semibold text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded">
                Dispatched Funnel
              </span>
            </div>

            {/* Sub-Funnel Breakdown: Mutually exclusive partition of Total Sent */}
            <div className="grid grid-cols-4 gap-1.5 mt-3 pt-3 border-t border-slate-200/80 text-left">
              <button
                type="button"
                onClick={() => setFilter('registered')}
                className={`p-2 rounded-lg border transition-all ${filter === 'registered' ? 'bg-emerald-100/80 border-emerald-400 text-emerald-900 ring-1 ring-emerald-400' : 'bg-white border-slate-200/80 hover:border-emerald-300'}`}
              >
                <div className="text-lg font-bold text-emerald-700 leading-tight">{counts.registered}</div>
                <div className="text-[10px] font-bold text-emerald-800 tracking-tight">Registered</div>
              </button>

              <button
                type="button"
                onClick={() => setFilter('awaiting')}
                className={`p-2 rounded-lg border transition-all ${filter === 'awaiting' ? 'bg-amber-100/80 border-amber-400 text-amber-900 ring-1 ring-amber-400' : 'bg-white border-slate-200/80 hover:border-amber-300'}`}
              >
                <div className="text-lg font-bold text-amber-700 leading-tight">{counts.awaitingRegistration}</div>
                <div className="text-[10px] font-bold text-amber-800 tracking-tight leading-tight">Awaiting Signup</div>
              </button>

              <button
                type="button"
                onClick={() => setFilter('expired_unregistered')}
                className={`p-2 rounded-lg border transition-all ${filter === 'expired_unregistered' ? 'bg-rose-100/80 border-rose-400 text-rose-900 ring-1 ring-rose-400' : 'bg-white border-slate-200/80 hover:border-rose-300'}`}
              >
                <div className="text-lg font-bold text-rose-700 leading-tight">{counts.expiredUnregistered}</div>
                <div className="text-[10px] font-bold text-rose-800 tracking-tight leading-tight">Expired / Not Reg.</div>
              </button>

              <button
                type="button"
                onClick={() => setFilter('registration_failed')}
                className={`p-2 rounded-lg border transition-all ${filter === 'registration_failed' ? 'bg-red-100/80 border-red-400 text-red-900 ring-1 ring-red-400' : 'bg-white border-slate-200/80 hover:border-red-300'}`}
              >
                <div className="text-lg font-bold text-red-700 leading-tight">{counts.registrationFailed}</div>
                <div className="text-[10px] font-bold text-red-800 tracking-tight leading-tight">Reg. Failed</div>
              </button>
            </div>
          </div>
        </div>

        {/* Operational Attention Indicators (Diagnostic views — non-additive) */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px] uppercase tracking-wider font-semibold mr-1">
            Operational Attention (Diagnostic indicators — non-additive):
          </span>
          {counts.totalExpired > 0 && (
            <button
              type="button"
              onClick={() => setFilter('expired')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold transition-colors ${filter === 'expired' ? 'bg-rose-100 border-rose-300 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
            >
              <AlertCircle size={12} className="text-rose-600" />
              <span>{counts.totalExpired} Expired Links (Renew)</span>
            </button>
          )}
          {counts.deliveryFailed > 0 && (
            <button
              type="button"
              onClick={() => setFilter('failed')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold transition-colors ${filter === 'failed' ? 'bg-red-100 border-red-300 text-red-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
            >
              <XCircle size={12} className="text-red-600" />
              <span>{counts.deliveryFailed} Delivery Failed (Retry)</span>
            </button>
          )}
          {counts.linkCopied > 0 && (
            <button
              type="button"
              onClick={() => setFilter('link_copied')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold transition-colors ${filter === 'link_copied' ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
            >
              <Copy size={12} className="text-indigo-600" />
              <span>{counts.linkCopied} Copied (Unconfirmed)</span>
            </button>
          )}
          {counts.totalExpired === 0 && counts.deliveryFailed === 0 && counts.linkCopied === 0 && (
            <span className="text-slate-400 font-medium">No expired links or delivery issues detected.</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('status')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === 'status' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <span className="inline-flex items-center gap-1.5"><Users size={14} /> Invite List</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('upload')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === 'upload' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <span className="inline-flex items-center gap-1.5"><Upload size={14} /> Upload New List</span>
        </button>
      </div>

      {/* Status tab */}
      {tab === 'status' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm">Loading invites…</div>
          ) : filteredInvites.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No invites {filter !== 'all' ? `with status "${filter}"` : ''} yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">Employee ID</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Invite Link</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvites.map(invite => (
                    <tr key={invite._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 text-xs font-mono font-semibold text-slate-700">
                        {invite.employeeId || '—'}
                      </td>
                      <td className="py-3 px-4 text-sm font-semibold text-slate-800">{invite.name}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{invite.email}</td>
                      <td className="py-3 px-4">
                        <DualStatusPills invite={invite} />
                        {invite.errorMessage && (
                          <div
                            className={`text-[10px] mt-1 max-w-[220px] truncate ${
                              (invite.registrationStatus === 'registered' || invite.status === 'registered')
                                ? 'text-slate-400 italic'
                                : 'text-red-500 font-medium'
                            }`}
                            title={invite.errorMessage}
                          >
                            {(invite.registrationStatus === 'registered' || invite.status === 'registered')
                              ? `Historical note: ${invite.errorMessage}`
                              : invite.errorMessage}
                          </div>
                        )}
                        {invite.registrationFailureReason && (
                          <div className="text-[10px] text-red-600 font-semibold mt-1 max-w-[200px] truncate" title={invite.registrationFailureReason}>
                            ⚠ {invite.registrationFailureReason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {invite.inviteLink ? (
                          <div className="flex flex-col gap-1 items-start">
                            <button
                              type="button"
                              onClick={() => copyLink(invite.inviteLink, invite._id)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
                            >
                              {copied === invite._id ? (
                                <><CheckCircle size={12} className="text-emerald-500" /> Copied!</>
                              ) : (
                                <><Copy size={12} /> Copy Link</>
                              )}
                            </button>
                            {invite.deliveryStatus === 'link_copied' && invite.registrationStatus !== 'registered' && (
                              <button
                                type="button"
                                onClick={() => handleConfirmShared(invite._id)}
                                className="text-[10px] text-purple-600 hover:underline font-semibold"
                              >
                                Mark Shared ✓
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {invite.registeredAt
                          ? `Registered ${new Date(invite.registeredAt).toLocaleDateString()}`
                          : invite.sentAt
                          ? `Sent ${new Date(invite.sentAt).toLocaleDateString()}`
                          : invite.createdAt
                          ? `Added ${new Date(invite.createdAt).toLocaleDateString()}`
                          : '—'
                        }
                      </td>
                      <td className="py-3 px-4">
                        {invite.status !== 'registered' && (
                          <button
                            type="button"
                            onClick={() => handleResend(invite._id)}
                            disabled={resendingId === invite._id}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
                          >
                            <RefreshCw size={12} className={resendingId === invite._id ? 'animate-spin' : ''} />
                            Resend
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Upload tab */}
      {tab === 'upload' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 mb-1">Upload Employee List</h3>
              <p className="text-sm text-slate-500">
                Paste CSV data (or upload a file) with two columns:{' '}
                <code className="font-mono text-xs bg-slate-100 px-1 rounded">name, email</code>.
                One per row. Header row is optional.
              </p>
            </div>

            {/* File input */}
            <div className="flex items-center gap-3">
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <Upload size={14} />
                Choose CSV file
              </button>
              <span className="text-xs text-slate-400">or paste below</span>
            </div>

            <textarea
              value={csvText}
              onChange={e => { setCsvText(e.target.value); setPreviewDone(false); }}
              placeholder="John Smith, john.smith@company.com&#10;Jane Doe, jane.doe@company.com"
              rows={8}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />

            <button
              type="button"
              onClick={handlePreview}
              disabled={!csvText.trim()}
              className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-50 transition-colors"
            >
              Preview List
            </button>
          </div>

          {/* Preview results */}
          {previewDone && (
            <div className="space-y-4">
              {invalidRows.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <h4 className="text-sm font-bold text-red-800 mb-2">
                    {invalidRows.length} invalid {invalidRows.length === 1 ? 'row' : 'rows'} (will be skipped)
                  </h4>
                  <ul className="space-y-1">
                    {invalidRows.map((r, i) => (
                      <li key={i} className="text-xs text-red-700 flex items-center gap-2">
                        <span className="font-bold">Row {r.rowNum}:</span>
                        {r.name} / {r.email} — {r.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedRows.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-white overflow-hidden shadow-sm">
                  <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-emerald-800">
                      {parsedRows.length} valid {parsedRows.length === 1 ? 'row' : 'rows'} ready to save
                    </h4>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={confirming}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                    >
                      {confirming ? 'Saving…' : 'Save & Generate Links'}
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                    {parsedRows.map((r, i) => (
                      <li key={i} className="px-5 py-2.5 text-sm flex items-center gap-4">
                        <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                        {r.employeeId && (
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {r.employeeId}
                          </span>
                        )}
                        <span className="font-semibold text-slate-800 w-40 truncate">{r.name}</span>
                        <span className="text-slate-500">{r.email}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {confirmResult && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
                  {confirmResult}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
