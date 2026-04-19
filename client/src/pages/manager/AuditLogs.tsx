import { useState, useEffect } from 'react';
import { Shield, Clock, User, HardDrive, Info, Search } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { InlineLoadingBlock } from '../../components/PortalSkeletons';

interface AuditLogEntry {
  _id: string;
  actor: {
    name: string;
    email: string;
    userId: string;
  };
  action: string;
  targetType: string;
  targetId: string;
  description: string;
  metadata: {
    ip: string;
  };
  createdAt: string;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await apiFetch('/reports/audit-logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      } else {
        const data = await res.json().catch(() => null);
        setErrorMessage(data?.message || 'Unable to load audit records.');
        setLogs([]);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setErrorMessage('Unable to load audit records. Please try again.');
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredLogs = logs.filter(log => 
    (log.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (log.actor?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (log.action || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
                <Shield size={24} />
            </div>
            <div>
                <h1 className="text-3xl font-bold text-[#0F2649]">Security Audit Trail</h1>
                <p className="text-sm text-[#647D9D]">Historical record of all administrative actions and system modifications.</p>
            </div>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
            type="text" 
            placeholder="Search logs by actor, action or description..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all shadow-sm"
        />
      </div>

      <div className="rounded-2xl border border-[#D9E4F2] bg-white shadow-xl shadow-blue-900/5 overflow-hidden">
        {isLoading ? (
          <div className="p-8">
            <InlineLoadingBlock />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-slate-100 uppercase text-[10px] font-bold tracking-widest text-slate-500">
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Actor</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Target</th>
                  <th className="px-6 py-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {errorMessage ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-red-500 italic">{errorMessage}</td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                    <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No audit records found matching your search.</td>
                    </tr>
                ) : (
                    filteredLogs.map(log => (
                        <tr key={log._id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Clock size={14} className="opacity-50" />
                                    {new Date(log.createdAt).toLocaleString()}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-700">{log.actor.name}</span>
                                    <span className="text-[10px] text-slate-400">{log.actor.email}</span>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter bg-slate-100 text-slate-600 border border-slate-200">
                                    {log.action.replace(/_/g, ' ')}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                                    <HardDrive size={14} className="opacity-40" />
                                    {log.targetType}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <p className="text-xs text-slate-600 leading-relaxed max-w-md">{log.description}</p>
                            </td>
                        </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
