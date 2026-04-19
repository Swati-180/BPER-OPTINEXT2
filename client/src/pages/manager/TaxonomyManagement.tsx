import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Edit2, Check, X, ChevronRight, LayoutGrid } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { InlineLoadingBlock } from '../../components/PortalSkeletons';

interface TaxonomyItem {
    _id: string;
    majorProcess: string;
    process: string;
    subProcesses: string[];
    department?: string;
    isActive: boolean;
}

export default function TaxonomyManagement() {
    const [taxonomy, setTaxonomy] = useState<TaxonomyItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formError, setFormError] = useState('');
    
    // Form state for new/edit
    const [formData, setFormData] = useState({
        majorProcess: '',
        process: '',
        subProcessesString: '', // comma separated
        department: 'All Departments'
    });

    useEffect(() => {
        fetchTaxonomy();
    }, []);

    async function fetchTaxonomy() {
        setIsLoading(true);
        try {
            const res = await apiFetch('/taxonomy/processes');
            if (res.ok) {
                const data = await res.json();
                setTaxonomy(data);
            }
        } catch (err) {
            console.error('Failed to fetch taxonomy:', err);
        } finally {
            setIsLoading(false);
        }
    }

    const filteredTaxonomy = taxonomy.filter(item => 
        item.majorProcess.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.process.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subProcesses.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    async function handleSave() {
        if (!formData.majorProcess || !formData.process) {
            setFormError('Major Process and Process Grouping are required.');
            return;
        }

        setFormError('');
        
        setIsLoading(true);
        try {
            const subProcesses = formData.subProcessesString.split(',').map(s => s.trim()).filter(s => s.length > 0);

            const endpoint = editingId ? `/taxonomy/${editingId}` : '/taxonomy/create';
            const method = editingId ? 'PUT' : 'POST';

            const res = await apiFetch(endpoint, {
                method,
                body: JSON.stringify({
                    majorProcess: formData.majorProcess,
                    process: formData.process,
                    subProcesses,
                    department: formData.department === 'All Departments' ? undefined : formData.department
                })
            });

            if (res.ok) {
                setIsAdding(false);
                setEditingId(null);
                setFormData({ majorProcess: '', process: '', subProcessesString: '', department: 'All Departments' });
                fetchTaxonomy();
            } else {
                const data = await res.json().catch(() => null);
                setFormError(data?.message || 'Failed to save taxonomy hierarchy.');
            }
        } catch (err) {
            console.error('Failed to save taxonomy:', err);
            setFormError('Failed to save taxonomy hierarchy.');
        } finally {
            setIsLoading(false);
        }
    }

    function handleEdit(item: TaxonomyItem) {
        setIsAdding(true);
        setEditingId(item._id);
        setFormError('');
        setFormData({
            majorProcess: item.majorProcess,
            process: item.process,
            subProcessesString: (item.subProcesses || []).join(', '),
            department: item.department || 'All Departments',
        });
    }

    async function handleDelete(item: TaxonomyItem) {
        const confirmed = window.confirm(`Delete taxonomy "${item.majorProcess} / ${item.process}"?`);
        if (!confirmed) return;

        setIsLoading(true);
        try {
            const res = await apiFetch(`/taxonomy/${item._id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchTaxonomy();
            } else {
                const data = await res.json().catch(() => null);
                alert(data?.message || 'Failed to delete taxonomy.');
            }
        } catch (err) {
            console.error('Failed to delete taxonomy:', err);
            alert('Failed to delete taxonomy.');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-[#0F2649]">Process Taxonomy</h1>
                    <p className="text-sm text-[#647D9D]">Manage the global organizational process hierarchy and AI training data.</p>
                </div>
                <button 
                    onClick={() => {
                        setIsAdding(true);
                        setEditingId(null);
                        setFormError('');
                        setFormData({ majorProcess: '', process: '', subProcessesString: '', department: 'All Departments' });
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1A5BA7] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-900/10 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                    <Plus className="h-4 w-4" />
                    {editingId ? 'Edit Hierarchy' : 'Add Hierarchy'}
                </button>
            </header>

            <div className="relative group">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#94A3B8] transition-colors group-focus-within:text-[#1A5BA7]" />
                <input 
                    type="text" 
                    placeholder="Search by Major Process, Grouping, or Activity..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-2xl border border-[#D9E4F2] bg-white py-4 pl-12 pr-6 text-sm outline-none transition-all focus:border-[#1A5BA7] focus:ring-4 focus:ring-blue-50"
                />
            </div>

            {isAdding && (
                <div className="rounded-2xl border-2 border-dashed border-[#1A5BA7] bg-blue-50/50 p-6 animate-in zoom-in-95 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-[#647D9D]">Major Process</label>
                            <input 
                                value={formData.majorProcess}
                                onChange={(e) => setFormData({...formData, majorProcess: e.target.value})}
                                placeholder="e.g., Accounts Payable" 
                                className="w-full rounded-xl border border-[#D9E4F2] bg-white px-4 py-2 text-sm outline-none focus:border-[#1A5BA7]"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-[#647D9D]">Process Grouping</label>
                            <input 
                                value={formData.process}
                                onChange={(e) => setFormData({...formData, process: e.target.value})}
                                placeholder="e.g., Invoice Processing" 
                                className="w-full rounded-xl border border-[#D9E4F2] bg-white px-4 py-2 text-sm outline-none focus:border-[#1A5BA7]"
                            />
                        </div>
                        <div className="space-y-1.5 lg:col-span-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-[#647D9D]">Sub-Processes / Activities (Comma separated)</label>
                            <input 
                                value={formData.subProcessesString}
                                onChange={(e) => setFormData({...formData, subProcessesString: e.target.value})}
                                placeholder="Validation, Batch Creation, Exception Handling" 
                                className="w-full rounded-xl border border-[#D9E4F2] bg-white px-4 py-2 text-sm outline-none focus:border-[#1A5BA7]"
                            />
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            onClick={() => {
                                setIsAdding(false);
                                setEditingId(null);
                                setFormError('');
                                setFormData({ majorProcess: '', process: '', subProcessesString: '', department: 'All Departments' });
                            }}
                            className="px-4 py-2 text-sm font-bold text-[#647D9D] hover:text-[#0F2649]"
                        >
                            Cancel
                        </button>
                        <button onClick={handleSave} className="rounded-xl bg-[#1A5BA7] px-6 py-2 text-sm font-bold text-white">{editingId ? 'Update Hierarchy' : 'Save Hierarchy'}</button>
                    </div>
                    {formError && (
                        <p className="mt-3 text-sm font-semibold text-red-600">{formError}</p>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {isLoading ? (
                    <div className="col-span-2">
                        <InlineLoadingBlock className="rounded-2xl p-6" />
                    </div>
                ) : filteredTaxonomy.length === 0 ? (
                    <div className="col-span-2 flex h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#D9E4F2] bg-white text-[#647D9D]">
                        <LayoutGrid className="h-12 w-12 mb-2 opacity-20" />
                        <p className="font-semibold">No hierarchical data found.</p>
                        <p className="text-xs">Adjust your search or add a new process family.</p>
                    </div>
                ) : (
                    filteredTaxonomy.map(item => (
                        <div key={item._id} className="group relative overflow-hidden rounded-2xl border border-[#D9E4F2] bg-white p-6 transition-all hover:shadow-xl hover:shadow-blue-900/5">
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter text-[#1A5BA7]">Family</span>
                                        <h3 className="text-lg font-bold text-[#0F2649]">{item.majorProcess}</h3>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[#5D789A]">
                                        <ChevronRight className="h-4 w-4" />
                                        <p className="text-sm font-semibold">{item.process}</p>
                                    </div>
                                </div>
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleEdit(item)}
                                        className="rounded-lg p-2 text-[#647D9D] hover:bg-slate-50 hover:text-blue-600"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(item)}
                                        className="rounded-lg p-2 text-[#647D9D] hover:bg-red-50 hover:text-red-500"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-5 space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">Standardized Activities</p>
                                <div className="flex flex-wrap gap-2">
                                    {item.subProcesses.map((sub, idx) => (
                                        <span key={`${item._id}-${idx}`} className="rounded-lg border border-[#E3EBF6] bg-[#FBFDFF] px-3 py-1.5 text-xs font-semibold text-[#3D5A80]">
                                            {sub}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
