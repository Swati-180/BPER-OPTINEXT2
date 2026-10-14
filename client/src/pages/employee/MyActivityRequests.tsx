import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, 
  Search, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Send, 
  Loader2, 
  RefreshCw,
  FolderTree,
  ChevronRight
} from 'lucide-react';
import { 
  getMyActivityRequests, 
  submitActivityRequest, 
  getTaxonomyProcesses,
  type ActivityRequestItem,
  type TaxonomyItem
} from '../../lib/api';

export interface RequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdRequest?: ActivityRequestItem) => void;
  department?: string;
  taxonomy: TaxonomyItem[];
  initialValues?: {
    majorProcess?: string;
    process?: string;
    activityName?: string;
    justification?: string;
  };
}

export function RequestActivityModal({ isOpen, onClose, onSuccess, department, taxonomy, initialValues }: RequestModalProps) {
  const [majorProcess, setMajorProcess] = useState(initialValues?.majorProcess || '');
  const [customMajor, setCustomMajor] = useState('');
  const [process, setProcess] = useState(initialValues?.process || '');
  const [customProcess, setCustomProcess] = useState('');
  const [activityName, setActivityName] = useState(initialValues?.activityName || '');
  const [justification, setJustification] = useState(initialValues?.justification || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialValues) {
      if (initialValues.majorProcess) setMajorProcess(initialValues.majorProcess);
      if (initialValues.process) setProcess(initialValues.process);
      if (initialValues.activityName) setActivityName(initialValues.activityName);
      if (initialValues.justification) setJustification(initialValues.justification);
    }
  }, [initialValues, isOpen]);

  // Derive unique major processes
  const majorProcesses = useMemo(() => {
    return Array.from(new Set(taxonomy.map(t => t.majorProcess))).filter(Boolean);
  }, [taxonomy]);

  // Derive processes under selected majorProcess
  const availableProcesses = useMemo(() => {
    if (!majorProcess || majorProcess === '__custom__') return [];
    return Array.from(
      new Set(
        taxonomy
          .filter(t => t.majorProcess === majorProcess)
          .map(t => t.process)
      )
    ).filter(Boolean);
  }, [taxonomy, majorProcess]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalMajor = majorProcess === '__custom__' ? customMajor.trim() : majorProcess.trim();
    const finalProcess = process === '__custom__' ? customProcess.trim() : process.trim();
    const finalActivity = activityName.trim();
    const finalJustification = justification.trim();

    if (!finalMajor) {
      setError('Please select or specify a Tower / Major Process.');
      return;
    }
    if (!finalProcess) {
      setError('Please select or specify a Process.');
      return;
    }
    if (!finalActivity) {
      setError('Activity name is required.');
      return;
    }
    if (!finalJustification) {
      setError('Please provide a justification / description for this activity.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitActivityRequest({
        majorProcess: finalMajor,
        process: finalProcess,
        activityName: finalActivity,
        justification: finalJustification,
        department: department || 'General'
      });
      onSuccess(result?.request);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit activity request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Request New Activity</h3>
            <p className="text-xs text-slate-500">
              Submit a request for an activity that does not currently exist in the official taxonomy.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Major Process / Tower */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Tower / Major Process <span className="text-red-500">*</span>
            </label>
            <select
              value={majorProcess}
              onChange={(e) => {
                setMajorProcess(e.target.value);
                setProcess('');
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            >
              <option value="">-- Select Tower / Major Process --</option>
              {majorProcesses.map((mp) => (
                <option key={mp} value={mp}>
                  {mp}
                </option>
              ))}
              <option value="__custom__">+ Enter New Tower / Major Process</option>
            </select>

            {majorProcess === '__custom__' && (
              <input
                type="text"
                placeholder="Enter new Tower / Major Process name"
                value={customMajor}
                onChange={(e) => setCustomMajor(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                required
              />
            )}
          </div>

          {/* Process */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Process <span className="text-red-500">*</span>
            </label>
            {majorProcess && majorProcess !== '__custom__' ? (
              <select
                value={process}
                onChange={(e) => setProcess(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                required
              >
                <option value="">-- Select Process --</option>
                {availableProcesses.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="__custom__">+ Enter New Process</option>
              </select>
            ) : null}

            {(majorProcess === '__custom__' || process === '__custom__') && (
              <input
                type="text"
                placeholder="Enter Process name"
                value={customProcess}
                onChange={(e) => setCustomProcess(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                required
              />
            )}
          </div>

          {/* Activity Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Activity Name (Sub-Process) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Vendor Statement Monthly Reconciliation"
              value={activityName}
              onChange={(e) => setActivityName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>

          {/* Justification / Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Justification / Business Need <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Describe why this activity is required and what business tasks it covers..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>

          <div className="rounded-xl bg-blue-50/70 p-3 text-xs text-blue-800 border border-blue-100">
            <strong>Note:</strong> Submitting this request creates an independent review entry for admin approval. It will <em>not</em> alter your current BPER form draft or submit your monthly BPER form.
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Request
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}

export default function MyActivityRequests() {
  const [requests, setRequests] = useState<ActivityRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taxonomy, setTaxonomy] = useState<TaxonomyItem[]>([]);

  const loadRequests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMyActivityRequests();
      setRequests(data || []);
    } catch (err: any) {
      console.error('Error fetching my activity requests:', err);
      setError(err?.message || 'Failed to load activity requests.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    getTaxonomyProcesses()
      .then(data => setTaxonomy(data || []))
      .catch(err => console.error('Error loading taxonomy for modal:', err));
  }, []);

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
      const q = search.toLowerCase().trim();
      const matchesSearch = !q || 
        req.activityName.toLowerCase().includes(q) ||
        req.majorProcess.toLowerCase().includes(q) ||
        req.process.toLowerCase().includes(q) ||
        (req.justification && req.justification.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [requests, statusFilter, search]);

  const counts = useMemo(() => {
    return {
      all: requests.length,
      pending: requests.filter(r => r.status === 'Pending').length,
      approved: requests.filter(r => r.status === 'Approved').length,
      rejected: requests.filter(r => r.status === 'Rejected').length,
    };
  }, [requests]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Activity Requests</h1>
          <p className="text-sm text-slate-500 mt-1">
            Request new activities to be added to the official taxonomy and track administrative approval status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadRequests}
            title="Refresh"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            Request New Activity
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setStatusFilter('All')}
          className={`text-left rounded-2xl border p-4 transition ${
            statusFilter === 'All' 
              ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-100' 
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Requests</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{counts.all}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('Pending')}
          className={`text-left rounded-2xl border p-4 transition ${
            statusFilter === 'Pending' 
              ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-100' 
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending Review</p>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-1">{counts.pending}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('Approved')}
          className={`text-left rounded-2xl border p-4 transition ${
            statusFilter === 'Approved' 
              ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-100' 
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Approved</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{counts.approved}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('Rejected')}
          className={`text-left rounded-2xl border p-4 transition ${
            statusFilter === 'Rejected' 
              ? 'border-red-500 bg-red-50/50 ring-2 ring-red-100' 
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-red-700">Rejected</p>
            <XCircle className="h-4 w-4 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-700 mt-1">{counts.rejected}</p>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by activity, tower, or process..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="text-xs text-slate-500">
          Showing <span className="font-semibold text-slate-800">{filteredRequests.length}</span> of {requests.length} requests
        </div>
      </div>

      {/* Requests Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
            <p className="text-sm text-slate-500 mt-2">Loading activity requests...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
            <p className="text-sm font-semibold text-red-700 mt-2">{error}</p>
            <button
              type="button"
              onClick={loadRequests}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Try Again
            </button>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center">
            <FolderTree className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-base font-semibold text-slate-800 mt-3">No activity requests found</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {search || statusFilter !== 'All' 
                ? 'Try adjusting your search or status filter.'
                : 'Need to log work for a process not in the catalog? Click "Request New Activity" above.'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Activity Name</th>
                  <th className="py-3 px-4">Tower & Process</th>
                  <th className="py-3 px-4">Justification</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Submitted Date</th>
                  <th className="py-3 px-4">Reviewer & Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((req) => (
                  <tr key={req._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {req.activityName}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <div className="font-medium text-slate-800">{req.majorProcess}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{req.process}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-xs">
                      <p className="line-clamp-2" title={req.justification}>
                        {req.justification}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
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
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {req.status === 'Pending' ? (
                        <span className="text-slate-400 italic">Awaiting review</span>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="font-medium text-slate-800">
                            {req.reviewedBy?.name || 'Reviewer'}
                            {req.reviewedAt && (
                              <span className="text-[10px] text-slate-400 font-normal ml-1">
                                ({new Date(req.reviewedAt).toLocaleDateString()})
                              </span>
                            )}
                          </div>
                          {req.rejectionReason && (
                            <div className="text-[11px] text-red-600 font-medium">
                              Reason: {req.rejectionReason}
                            </div>
                          )}
                          {req.adminRemarks && req.adminRemarks !== req.rejectionReason && (
                            <div className="text-[11px] text-slate-500 italic">
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

      <RequestActivityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadRequests}
        taxonomy={taxonomy}
      />
    </div>
  );
}
