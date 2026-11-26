import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, 
  FolderKanban, 
  ArrowRight, 
  LogOut, 
  RefreshCw, 
  Briefcase, 
  Search, 
  Layers,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '../../lib/api';
import { saveTenantContext, loadTenantContext, type AppAuthUser } from '../../lib/authStorage';

interface ProjectItem {
  _id: string;
  name: string;
  code: string;
  department: string;
  description?: string;
  status: 'active' | 'archived';
  companyId: {
    _id: string;
    name: string;
    code: string;
    isActive: boolean;
  };
  createdAt: string;
}

export default function ProjectSelectionHub({ user, onLogout }: { user: AppAuthUser | null; onLogout: () => void }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const currentTenant = loadTenantContext();
  const isSuperAdmin = user?.role === 'superadmin' || user?.role === 'super_admin';

  useEffect(() => {
    fetchMyProjects();
  }, []);

  const fetchMyProjects = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await apiFetch('/projects/my');
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || 'Failed to fetch authorized projects.');
      }
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading projects');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = (project: ProjectItem) => {
    saveTenantContext({
      companyId: project.companyId._id,
      projectId: project._id,
      companyName: project.companyId.name,
      projectName: project.name,
      projectCode: project.code,
      department: project.department
    });
    navigate('/admin/dashboard');
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.companyId?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header matching Super Admin branding */}
      <header className="h-16 bg-[#0A192F] text-white flex items-center justify-between px-8 border-b border-[#1E293B] shadow-md sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#1E40AF] to-[#3B82F6] flex items-center justify-center font-black text-white shadow-lg tracking-wider text-sm shrink-0">
            BP
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-white uppercase flex items-center gap-2">
              BPER Platform
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                isSuperAdmin 
                  ? 'bg-blue-500/20 text-blue-300 border-blue-400/40' 
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
              }`}>
                {isSuperAdmin ? 'Super Admin' : 'Company Admin'}
              </span>
            </h1>
            <p className="text-[11px] font-semibold text-blue-400/90 tracking-wide">Workforce Operational Workspaces</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/super-admin')}
              className="border-blue-400/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 hover:text-white text-xs h-8.5 px-3.5 gap-1.5 rounded-lg font-bold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Super Admin Overview
            </Button>
          )}
          <div className="h-5 w-[1px] bg-[#1E293B]" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-400/40 text-blue-200 flex items-center justify-center font-bold text-xs shrink-0">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AD'}
            </div>
            <span className="text-xs font-bold text-slate-300 hidden md:inline">
              {user?.name || user?.email}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMyProjects}
            className="border-slate-700 bg-[#112240] hover:bg-[#1E293B] text-slate-300 hover:text-white text-xs h-8.5 px-3 gap-1.5 rounded-lg font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onLogout}
            className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-xs h-8.5 px-3 gap-1.5 rounded-lg font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Your Authorized Projects</h2>
            <p className="text-sm text-slate-500 mt-1">
              Select a project card to enter the existing BPER workspace scoped to that company and project.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input
              placeholder="Search projects or companies..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-white border-slate-200 text-sm shadow-sm"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-sm">
            Loading your authorized projects...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-slate-300 p-8 shadow-sm max-w-md mx-auto">
            <FolderKanban className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No Projects Found</h3>
            <p className="text-xs text-slate-500 mt-1">
              You are not currently assigned to any active projects. Please contact your Super Admin to be granted project access.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map(proj => {
              const isCurrent = currentTenant?.projectId === proj._id;
              return (
                <Card 
                  key={proj._id}
                  className={`group relative overflow-hidden transition-all duration-200 hover:shadow-lg border-slate-200 bg-white flex flex-col justify-between ${
                    isCurrent ? 'ring-2 ring-blue-600 border-transparent shadow-md' : ''
                  }`}
                >
                  <div className="h-2 w-full bg-gradient-to-r from-blue-600 to-indigo-600" />
                  
                  <CardHeader className="pb-3 pt-5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-xs font-semibold text-slate-600">
                          {proj.companyId?.name || 'Company'}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] uppercase border border-slate-200 bg-slate-50 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                        {proj.code}
                      </span>
                    </div>

                    <CardTitle className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {proj.name}
                    </CardTitle>
                    {proj.department && (
                      <CardDescription className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                        <span>Department:</span>
                        <strong className="text-slate-700">{proj.department}</strong>
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {proj.description ? (
                      <p className="text-xs text-slate-600 line-clamp-2">
                        {proj.description}
                      </p>
                    ) : null}

                    <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        Active Workspace
                      </span>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-2 pb-5 border-t border-slate-100 bg-slate-50/50">
                    <Button
                      onClick={() => handleSelectProject(proj)}
                      className="w-full bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-10 gap-2 font-semibold shadow-sm transition-transform active:scale-[0.99]"
                    >
                      <span>Open BPER Workspace</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
