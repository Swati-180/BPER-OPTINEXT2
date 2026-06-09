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
  status: 'pending' | 'sent' | 'registered' | 'failed';
  inviteLink: string;
  sentAt?: string;
  registeredAt?: string;
  createdAt?: string;
  errorMessage?: string;
}

type ParsedRow = { name: string; email: string; rowNum: number; error?: string };

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-slate-100 text-slate-600', icon: Clock },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700', icon: Mail },
  registered: { label: 'Registered', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
};

function StatusPill({ status }: { status: Invite['status'] }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${config.color}`}>
      <Icon size={11} />
      {config.label}
    </span>
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

  const filteredInvites = filter === 'all'
    ? invites
    : invites.filter(i => i.status === filter);

  const counts = {
    all: invites.length,
    pending: invites.filter(i => i.status === 'pending').length,
    sent: invites.filter(i => i.status === 'sent').length,
    registered: invites.filter(i => i.status === 'registered').length,
    failed: invites.filter(i => i.status === 'failed').length,
  };

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
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
      if (res.ok) await loadInvites();
      else alert(data.message || 'Resend failed');
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
    // Remove header if first line has text "name" and "email"
    const firstLine = lines[0].toLowerCase();
    const startIdx = firstLine.includes('name') && firstLine.includes('email') ? 1 : 0;
    return lines.slice(startIdx).map((line, i) => {
      const [name, email] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      return { name: name || '', email: email || '', rowNum: startIdx + i + 1 };
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



      {/* Summary pills */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(['all', 'pending', 'sent', 'registered', 'failed'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-xl border px-4 py-3 text-left transition-all ${
              filter === s ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-300'
            }`}
          >
            <div className="text-2xl font-bold text-slate-800">{counts[s]}</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-0.5 capitalize">{s}</div>
          </button>
        ))}
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
                      <td className="py-3 px-4 text-sm font-semibold text-slate-800">{invite.name}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{invite.email}</td>
                      <td className="py-3 px-4">
                        <StatusPill status={invite.status} />
                        {invite.status === 'failed' && (
                          <div className="text-[10px] text-red-500 mt-1">
                            {invite.errorMessage || 'Email is not registered.'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {invite.inviteLink ? (
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
