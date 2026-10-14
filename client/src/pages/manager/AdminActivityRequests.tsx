import React, { useEffect, useState, useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  Check,
  X,
  Loader2,
  RefreshCw,
  MessageSquare,
  User,
  Building,
  Calendar,
  Layers
} from 'lucide-react';
import {
  getAdminActivityRequests,
  approveActivityRequest,
  rejectActivityRequest,
  type ActivityRequestItem
} from '../../lib/api';

export default function AdminActivityRequests() {
  const [requests, setRequests] = useState<ActivityRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');

  // Modals state
  const [activeAction, setActiveAction] = useState<{
    type: 'approve' | 'reject';
    request: ActivityRequestItem;
  } | null>(null);
  const [actionInput, setActionInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadRequests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminActivityRequests(statusFilter, search);
      setRequests(data || []);
    } catch (err: any) {
      console.error('Error fetching admin activity requests:', err);
      setError(err?.message || 'Failed to load activity requests.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadRequests();
  };

  const openApproveModal = (req: ActivityRequestItem) => {
    setActiveAction({ type: 'approve', request: req });
    setActionInput('');
    setActionError(null);
  };

  const openRejectModal = (req: ActivityRequestItem) => {
    setActiveAction({ type: 'reject', request: req });
    setActionInput('');
    setActionError(null);
  };

  const handleActionConfirm = async () => {
    if (!activeAction) return;
    setActionError(null);

    if (activeAction.type === 'reject' && !actionInput.trim()) {
      setActionError('A rejection reason is strictly required.');
      return;
    }

    setIsProcessing(true);
    try {
      if (activeAction.type === 'approve') {
        await approveActivityRequest(activeAction.request._id, actionInput.trim());
      } else {
        await rejectActivityRequest(activeAction.request._id, actionInput.trim());
      }
      setActiveAction(null);
      await loadRequests();
    } catch (err: any) {
      setActionError(err?.message || `Failed to ${activeAction.type} request.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const counts = useMemo(() => {
    return {
      all: requests.length,
      pending: requests.filter((r) => r.status === 'Pending').length,
      approved: requests.filter((r) => r.status === 'Approved').length,
      rejected: requests.filter((r) => r.status === 'Rejected').length,
    };
  }, [requests]);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Activity Requests Review Queue</h2>
          <p className="text-xs text-slate-500 mt-1">
            Review custom activity submissions from employees. Approving an item automatically appends it to the official taxonomy.
          </p>
        </div>
        <button
          type="button"
          onClick={loadRequests}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Queue
        </button>
      </div>

      {/* Filter tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
          {(['Pending', 'Approved', 'Rejected', 'All'] as const).map((tab) => {
            const isActive = statusFilter === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search activity, employee, tower..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </form>
      </div>

      {/* Requests Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-blue-600 mx-auto" />
            <p className="text-xs text-slate-500 mt-2">Loading activity requests...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="h-7 w-7 text-red-500 mx-auto" />
            <p className="text-sm font-semibold text-red-700 mt-2">{error}</p>
            <button
              type="button"
              onClick={loadRequests}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Retry
            </button>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center">
            <Layers className="h-9 w-9 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-800 mt-2">No activity requests in this queue</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {statusFilter === 'Pending' 
                ? 'All employee activity requests have been processed.' 
                : 'No requests matched the current filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Requested Activity</th>
                  <th className="py-3 px-4">Tower & Process</th>
                  <th className="py-3 px-4">Justification</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Submission Date</th>
                  <th className="py-3 px-4 text-right">Actions / Review Info</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((req) => (
                  <tr key={req._id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Employee info */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{req.employee?.name || 'Unknown'}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{req.employee?.email}</div>
                      <div className="inline-block mt-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {req.employee?.department || 'General'}
                      </div>
                    </td>

                    {/* Activity name */}
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {req.activityName}
                    </td>

                    {/* Tower & Process */}
                    <td className="py-3.5 px-4 text-slate-600">
                      <div className="font-medium text-slate-800">{req.majorProcess}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{req.process}</div>
                    </td>

                    {/* Justification */}
                    <td className="py-3.5 px-4 text-slate-600 max-w-xs">
                      <p className="line-clamp-2" title={req.justification}>
                        {req.justification}
                      </p>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {req.status === 'Pending' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 border border-amber-200">
                          <Clock className="h-3 w-3" />
                          Pending Review
                        </span>
                      )}
                      {req.status === 'Approved' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Approved
                        </span>
                      )}
                      {req.status === 'Rejected' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 border border-red-200">
                          <XCircle className="h-3 w-3" />
                          Rejected
                        </span>
                      )}
                    </td>

                    {/* Submitted Date */}
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '-'}
                    </td>

                    {/* Actions / Reviewer */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {req.status === 'Pending' ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openApproveModal(req)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs transition"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => openRejectModal(req)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div className="text-left text-[11px] text-slate-500 space-y-0.5">
                          <div className="font-medium text-slate-800">
                            By: {req.reviewedBy?.name || 'Admin'}
                          </div>
                          {req.reviewedAt && (
                            <div className="text-slate-400">
                              {new Date(req.reviewedAt).toLocaleDateString()}
                            </div>
                          )}
                          {req.rejectionReason && (
                            <div className="text-red-600 font-medium max-w-xs truncate" title={req.rejectionReason}>
                              Reason: {req.rejectionReason}
                            </div>
                          )}
                          {req.adminRemarks && req.adminRemarks !== req.rejectionReason && (
                            <div className="italic text-slate-400 max-w-xs truncate" title={req.adminRemarks}>
                              "{req.adminRemarks}"
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve / Reject Modal */}
      {activeAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className={`flex items-center justify-between border-b px-5 py-3.5 ${
              activeAction.type === 'approve' ? 'bg-emerald-50/70 border-emerald-100' : 'bg-red-50/70 border-red-100'
            }`}>
              <h3 className={`text-sm font-bold ${
                activeAction.type === 'approve' ? 'text-emerald-900' : 'text-red-900'
              }`}>
                {activeAction.type === 'approve' ? 'Approve Activity Request' : 'Reject Activity Request'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveAction(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-xs space-y-1">
                <div>
                  <span className="font-semibold text-slate-600">Activity: </span>
                  <span className="font-bold text-slate-900">{activeAction.request.activityName}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-600">Hierarchy: </span>
                  <span className="text-slate-700">{activeAction.request.majorProcess} / {activeAction.request.process}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-600">Employee: </span>
                  <span className="text-slate-700">{activeAction.request.employee?.name} ({activeAction.request.employee?.email})</span>
                </div>
              </div>

              {actionError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{actionError}</span>
                </div>
              )}

              {activeAction.type === 'approve' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Admin Remarks (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Approved for general operational use"
                    value={actionInput}
                    onChange={(e) => setActionInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="text-[11px] text-slate-500">
                    Upon approval, this activity will be immediately appended to the official taxonomy without duplicates.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide a specific reason why this activity cannot be approved..."
                    value={actionInput}
                    onChange={(e) => setActionInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                    required
                  />
                  <p className="text-[11px] text-slate-500">
                    This reason will be visible to the employee under My Activity Requests. The activity will not be added to the taxonomy.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAction(null)}
                  disabled={isProcessing}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleActionConfirm}
                  disabled={isProcessing}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-xs transition ${
                    activeAction.type === 'approve'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Processing...
                    </>
                  ) : activeAction.type === 'approve' ? (
                    'Confirm Approval'
                  ) : (
                    'Confirm Rejection'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
