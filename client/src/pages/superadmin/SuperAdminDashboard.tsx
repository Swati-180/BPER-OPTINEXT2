import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  FolderKanban, 
  Users, 
  Plus, 
  Search, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  AlertTriangle,
  ShieldCheck, 
  LogOut, 
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Briefcase,
  Layers,
  ArrowUpRight,
  UserCheck,
  TrendingUp,
  Sliders,
  Filter,
  Check,
  X,
  Bell,
  HelpCircle,
  MoreVertical,
  Activity,
  Settings,
  LayoutDashboard,
  Shield,
  KeyRound,
  FileText,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronLeft,
  ArrowLeft,
  Mail,
  Send,
  Copy,
  UserPlus,
  UserX,
  Lock,
  Trash2,
  Eye,
  Edit2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { saveTenantContext } from '../../lib/authStorage';

interface Company {
  _id: string;
  name: string;
  code: string;
  description?: string;
  domain?: string;
  isActive: boolean;
  createdAt: string;
}

interface Project {
  _id: string;
  companyId: string | { _id: string; name: string; code: string };
  name: string;
  code: string;
  department: string;
  description?: string;
  status: 'active' | 'archived';
  createdAt: string;
}

interface CompanyAdmin {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    role: string;
    isActive?: boolean;
  };
  role: string;
  canCreateProjects: boolean;
  isActive: boolean;
  createdAt?: string;
}

interface UserRecord {
  _id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  designation?: string;
  employeeId?: string;
  isActive: boolean;
  createdAt?: string;
  companyMemberships?: Array<{
    _id: string;
    companyId: string;
    companyName: string;
    companyCode: string;
    role: string;
    canCreateProjects: boolean;
    isActive: boolean;
  }>;
  projectMemberships?: Array<{
    _id: string;
    projectId: string;
    projectName: string;
    projectCode: string;
    department?: string;
    companyId?: string;
    companyName?: string;
    role: string;
    isActive: boolean;
  }>;
  primaryCompany?: string;
  primaryProject?: string;
}

interface GovernanceStats {
  totalCompanies: number;
  activeCompanies: number;
  inactiveCompanies: number;
  totalProjects: number;
  activeProjects: number;
  totalAdmins: number;
  totalManagers: number;
  totalEmployees: number;
  totalWorkforce: number;
  projectCountsMap: Record<string, number>;
  adminCountsMap: Record<string, number>;
}

interface ActivityLogItem {
  _id: string;
  action: string;
  targetType: string;
  description: string;
  createdAt: string;
  actor?: {
    name?: string;
    email?: string;
  };
}

interface PlatformInviteItem {
  _id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  company?: { _id: string; name: string; code: string };
  project?: { _id: string; name: string; code: string };
  status: string;
  deliveryStatus: string;
  registrationStatus: string;
  expiresAt: string;
  createdAt: string;
  inviteLink?: string;
  uploadedBy?: { name?: string; email?: string };
}

export default function SuperAdminDashboard({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'companies' | 'company-details' | 'projects' | 'access-invitations' | 'admins' | 'access' | 'invitations' | 'logs' | 'settings'>('overview');
  const [accessSubTab, setAccessSubTab] = useState<'users' | 'admins' | 'invitations'>('users');
  
  // Dedicated Company Details View state
  const [detailedCompany, setDetailedCompany] = useState<Company | null>(null);
  const [companyDetailsTab, setCompanyDetailsTab] = useState<'overview' | 'projects' | 'admins' | 'users' | 'invitations' | 'settings'>('overview');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyProjects, setCompanyProjects] = useState<Project[]>([]);
  const [companyAdmins, setCompanyAdmins] = useState<CompanyAdmin[]>([]);
  const [allCompanyAdmins, setAllCompanyAdmins] = useState<Array<{ company: Company; admins: CompanyAdmin[] }>>([]);
  const [stats, setStats] = useState<GovernanceStats | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [platformInvites, setPlatformInvites] = useState<PlatformInviteItem[]>([]);
  
  // Users state
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userCompanyFilter, setUserCompanyFilter] = useState('all');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [userPage, setUserPage] = useState(1);
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<UserRecord | null>(null);

  // Companies Search & Pagination
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [companyStatusFilter, setCompanyStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [companyPage, setCompanyPage] = useState(1);

  // Company Admins Search & Pagination
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminPage, setAdminPage] = useState(1);

  // Invitations Search & Pagination
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');
  const [inviteStatusFilter, setInviteStatusFilter] = useState('all');
  const [invitePage, setInvitePage] = useState(1);
  const [inviteCompanyFilter, setInviteCompanyFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Modals state
  const [showCreateCompanyModal, setShowCreateCompanyModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [showAssignAdminModal, setShowAssignAdminModal] = useState(false);
  const [modalTargetCompanyId, setModalTargetCompanyId] = useState<string>('');
  const [isGlobalModalAction, setIsGlobalModalAction] = useState<boolean>(false);
  const [returnToModalAfterAction, setReturnToModalAfterAction] = useState<boolean>(false);
  
  // Onboarding Wizard state
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(false);
  const [onboardingCompany, setOnboardingCompany] = useState<Company | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<number>(1);
  const [onboardingAdmin, setOnboardingAdmin] = useState({ name: '', email: '', canCreateProjects: true });
  const [onboardingProject, setOnboardingProject] = useState({ name: '', code: '', department: 'Finance & Accounting', description: '' });
  const [onboardingAdminsCreated, setOnboardingAdminsCreated] = useState<string[]>([]);
  const [onboardingProjectsCreated, setOnboardingProjectsCreated] = useState<string[]>([]);
  
  const [showProjectsViewModal, setShowProjectsViewModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [inviteResultOutcome, setInviteResultOutcome] = useState<{
    deliveryStatus: string;
    errorMessage?: string;
    deliveryMethod: 'email' | 'manual' | '';
    email: string;
  } | null>(null);

  // Replace Admin Modal state
  const [showReplaceAdminModal, setShowReplaceAdminModal] = useState(false);
  const [adminToReplace, setAdminToReplace] = useState<{ company: Company; admin: CompanyAdmin } | null>(null);
  const [replaceForm, setReplaceForm] = useState({ name: '', email: '', canCreateProjects: true });

  // Forms state
  const [newCompany, setNewCompany] = useState({ name: '', code: '', description: '', domain: '' });
  const [newProject, setNewProject] = useState({ name: '', code: '', department: 'Finance & Accounting', description: '' });
  const [newAdmin, setNewAdmin] = useState({ email: '', name: '', canCreateProjects: true });
  const [newInvite, setNewInvite] = useState({
    name: '',
    email: '',
    role: 'company_admin',
    companyId: '',
    projectId: '',
    department: '',
    deliveryMethod: '' as 'email' | 'manual' | ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const token = 
    localStorage.getItem('bper.auth.token') || 
    localStorage.getItem('token') || 
    localStorage.getItem('bper_token');

  const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const currentToken = 
      localStorage.getItem('bper.auth.token') || 
      localStorage.getItem('token') || 
      localStorage.getItem('bper_token');
    return fetch(`http://localhost:5000/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        ...options.headers,
      },
    });
  };

  useEffect(() => {
    fetchInitialData();
    fetchUsersList();
    fetchPlatformInvites();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const [compRes, statsRes, logsRes] = await Promise.all([
        apiFetch('/companies'),
        apiFetch('/companies/stats/overview').catch(() => null),
        apiFetch('/reports/audit-logs').catch(() => null)
      ]);

      if (!compRes.ok) throw new Error('Failed to load companies.');
      const compData = await compRes.json();
      const list: Company[] = compData.companies || [];
      setCompanies(list);

      if (statsRes && statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (logsRes && logsRes.ok) {
        const logsData = await logsRes.json();
        if (Array.isArray(logsData)) {
          setActivityLogs(logsData);
        }
      }

      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      // Fetch company admins for all companies to support Company Admins table
      const adminGroups: Array<{ company: Company; admins: CompanyAdmin[] }> = [];
      for (const comp of list) {
        try {
          const aRes = await apiFetch(`/companies/${comp._id}/administrators?includeInactive=true`);
          if (aRes.ok) {
            const aData = await aRes.json();
            adminGroups.push({ company: comp, admins: aData.administrators || [] });
          }
        } catch (e) {
          // continue
        }
      }
      setAllCompanyAdmins(adminGroups);

      if (list.length > 0) {
        const target = selectedCompany ? (list.find(c => c._id === selectedCompany._id) || list[0]) : list[0];
        selectCompany(target);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading governance dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsersList = async () => {
    try {
      setLoadingUsers(true);
      const res = await apiFetch('/auth/users?recordType=all&includeMemberships=true');
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
      }
    } catch (err: any) {
      console.error('Error fetching users list:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchPlatformInvites = async () => {
    try {
      setLoadingInvites(true);
      const res = await apiFetch('/invite/list');
      if (res.ok) {
        const data = await res.json();
        setPlatformInvites(data.invites || []);
      }
    } catch (err: any) {
      console.error('Error fetching platform invites:', err);
    } finally {
      setLoadingInvites(false);
    }
  };

  const selectCompany = async (company: Company) => {
    setSelectedCompany(company);
    setLoadingProjects(true);
    try {
      const [projRes, adminRes] = await Promise.all([
        apiFetch(`/companies/${company._id}/projects`),
        apiFetch(`/companies/${company._id}/administrators?includeInactive=true`)
      ]);

      if (projRes.ok) {
        const projData = await projRes.json();
        setCompanyProjects(projData.projects || []);
      }
      if (adminRes.ok) {
        const adminData = await adminRes.json();
        setCompanyAdmins(adminData.administrators || []);
      }
    } catch (err: any) {
      console.error('Error loading company details:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const openCompanyDetailsPage = (company: Company) => {
    setDetailedCompany(company);
    selectCompany(company);
    setActiveTab('company-details');
    setCompanyDetailsTab('overview');
  };

  const handleToggleCompanyStatus = async (company: Company) => {
    try {
      const newStatus = !company.isActive;
      const res = await apiFetch(`/companies/${company._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: newStatus })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || 'Failed to update company status');
      }
      setSuccessMsg(`Company "${company.name}" is now ${newStatus ? 'Active' : 'Inactive'}.`);
      fetchInitialData();
      if (selectedCompany?._id === company._id) {
        setSelectedCompany({ ...company, isActive: newStatus });
      }
      if (detailedCompany?._id === company._id) {
        setDetailedCompany({ ...detailedCompany, isActive: newStatus });
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.name || !newCompany.code) {
      setErrorMsg('Company Name and Code are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/companies', {
        method: 'POST',
        body: JSON.stringify(newCompany)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create company');
      setSuccessMsg(`Company "${data.company.name}" created successfully!`);
      setShowCreateCompanyModal(false);
      setNewCompany({ name: '', code: '', description: '', domain: '' });
      await fetchInitialData();
      selectCompany(data.company);
      // Trigger Guided Onboarding Workflow
      setOnboardingCompany(data.company);
      setOnboardingStep(1);
      setOnboardingAdminsCreated([]);
      setOnboardingProjectsCreated([]);
      setOnboardingAdmin({ name: '', email: '', canCreateProjects: true });
      setOnboardingProject({ name: '', code: '', department: 'Finance & Accounting', description: '' });
      setShowOnboardingModal(true);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCompanyId = isGlobalModalAction ? modalTargetCompanyId : (selectedCompany?._id || modalTargetCompanyId);
    const targetComp = companies.find(c => c._id === effectiveCompanyId) || selectedCompany;
    if (!targetComp || !effectiveCompanyId) {
      setErrorMsg('Please select a company for this project.');
      return;
    }
    if (!newProject.name || !newProject.code || !newProject.department) {
      setErrorMsg('Project Name, Code, and Department are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...newProject,
          companyId: effectiveCompanyId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create project');
      setSuccessMsg(`Project "${data.project.name}" created successfully!`);
      setShowCreateProjectModal(false);
      setNewProject({ name: '', code: '', department: 'Finance & Accounting', description: '' });
      
      // Refresh current company view and return to manage modal if triggered from there
      await selectCompany(targetComp);
      await fetchInitialData();
      if (returnToModalAfterAction) {
        setShowProjectsViewModal(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Invite Company Admin Workflow (Form step 4 & 5)
  const handleInviteCompanyAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCompanyId = isGlobalModalAction ? modalTargetCompanyId : (selectedCompany?._id || modalTargetCompanyId);
    const targetComp = companies.find(c => c._id === effectiveCompanyId) || selectedCompany;
    if (!targetComp || !effectiveCompanyId) {
      setErrorMsg('Please select a company for this administrator.');
      return;
    }
    if (!newAdmin.email || !newAdmin.name) {
      setErrorMsg('Admin Name and Email are required.');
      return;
    }
    setSubmitting(true);
    try {
      // 1. Issue Enterprise Invitation for Company Admin
      const inviteRes = await apiFetch('/invite/create', {
        method: 'POST',
        body: JSON.stringify({
          name: newAdmin.name,
          email: newAdmin.email,
          role: 'company_admin',
          companyId: effectiveCompanyId,
          deliveryMethod: 'manual'
        })
      });

      const inviteData = await inviteRes.json();
      if (!inviteRes.ok) {
        // If account already exists or duplicate active invite, fallback to direct membership assignment if authorized
        if (inviteRes.status === 409) {
          throw new Error(inviteData.message || 'Pending invitation or active membership already exists.');
        }
        throw new Error(inviteData.message || 'Failed to invite company administrator');
      }

      setSuccessMsg(`Invitation issued for Company Admin "${newAdmin.name}" (${targetComp.name})!`);
      setShowAssignAdminModal(false);
      setNewAdmin({ email: '', name: '', canCreateProjects: true });
      
      // Show generated invitation link if available
      if (inviteData.invite?.inviteLink) {
        setGeneratedInviteLink(inviteData.invite.inviteLink);
        setShowInviteModal(true);
      }

      await selectCompany(targetComp);
      await fetchInitialData();
      await fetchPlatformInvites();
      
      if (returnToModalAfterAction) {
        setShowProjectsViewModal(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAdminStatus = async (companyId: string, adminId: string, currentStatus: boolean) => {
    try {
      const res = await apiFetch(`/companies/${companyId}/administrators/${adminId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !currentStatus })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || 'Failed to update admin status');
      }
      setSuccessMsg(`Administrator access ${!currentStatus ? 'reactivated' : 'deactivated'} successfully.`);
      if (selectedCompany) selectCompany(selectedCompany);
      fetchInitialData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleReplaceAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToReplace || !replaceForm.email) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/companies/${adminToReplace.company._id}/administrators/${adminToReplace.admin._id}/replace`, {
        method: 'POST',
        body: JSON.stringify({
          newAdminEmail: replaceForm.email,
          newAdminName: replaceForm.name,
          canCreateProjects: replaceForm.canCreateProjects
        })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || 'Failed to replace administrator');
      }
      setSuccessMsg(`Administrator replaced with ${replaceForm.email} successfully.`);
      setShowReplaceAdminModal(false);
      setReplaceForm({ name: '', email: '', canCreateProjects: true });
      setAdminToReplace(null);
      if (selectedCompany) selectCompany(selectedCompany);
      fetchInitialData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleUserStatus = async (user: UserRecord) => {
    try {
      const newActive = !user.isActive;
      const res = await apiFetch(`/auth/users/${user._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: newActive })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || 'Failed to update user status');
      }
      setSuccessMsg(`User "${user.name}" is now ${newActive ? 'Active' : 'Deactivated'}.`);
      fetchUsersList();
      fetchInitialData();
      if (selectedUserForDetails && selectedUserForDetails._id === user._id) {
        setSelectedUserForDetails({ ...selectedUserForDetails, isActive: newActive });
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleRevokeProjectMembership = async (projectId: string, userId: string, projectName: string) => {
    if (!window.confirm(`Revoke membership in project "${projectName}"? The user account will remain intact.`)) return;
    try {
      const res = await apiFetch(`/projects/${projectId}/members/${userId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || 'Failed to revoke project membership');
      }
      setSuccessMsg(`Project membership in "${projectName}" revoked successfully.`);
      fetchUsersList();
      if (selectedCompany) selectCompany(selectedCompany);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // ─── ENTERPRISE INVITATION CREATION ─────────────────────────────────────────
  const handleCreateEnterpriseInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvite.name || !newInvite.email || !newInvite.role) {
      setErrorMsg('Name, email, and role are required for invitation.');
      return;
    }
    if (!newInvite.deliveryMethod) {
      setErrorMsg('Please select a delivery method (Email Invitation or Manual Link).');
      return;
    }
    if (!newInvite.companyId && companies.length > 0) {
      newInvite.companyId = companies[0]._id;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await apiFetch('/invite/create', {
        method: 'POST',
        body: JSON.stringify(newInvite)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create invitation');

      // Update feedback based on delivery status
      const delStatus = data.deliveryStatus || data.invite?.deliveryStatus;
      const errMsg = data.errorMessage || data.invite?.errorMessage;

      setInviteResultOutcome({
        deliveryStatus: delStatus,
        errorMessage: errMsg,
        deliveryMethod: newInvite.deliveryMethod,
        email: newInvite.email
      });

      if (newInvite.deliveryMethod === 'email') {
        if (delStatus === 'email_sent') {
          setSuccessMsg(`Invitation successfully dispatched to ${newInvite.email}!`);
        } else {
          setErrorMsg(`Invitation created, but email dispatch failed: ${errMsg || 'SMTP error'}. Manual link is available below.`);
        }
      } else {
        setSuccessMsg(`Manual invitation link generated for ${newInvite.email}.`);
      }

      if (data.invite?.inviteLink) {
        setGeneratedInviteLink(data.invite.inviteLink);
      } else {
        setShowInviteModal(false);
      }

      setNewInvite({
        name: '',
        email: '',
        role: 'company_admin',
        companyId: companies[0]?._id || '',
        projectId: '',
        department: '',
        deliveryMethod: '' as 'email' | 'manual' | ''
      });
      fetchPlatformInvites();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!window.confirm('Are you sure you want to revoke this invitation? The link will become immediately invalid.')) return;
    try {
      const res = await apiFetch(`/invite/${inviteId}/revoke`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || 'Failed to revoke invite');
      }
      setSuccessMsg('Invitation revoked successfully.');
      fetchPlatformInvites();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleResendInvite = async (inviteId: string, deliveryMethod: 'email' | 'manual' = 'manual') => {
    try {
      const res = await apiFetch(`/invite/${inviteId}/resend`, {
        method: 'POST',
        body: JSON.stringify({ deliveryMethod })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to resend invite');
      
      const delStatus = data.deliveryStatus || data.invite?.deliveryStatus;
      const errMsg = data.errorMessage || data.invite?.errorMessage;

      setInviteResultOutcome({
        deliveryStatus: delStatus,
        errorMessage: errMsg,
        deliveryMethod,
        email: data.invite?.email || ''
      });

      if (deliveryMethod === 'email') {
        if (delStatus === 'email_sent') {
          setSuccessMsg(`Invitation resent and dispatched via email!`);
        } else {
          setErrorMsg(`Invitation renewed, but email delivery failed: ${errMsg || 'SMTP error'}. Manual link is available below.`);
        }
      } else {
        setSuccessMsg(`Invitation link regenerated! Expiry extended for 72 hours.`);
      }

      if (data.invite?.inviteLink) {
        setGeneratedInviteLink(data.invite.inviteLink);
        setShowInviteModal(true);
      }
      fetchPlatformInvites();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedInviteId(id);
    setTimeout(() => setCopiedInviteId(null), 2500);
  };

  const handleOpenProjectWorkspace = (project: Project, parentCompany?: Company) => {
    const targetCompanyId = typeof project.companyId === 'string'
      ? project.companyId
      : (project.companyId as any)?._id || parentCompany?._id || selectedCompany?._id;
    const targetCompany = companies.find(c => c._id === targetCompanyId) || parentCompany || selectedCompany;
    
    if (!targetCompany) {
      setErrorMsg('Cannot resolve company context for this project.');
      return;
    }

    saveTenantContext({
      companyId: targetCompany._id,
      companyName: targetCompany.name,
      projectId: project._id,
      projectName: project.name,
      projectCode: project.code,
      department: project.department
    });

    window.open(`/admin/dashboard?companyId=${targetCompany._id}&projectId=${project._id}`, '_blank');
  };

  // ─── FILTERING & PAGINATION CALCULATIONS ────────────────────────────────────
  const PAGE_SIZE = 10;

  // Companies Filter & Pagination
  const filteredCompanies = companies.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(companySearchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(companySearchQuery.toLowerCase());
    const matchesStatus = companyStatusFilter === 'all' || 
      (companyStatusFilter === 'active' && c.isActive) ||
      (companyStatusFilter === 'inactive' && !c.isActive);
    return matchesSearch && matchesStatus;
  });
  const totalCompanyPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
  const paginatedCompanies = filteredCompanies.slice((companyPage - 1) * PAGE_SIZE, companyPage * PAGE_SIZE);

  // Users Filter & Pagination
  const filteredUsers = usersList.filter(u => {
    const q = userSearchQuery.toLowerCase().trim();
    const matchesQuery = !q || 
      (u.name && u.name.toLowerCase().includes(q)) || 
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.employeeId && u.employeeId.toLowerCase().includes(q));
    
    const matchesRole = userRoleFilter === 'all' || u.role.toLowerCase() === userRoleFilter.toLowerCase();
    const matchesStatus = userStatusFilter === 'all' || 
      (userStatusFilter === 'active' && u.isActive) ||
      (userStatusFilter === 'inactive' && !u.isActive);

    const matchesCompany = userCompanyFilter === 'all' || 
      u.companyMemberships?.some(cm => cm.companyId === userCompanyFilter) ||
      u.projectMemberships?.some(pm => pm.companyId === userCompanyFilter);

    return matchesQuery && matchesRole && matchesStatus && matchesCompany;
  });
  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const paginatedUsers = filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);

  // Company Admins Flattened & Filtered
  const flattenedAdmins: Array<{ company: Company; admin: CompanyAdmin }> = [];
  allCompanyAdmins.forEach(group => {
    group.admins.forEach(adm => {
      flattenedAdmins.push({ company: group.company, admin: adm });
    });
  });
  const filteredAdmins = flattenedAdmins.filter(item => {
    const q = adminSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return item.company.name.toLowerCase().includes(q) ||
      item.company.code.toLowerCase().includes(q) ||
      (item.admin.userId?.name && item.admin.userId.name.toLowerCase().includes(q)) ||
      (item.admin.userId?.email && item.admin.userId.email.toLowerCase().includes(q));
  });
  const totalAdminPages = Math.max(1, Math.ceil(filteredAdmins.length / PAGE_SIZE));
  const paginatedAdmins = filteredAdmins.slice((adminPage - 1) * PAGE_SIZE, adminPage * PAGE_SIZE);

  // Invitations Filtered & Paginated
  const filteredInvites = platformInvites.filter(inv => {
    const q = inviteSearchQuery.toLowerCase().trim();
    const matchesQuery = !q || 
      (inv.name && inv.name.toLowerCase().includes(q)) ||
      (inv.email && inv.email.toLowerCase().includes(q));
    
    const isExpired = inv.expiresAt && new Date() > new Date(inv.expiresAt);
    const isAccepted = inv.registrationStatus === 'registered';
    const isRevoked = inv.status === 'revoked' || inv.registrationStatus === 'revoked';
    
    let matchesStatus = true;
    if (inviteStatusFilter === 'pending') {
      matchesStatus = !isAccepted && !isRevoked && !isExpired && inv.deliveryStatus !== 'delivery_failed';
    } else if (inviteStatusFilter === 'accepted') {
      matchesStatus = isAccepted;
    } else if (inviteStatusFilter === 'expired') {
      matchesStatus = !isAccepted && !isRevoked && isExpired;
    } else if (inviteStatusFilter === 'revoked') {
      matchesStatus = isRevoked;
    } else if (inviteStatusFilter === 'failed') {
      matchesStatus = inv.deliveryStatus === 'delivery_failed';
    }

    const matchesCompany = inviteCompanyFilter === 'all' || (inv.company && inv.company._id === inviteCompanyFilter);

    return matchesQuery && matchesStatus && matchesCompany;
  });
  const totalInvitePages = Math.max(1, Math.ceil(filteredInvites.length / PAGE_SIZE));
  const paginatedInvites = filteredInvites.slice((invitePage - 1) * PAGE_SIZE, invitePage * PAGE_SIZE);

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'COMPANY_CREATED':
      case 'PROJECT_CREATED':
        return <Plus className="w-4 h-4 text-emerald-600" />;
      case 'COMPANY_ACTIVATED':
      case 'COMPANY_DEACTIVATED':
        return <Building2 className="w-4 h-4 text-blue-600" />;
      case 'COMPANY_ADMIN_ASSIGNED':
      case 'INVITATION_ACCEPTED':
        return <UserCheck className="w-4 h-4 text-amber-600" />;
      case 'INVITATION_CREATED':
      case 'INVITATION_RESENT':
        return <Mail className="w-4 h-4 text-blue-500" />;
      default:
        return <Activity className="w-4 h-4 text-slate-500" />;
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'companies', label: 'Companies', icon: Building2 },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'access-invitations', label: 'Access & Invitations', icon: ShieldCheck },
  ];

  return (
    <div className="h-screen w-screen bg-[#F8FAFC] flex font-sans text-slate-900 overflow-hidden">
      
      {/* 1. SIDEBAR */}
      <aside className="w-64 h-full bg-[#0A192F] text-slate-300 flex flex-col shrink-0 border-r border-[#1E293B] select-none z-20">
        
        {/* Brand Header */}
        <div className="p-5 flex items-center gap-3 border-b border-[#1E293B]/80 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#1E40AF] to-[#3B82F6] flex items-center justify-center font-black text-white shadow-lg tracking-wider text-sm shrink-0">
            BP
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black tracking-tight text-white uppercase flex items-center gap-1.5">
              BPER Platform
            </h1>
            <p className="text-[11px] font-semibold text-blue-400/90 tracking-wide">
              Super Admin Portal
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id || (item.id === 'companies' && activeTab === 'company-details');
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'projects') {
                    navigate('/admin/projects');
                  } else {
                    setActiveTab(item.id as any);
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#1E293B] text-white shadow-xs font-bold border-l-2 border-blue-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#112240]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Profile Footer */}
        <div className="p-4 border-t border-[#1E293B]/80 bg-[#071322] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-blue-600/30 border border-blue-400/40 text-blue-200 flex items-center justify-center font-bold text-xs shrink-0">
                SA
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate leading-tight">Super Admin</p>
                <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">superadmin@bper.test</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN VIEW CONTAINER */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-y-auto">
        
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200/90 px-8 flex items-center justify-between sticky top-0 z-10 shadow-xs shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span 
              onClick={() => setActiveTab('overview')} 
              className="hover:text-blue-600 cursor-pointer transition-colors"
            >
              BPER
            </span>
            <span className="text-slate-300">/</span>
            <span 
              onClick={() => setActiveTab('overview')} 
              className="hover:text-blue-600 cursor-pointer transition-colors"
            >
              Super Admin
            </span>
            {activeTab !== 'overview' && (
              <>
                <span className="text-slate-300">/</span>
                <span className="text-slate-900 font-bold">
                  {activeTab === 'access-invitations' ? 'Access & Invitations' : 
                   activeTab === 'company-details' ? `${detailedCompany?.name || 'Company'} Management` :
                   activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                fetchInitialData();
                fetchUsersList();
                fetchPlatformInvites();
              }}
              title="Refresh Data"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#165BAA] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                SA
              </div>
              <span className="text-xs font-bold text-slate-800 hidden md:inline">Platform Super Admin</span>
            </div>
          </div>
        </header>

        {/* Global Notifications */}
        {errorMsg && (
          <div className="bg-red-50 border-b border-red-200 px-8 py-3 text-xs text-red-800 flex items-center justify-between animate-fadeIn shrink-0">
            <span className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              {errorMsg}
            </span>
            <button onClick={() => setErrorMsg('')} className="text-red-500 hover:text-red-800 font-bold ml-4">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-8 py-3 text-xs text-emerald-800 flex items-center justify-between animate-fadeIn shrink-0">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              {successMsg}
            </span>
            <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-800 font-bold ml-4">✕</button>
          </div>
        )}

        {/* Subpage Back Header */}
        {activeTab !== 'overview' && (
          <div className="bg-white border-b border-slate-200/80 px-8 py-3.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (activeTab === 'company-details') {
                    setActiveTab('companies');
                  } else {
                    setActiveTab('overview');
                  }
                }}
                className="text-xs h-8 px-3 gap-1.5 font-bold border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {activeTab === 'company-details' ? 'Back to Companies' : 'Back to Overview'}
              </Button>
              <div className="h-4 w-px bg-slate-200" />
              <span className="text-xs font-bold text-slate-800">
                {activeTab === 'companies' ? 'Companies Directory' : 
                 activeTab === 'company-details' ? `Managing ${detailedCompany?.name}` :
                 activeTab === 'access-invitations' ? 'Access & Invitations' : activeTab}
              </span>
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              Multi-Tenant Governance Active
            </span>
          </div>
        )}

        {/* Content Body */}
        <main className="p-8 space-y-6 flex-1">

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              {/* Heading & Main Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">Platform overview</h1>
                  <p className="text-xs font-medium text-slate-500 mt-1">
                    Manage your companies, projects, company admins and access.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsGlobalModalAction(true);
                      setReturnToModalAfterAction(false);
                      setModalTargetCompanyId('');
                      setNewAdmin({ email: '', name: '', canCreateProjects: true });
                      setShowAssignAdminModal(true);
                    }}
                    className="border-slate-300 text-slate-700 hover:bg-slate-100 text-xs h-9 px-3.5 gap-2 font-semibold rounded-lg shadow-xs"
                  >
                    <UserCheck className="w-4 h-4 text-amber-600" />
                    Invite Company Admin
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsGlobalModalAction(true);
                      setReturnToModalAfterAction(false);
                      setModalTargetCompanyId('');
                      setNewProject({ name: '', code: '', department: 'Finance & Accounting', description: '' });
                      setShowCreateProjectModal(true);
                    }}
                    className="border-slate-300 text-slate-700 hover:bg-slate-100 text-xs h-9 px-3.5 gap-2 font-semibold rounded-lg shadow-xs"
                  >
                    <FolderKanban className="w-4 h-4 text-blue-600" />
                    Create Project
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowCreateCompanyModal(true)}
                    className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 px-4 gap-2 font-bold rounded-lg shadow-sm transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Create Company
                  </Button>
                </div>
              </div>

              {/* 3 KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div 
                  onClick={() => setActiveTab('companies')}
                  className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Companies</span>
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Building2 className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-slate-900 mt-3">{stats?.totalCompanies ?? companies.length}</p>
                  <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {stats?.activeCompanies ?? companies.filter(c => c.isActive).length} active enterprise tenants
                  </p>
                </div>

                <div 
                  onClick={() => navigate('/admin/projects')}
                  className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Projects</span>
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FolderKanban className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-slate-900 mt-3">{stats?.totalProjects ?? 0}</p>
                  <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    {stats?.activeProjects ?? 0} active project workspaces
                  </p>
                </div>

                <div 
                  onClick={() => {
                    setActiveTab('access-invitations');
                    setAccessSubTab('admins');
                  }}
                  className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Company Admins</span>
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-slate-900 mt-3">{stats?.totalAdmins ?? 0}</p>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Tenant administrators across companies
                  </p>
                </div>
              </div>

              {/* Companies Registry Overview List */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">Companies Registry</h2>
                    <p className="text-xs text-slate-500 font-medium">Enterprise companies registered in BPER</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    Showing top {Math.min(5, companies.length)} of {companies.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {companies.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-400">
                      No companies configured yet.
                    </div>
                  ) : (
                    companies.slice(0, 5).map(c => {
                      const projCount = stats?.projectCountsMap[c._id] ?? 0;
                      const adminCount = stats?.adminCountsMap[c._id] ?? 0;

                      return (
                        <div
                          key={c._id}
                          className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-100 to-indigo-100 text-[#165BAA] font-extrabold flex items-center justify-center text-sm shrink-0 border border-blue-200/60 shadow-2xs">
                              {c.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-extrabold text-slate-900 truncate">{c.name}</h3>
                                <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  {c.code}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  c.isActive 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                    : 'bg-red-50 text-red-700 border-red-200'
                                }`}>
                                  {c.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>

                              <p className="text-xs text-slate-500 truncate mt-1">
                                {c.domain || c.description || 'Enterprise Multi-Tenant Environment'}
                              </p>

                              <div className="flex items-center gap-4 text-xs text-slate-600 font-medium mt-2">
                                <span className="flex items-center gap-1.5">
                                  <FolderKanban className="w-3.5 h-3.5 text-indigo-500" />
                                  <strong className="text-slate-900">{projCount}</strong> Projects
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1.5">
                                  <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                                  <strong className="text-slate-900">{adminCount}</strong> Admins
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                selectCompany(c);
                                setShowProjectsViewModal(true);
                              }}
                              className="text-xs h-8 px-3 gap-1.5 font-semibold border-slate-200 text-slate-700 hover:bg-slate-100"
                            >
                              Quick View
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => openCompanyDetailsPage(c)}
                              className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-8 px-3 gap-1.5 font-bold rounded-lg shadow-xs"
                            >
                              Manage Company
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="pt-2 flex justify-start">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('companies')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 gap-1.5"
                  >
                    View All Companies ({companies.length})
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: COMPANIES REGISTRY */}
          {activeTab === 'companies' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">Registered Companies</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Comprehensive enterprise tenant organization registry</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowCreateCompanyModal(true)}
                  className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 px-4 gap-1.5 font-bold rounded-lg shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  New Company
                </Button>
              </div>

              {/* Companies Table Container */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
                {/* Search & Status Filter Bar */}
                <div className="p-4 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 max-w-lg">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <Input
                        placeholder="Search by company name or code..."
                        value={companySearchQuery}
                        onChange={e => {
                          setCompanySearchQuery(e.target.value);
                          setCompanyPage(1);
                        }}
                        className="pl-8 h-8 text-xs bg-white"
                      />
                    </div>
                    <select
                      value={companyStatusFilter}
                      onChange={e => {
                        setCompanyStatusFilter(e.target.value as any);
                        setCompanyPage(1);
                      }}
                      className="bper-select-filter min-w-[125px] text-xs rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:border-slate-400 focus:border-blue-500"
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active Only</option>
                      <option value="inactive">Inactive Only</option>
                    </select>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    Total Companies: <strong className="text-slate-900 font-bold">{filteredCompanies.length}</strong>
                  </span>
                </div>

                {paginatedCompanies.length === 0 ? (
                  <div className="p-12 text-center text-xs text-slate-400">
                    No companies match your search or filter criteria.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {paginatedCompanies.map(c => {
                      const projCount = stats?.projectCountsMap[c._id] ?? 0;
                      const adminCount = stats?.adminCountsMap[c._id] ?? 0;
                      return (
                        <div key={c._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                              {c.name.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-slate-900">{c.name}</h4>
                                <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {c.code}
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                                  c.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                                }`}>
                                  {c.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">{c.domain || c.description || 'Enterprise Tenant'}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs font-semibold">
                            <span className="text-slate-600">{projCount} Projects</span>
                            <span className="text-slate-600">{adminCount} Admins</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                selectCompany(c);
                                setShowProjectsViewModal(true);
                              }}
                              className="text-xs h-8 px-3 gap-1 font-semibold border-slate-300"
                            >
                              Quick View
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => openCompanyDetailsPage(c)}
                              className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-8 px-3 gap-1 font-bold rounded-lg shadow-2xs"
                            >
                              Manage
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Companies Pagination */}
                {totalCompanyPages > 1 && (
                  <div className="p-3 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                    <span>Page {companyPage} of {totalCompanyPages}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={companyPage <= 1}
                        onClick={() => setCompanyPage(p => Math.max(1, p - 1))}
                        className="h-7 text-xs px-2.5 gap-1"
                      >
                        <ChevronLeft className="w-3 h-3" /> Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={companyPage >= totalCompanyPages}
                        onClick={() => setCompanyPage(p => Math.min(totalCompanyPages, p + 1))}
                        className="h-7 text-xs px-2.5 gap-1"
                      >
                        Next <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DEDICATED COMPANY DETAILS PAGE */}
          {activeTab === 'company-details' && detailedCompany && (
            <div className="space-y-6">
              {/* Header card for the selected company */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#165BAA] to-[#3B82F6] text-white font-black text-xl flex items-center justify-center shadow-md">
                    {detailedCompany.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h1 className="text-xl font-black text-slate-900 tracking-tight">{detailedCompany.name}</h1>
                      <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                        {detailedCompany.code}
                      </span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                        detailedCompany.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {detailedCompany.isActive ? 'Active Enterprise Tenant' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {detailedCompany.domain ? `Domain: ${detailedCompany.domain}` : detailedCompany.description || 'Dedicated multi-tenant company partition'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsGlobalModalAction(false);
                      setReturnToModalAfterAction(false);
                      setModalTargetCompanyId(detailedCompany._id);
                      setNewAdmin({ email: '', name: '', canCreateProjects: true });
                      setShowAssignAdminModal(true);
                    }}
                    className="text-xs h-9 px-3.5 gap-1.5 font-bold border-slate-300 text-slate-700"
                  >
                    <UserPlus className="w-4 h-4 text-amber-600" />
                    Invite Company Admin
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setIsGlobalModalAction(false);
                      setReturnToModalAfterAction(false);
                      setModalTargetCompanyId(detailedCompany._id);
                      setNewProject({ name: '', code: '', department: 'Finance & Accounting', description: '' });
                      setShowCreateProjectModal(true);
                    }}
                    className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 px-4 gap-1.5 font-bold rounded-lg shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Project
                  </Button>
                </div>
              </div>

              {/* Sub-navigation for Company Details */}
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'projects', label: `Projects (${companyProjects.length})` },
                  { id: 'admins', label: `Administrators (${companyAdmins.length})` },
                  { id: 'users', label: 'Users & Roles' },
                  { id: 'invitations', label: 'Invitations' },
                  { id: 'settings', label: 'Company Settings' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setCompanyDetailsTab(tab.id as any)}
                    className={`px-3 py-2 text-xs font-bold rounded-lg transition-all ${
                      companyDetailsTab === tab.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* SECTION: Overview */}
              {companyDetailsTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                    <span className="text-xs font-bold text-slate-500 uppercase">Configured Workspaces</span>
                    <p className="text-2xl font-black text-slate-900 mt-2">{companyProjects.length}</p>
                    <p className="text-xs text-slate-500 mt-1">Dedicated WDT & FTE analytics boundaries</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                    <span className="text-xs font-bold text-slate-500 uppercase">Assigned Admins</span>
                    <p className="text-2xl font-black text-slate-900 mt-2">{companyAdmins.length}</p>
                    <p className="text-xs text-slate-500 mt-1">Delegated company administrators</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                    <span className="text-xs font-bold text-slate-500 uppercase">Tenant Status</span>
                    <p className="text-2xl font-black text-emerald-600 mt-2">{detailedCompany.isActive ? 'Active' : 'Suspended'}</p>
                    <p className="text-xs text-slate-500 mt-1">Tenant ID: {detailedCompany._id}</p>
                  </div>
                </div>
              )}

              {/* SECTION: Projects */}
              {companyDetailsTab === 'projects' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
                  <div className="p-4 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Projects Scoped to {detailedCompany.name} ({companyProjects.length})
                    </h3>
                    <Button
                      size="sm"
                      onClick={() => {
                        setIsGlobalModalAction(false);
                        setReturnToModalAfterAction(false);
                        setModalTargetCompanyId(detailedCompany._id);
                        setShowCreateProjectModal(true);
                      }}
                      className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-8 px-3 gap-1 font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Project
                    </Button>
                  </div>

                  {companyProjects.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-400">
                      No projects configured yet under this company.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {companyProjects.map(p => (
                        <div key={p._id} className="p-4 flex items-center justify-between gap-4 text-xs hover:bg-slate-50">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                              <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {p.code}
                              </span>
                            </div>
                            {p.department && (
                              <p className="text-slate-500 text-xs mt-0.5">Department: {p.department}</p>
                            )}
                            {p.description && (
                              <p className="text-slate-400 text-xs mt-0.5">{p.description}</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleOpenProjectWorkspace(p, detailedCompany)}
                            className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-8 px-3 gap-1.5 font-bold"
                          >
                            Launch Workspace
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: Administrators */}
              {companyDetailsTab === 'admins' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
                  <div className="p-4 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Company Administrators for {detailedCompany.name} ({companyAdmins.length})
                    </h3>
                    <Button
                      size="sm"
                      onClick={() => {
                        setIsGlobalModalAction(false);
                        setReturnToModalAfterAction(false);
                        setModalTargetCompanyId(detailedCompany._id);
                        setShowAssignAdminModal(true);
                      }}
                      className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-8 px-3 gap-1 font-semibold"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Invite Admin
                    </Button>
                  </div>

                  {companyAdmins.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-400">
                      No administrators assigned yet. Platform Super Admin retains master control.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {companyAdmins.map(a => (
                        <div key={a._id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-xs">
                              {a.userId?.name?.charAt(0) || 'A'}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm leading-tight">{a.userId?.name || 'Administrator'}</p>
                              <p className="text-xs text-slate-500 leading-tight mt-0.5">{a.userId?.email}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              a.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {a.isActive ? 'Active Admin' : 'Deactivated'}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleAdminStatus(detailedCompany._id, a._id, a.isActive)}
                              className="text-xs h-7 px-2.5 font-semibold"
                            >
                              {a.isActive ? 'Deactivate' : 'Reactivate'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAdminToReplace({ company: detailedCompany, admin: a });
                                setShowReplaceAdminModal(true);
                              }}
                              className="text-xs h-7 px-2.5 font-semibold text-blue-600 border-blue-200 hover:bg-blue-50"
                            >
                              Replace
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: Users & Roles (Scoped to Company) */}
              {companyDetailsTab === 'users' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <p className="text-xs text-slate-600">
                      Showing users with assigned memberships in <strong className="text-slate-900">{detailedCompany.name}</strong>.
                    </p>
                  </div>
                  {/* Users table filtered to this company */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
                    <div className="divide-y divide-slate-100">
                      {usersList
                        .filter(u => u.companyMemberships?.some(cm => cm.companyId === detailedCompany._id) || u.projectMemberships?.some(pm => pm.companyId === detailedCompany._id))
                        .map(u => (
                          <div key={u._id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50">
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{u.name}</p>
                              <p className="text-slate-500">{u.email} • Role: <strong className="uppercase">{u.role}</strong></p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedUserForDetails(u)}
                              className="text-xs h-7 px-2.5"
                            >
                              Inspect Details
                            </Button>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: Invitations (Scoped to Company) */}
              {companyDetailsTab === 'invitations' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
                  <div className="p-4 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Invitations for {detailedCompany.name}
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {platformInvites
                      .filter(i => i.company && i.company._id === detailedCompany._id)
                      .map(inv => (
                        <div key={inv._id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50">
                          <div>
                            <p className="font-bold text-slate-900">{inv.name} ({inv.email})</p>
                            <p className="text-slate-500">Role: {inv.role} • Status: {inv.status}</p>
                          </div>
                          {inv.inviteLink && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard(inv.inviteLink!, inv._id)}
                              className="text-xs h-7 px-2.5 gap-1"
                            >
                              Copy Link
                            </Button>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* SECTION: Settings */}
              {companyDetailsTab === 'settings' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <h3 className="text-sm font-bold text-slate-900">Company Status & Tenant Controls</h3>
                  <div className="flex items-center justify-between py-3 border-t border-slate-100">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Tenant Active State</p>
                      <p className="text-xs text-slate-500">Deactivating a company blocks logins and access to all its projects.</p>
                    </div>
                    <Button
                      size="sm"
                      variant={detailedCompany.isActive ? 'destructive' : 'default'}
                      onClick={() => handleToggleCompanyStatus(detailedCompany)}
                      className="text-xs h-8 px-3 font-semibold"
                    >
                      {detailedCompany.isActive ? 'Deactivate Company' : 'Reactivate Company'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ACCESS & INVITATIONS (Users, Company Admins, Invitations) */}
          {(activeTab === 'access-invitations' || activeTab === 'invitations' || activeTab === 'admins' || activeTab === 'access') && (
            <div className="space-y-6">
              {/* Access & Invitations Navigation Sub-Tabs */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Access & Invitations</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Manage user directory, company administrators, and role-based access governance</p>
                </div>

                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setAccessSubTab('users')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      accessSubTab === 'users'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Users & Roles ({usersList.length})
                  </button>
                  <button
                    onClick={() => setAccessSubTab('admins')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      accessSubTab === 'admins'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Company Admins ({stats?.totalAdmins ?? 0})
                  </button>
                  <button
                    onClick={() => setAccessSubTab('invitations')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      accessSubTab === 'invitations'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Invitations ({platformInvites.length})
                  </button>
                </div>
              </div>

              {/* Sub-tab 1: Users & Roles (Full Searchable & Paginated Table) */}
              {accessSubTab === 'users' && (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                      <span className="text-xs font-bold text-slate-500 uppercase">Super Admins</span>
                      <p className="text-2xl font-black text-slate-900 mt-2">
                        {usersList.filter(u => u.role === 'super_admin').length || 1}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Platform-wide full access</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                      <span className="text-xs font-bold text-slate-500 uppercase">Company Admins</span>
                      <p className="text-2xl font-black text-slate-900 mt-2">{stats?.totalAdmins ?? 0}</p>
                      <p className="text-xs text-slate-500 mt-1">Scoped tenant administrators</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                      <span className="text-xs font-bold text-slate-500 uppercase">Managers & Employees</span>
                      <p className="text-2xl font-black text-slate-900 mt-2">
                        {usersList.filter(u => ['manager', 'employee'].includes(u.role)).length || (stats?.totalWorkforce ?? 0)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Workforce project participants</p>
                    </div>
                  </div>

                  {/* Users Directory Table Container */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
                    {/* Filter & Search Bar */}
                    <div className="p-4 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3 flex-1">
                        <div className="relative w-64">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                          <Input
                            placeholder="Search name, email, ID..."
                            value={userSearchQuery}
                            onChange={e => {
                              setUserSearchQuery(e.target.value);
                              setUserPage(1);
                            }}
                            className="pl-8 h-8 text-xs bg-white"
                          />
                        </div>

                        {/* Company Filter */}
                        <select
                          value={userCompanyFilter}
                          onChange={e => {
                            setUserCompanyFilter(e.target.value);
                            setUserPage(1);
                          }}
                          className="bper-select-filter min-w-[140px] text-xs rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:border-slate-400 focus:border-blue-500"
                        >
                          <option value="all">All Companies</option>
                          {companies.map(c => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                          ))}
                        </select>

                        {/* Role Filter */}
                        <select
                          value={userRoleFilter}
                          onChange={e => {
                            setUserRoleFilter(e.target.value);
                            setUserPage(1);
                          }}
                          className="bper-select-filter min-w-[110px] text-xs rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:border-slate-400 focus:border-blue-500"
                        >
                          <option value="all">All Roles</option>
                          <option value="super_admin">Super Admin</option>
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="employee">Employee</option>
                        </select>

                        {/* Status Filter */}
                        <select
                          value={userStatusFilter}
                          onChange={e => {
                            setUserStatusFilter(e.target.value);
                            setUserPage(1);
                          }}
                          className="bper-select-filter min-w-[125px] text-xs rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:border-slate-400 focus:border-blue-500"
                        >
                          <option value="all">All Statuses</option>
                          <option value="active">Active Only</option>
                          <option value="inactive">Deactivated Only</option>
                        </select>
                      </div>

                      <span className="text-xs text-slate-500 font-medium">
                        Showing {filteredUsers.length} of {usersList.length} users
                      </span>
                    </div>

                    {/* Table View */}
                    <div className="bper-table-container border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <table className="w-full text-left text-xs min-w-[960px] border-collapse">
                        <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                          <tr>
                            <th className="py-3.5 px-4 whitespace-nowrap min-w-[160px]">Full Name</th>
                            <th className="py-3.5 px-4 whitespace-nowrap min-w-[200px]">Email</th>
                            <th className="py-3.5 px-4 whitespace-nowrap min-w-[150px]">Company</th>
                            <th className="py-3.5 px-4 whitespace-nowrap min-w-[180px]">Project</th>
                            <th className="py-3.5 px-4 whitespace-nowrap min-w-[120px]">Role</th>
                            <th className="py-3.5 px-4 whitespace-nowrap min-w-[110px]">Account Status</th>
                            <th className="py-3.5 px-4 text-right whitespace-nowrap min-w-[130px] sticky right-0 bg-slate-50 shadow-[-6px_0_10px_rgba(0,0,0,0.02)]">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedUsers.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 text-center text-slate-400">
                                No users match the selected search or filter criteria.
                              </td>
                            </tr>
                          ) : (
                            paginatedUsers.map(u => (
                              <tr key={u._id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                                  {u.name}
                                </td>
                                <td className="py-3 px-4 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                                  {u.email}
                                </td>
                                <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
                                  {u.primaryCompany || 'Unassigned'}
                                </td>
                                <td className="py-3 px-4 text-slate-600 whitespace-nowrap max-w-xs truncate">
                                  {u.primaryProject || 'Unassigned'}
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                                    {u.role.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    u.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                                  }`}>
                                    {u.isActive ? 'Active' : 'Deactivated'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setSelectedUserForDetails(u)}
                                      className="h-7 text-xs px-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                    >
                                      Details
                                    </Button>
                                    {u.role !== 'super_admin' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleToggleUserStatus(u)}
                                        className={`h-7 text-[11px] px-2 font-semibold ${
                                          u.isActive ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                                        }`}
                                      >
                                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Bar */}
                    {totalUserPages > 1 && (
                      <div className="p-3 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                        <span>Page {userPage} of {totalUserPages}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={userPage <= 1}
                            onClick={() => setUserPage(p => Math.max(1, p - 1))}
                            className="h-7 text-xs px-2.5 gap-1"
                          >
                            <ChevronLeft className="w-3 h-3" /> Previous
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={userPage >= totalUserPages}
                            onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                            className="h-7 text-xs px-2.5 gap-1"
                          >
                            Next <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sub-tab 2: Company Administrators */}
              {accessSubTab === 'admins' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-extrabold text-slate-900">Company Administrators</h1>
                      <p className="text-xs text-slate-500 mt-0.5">Assigned tenant administrators managing projects and workforce access</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setIsGlobalModalAction(true);
                        setReturnToModalAfterAction(false);
                        setModalTargetCompanyId('');
                        setNewAdmin({ email: '', name: '', canCreateProjects: true });
                        setShowAssignAdminModal(true);
                      }}
                      className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 px-4 gap-2 font-bold rounded-lg shadow-sm"
                    >
                      <UserPlus className="w-4 h-4" />
                      Invite Company Admin
                    </Button>
                  </div>

                  {/* Company Admins Container with Search */}
                  <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
                    <div className="p-4 bg-slate-50/50 flex items-center justify-between gap-4">
                      <div className="relative w-80">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                        <Input
                          placeholder="Search admin name, email, or company..."
                          value={adminSearchQuery}
                          onChange={e => {
                            setAdminSearchQuery(e.target.value);
                            setAdminPage(1);
                          }}
                          className="pl-8 h-8 text-xs bg-white"
                        />
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        Total Admins: <strong className="text-slate-900">{filteredAdmins.length}</strong>
                      </span>
                    </div>

                    {paginatedAdmins.length === 0 ? (
                      <div className="p-12 text-center text-xs text-slate-400">
                        No company administrators found.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {paginatedAdmins.map(item => (
                          <div key={item.admin._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 text-xs">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-xs shrink-0">
                                {item.admin.userId?.name?.charAt(0) || 'A'}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 text-sm">{item.admin.userId?.name || 'Administrator'}</p>
                                <p className="text-slate-500 font-mono text-[11px]">{item.admin.userId?.email}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    {item.company.name} ({item.company.code})
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    item.admin.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                                  }`}>
                                    {item.admin.isActive ? 'Active Admin' : 'Deactivated'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleAdminStatus(item.company._id, item.admin._id, item.admin.isActive)}
                                className="h-7 text-xs px-2.5 font-semibold"
                              >
                                {item.admin.isActive ? 'Deactivate' : 'Reactivate'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setAdminToReplace(item);
                                  setShowReplaceAdminModal(true);
                                }}
                                className="h-7 text-xs px-2.5 font-semibold text-blue-600 border-blue-200 hover:bg-blue-50"
                              >
                                Replace
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => openCompanyDetailsPage(item.company)}
                                className="h-7 text-xs px-2.5 font-semibold bg-[#165BAA] hover:bg-[#124a8a] text-white"
                              >
                                View Company
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pagination */}
                    {totalAdminPages > 1 && (
                      <div className="p-3 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                        <span>Page {adminPage} of {totalAdminPages}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={adminPage <= 1}
                            onClick={() => setAdminPage(p => Math.max(1, p - 1))}
                            className="h-7 text-xs px-2.5 gap-1"
                          >
                            <ChevronLeft className="w-3 h-3" /> Previous
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={adminPage >= totalAdminPages}
                            onClick={() => setAdminPage(p => Math.min(totalAdminPages, p + 1))}
                            className="h-7 text-xs px-2.5 gap-1"
                          >
                            Next <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sub-tab 3: Invitations (Searchable & Paginated Table) */}
              {accessSubTab === 'invitations' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-extrabold text-slate-900">User Onboarding & Invitations</h1>
                      <p className="text-xs text-slate-500 mt-0.5">Invite Company Admins, Managers and Staff with email or manual activation links</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setShowInviteModal(true);
                        setGeneratedInviteLink(null);
                      }}
                      className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 px-4 gap-2 font-bold rounded-lg shadow-sm"
                    >
                      <UserPlus className="w-4 h-4" />
                      Invite New User
                    </Button>
                  </div>

                  {/* Invitation Stats Bar */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Total Invitations</span>
                      <p className="text-xl font-black text-slate-900 mt-1">{platformInvites.length}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Pending Activation</span>
                      <p className="text-xl font-black text-amber-600 mt-1">
                        {platformInvites.filter(i => i.registrationStatus === 'not_registered' && i.status !== 'revoked').length}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Accepted Accounts</span>
                      <p className="text-xl font-black text-emerald-600 mt-1">
                        {platformInvites.filter(i => i.registrationStatus === 'registered').length}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Revoked / Expired</span>
                      <p className="text-xl font-black text-slate-500 mt-1">
                        {platformInvites.filter(i => i.status === 'revoked' || (i.expiresAt && new Date() > new Date(i.expiresAt))).length}
                      </p>
                    </div>
                  </div>

                  {/* Invitations Table */}
                  <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
                    <div className="p-4 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3 flex-1">
                        <div className="relative w-72">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                          <Input
                            placeholder="Search email or recipient name..."
                            value={inviteSearchQuery}
                            onChange={e => {
                              setInviteSearchQuery(e.target.value);
                              setInvitePage(1);
                            }}
                            className="pl-8 h-8 text-xs bg-white"
                          />
                        </div>

                        {/* Status Filter */}
                        <select
                          value={inviteStatusFilter}
                          onChange={e => {
                            setInviteStatusFilter(e.target.value);
                            setUserPage(1);
                          }}
                          className="bper-select-filter min-w-[125px] text-xs rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:border-slate-400 focus:border-blue-500"
                        >
                          <option value="all">All Statuses</option>
                          <option value="pending">Pending</option>
                          <option value="accepted">Accepted</option>
                          <option value="expired">Expired</option>
                          <option value="revoked">Revoked</option>
                          <option value="failed">Failed</option>
                        </select>

                        {/* Company Filter */}
                        <select
                          value={inviteCompanyFilter}
                          onChange={e => {
                            setInviteCompanyFilter(e.target.value);
                            setInvitePage(1);
                          }}
                          className="bper-select-filter min-w-[140px] text-xs rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:border-slate-400 focus:border-blue-500"
                        >
                          <option value="all">All Companies</option>
                          {companies.map(c => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-medium">
                          Showing {filteredInvites.length} of {platformInvites.length}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={fetchPlatformInvites}
                          className="text-xs h-7 px-2.5 gap-1 border-slate-300 font-semibold"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Refresh
                        </Button>
                      </div>
                    </div>

                    {loadingInvites ? (
                      <div className="p-12 text-center text-xs text-slate-400">Loading invitations...</div>
                    ) : paginatedInvites.length === 0 ? (
                      <div className="p-12 text-center text-xs text-slate-400">
                        No invitations match the selected criteria.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {paginatedInvites.map(inv => {
                          const isExpired = inv.expiresAt && new Date() > new Date(inv.expiresAt);
                          const isAccepted = inv.registrationStatus === 'registered';
                          const isRevoked = inv.status === 'revoked' || inv.registrationStatus === 'revoked';

                          return (
                            <div key={inv._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors text-xs">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <strong className="text-slate-900 font-bold">{inv.name}</strong>
                                  <span className="text-slate-500 font-mono text-[11px]">({inv.email})</span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                                    {inv.role.replace(/_/g, ' ')}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    isAccepted 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                      : isRevoked 
                                      ? 'bg-red-50 text-red-700 border-red-200' 
                                      : isExpired 
                                      ? 'bg-slate-100 text-slate-600 border-slate-200' 
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}>
                                    {isAccepted ? 'Accepted' : isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Pending Activation'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                                  {inv.company && <span>Company: <strong>{inv.company.name}</strong></span>}
                                  {inv.project && <span>Project: <strong>{inv.project.name}</strong></span>}
                                  <span>Invited: {new Date(inv.createdAt).toLocaleDateString()}</span>
                                  <span>Expires: {new Date(inv.expiresAt).toLocaleDateString()}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                {!isAccepted && !isRevoked && inv.inviteLink && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => copyToClipboard(inv.inviteLink!, inv._id)}
                                    className="text-xs h-7 px-2.5 gap-1 border-slate-300 font-semibold"
                                  >
                                    {copiedInviteId === inv._id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                    {copiedInviteId === inv._id ? 'Copied' : 'Copy Link'}
                                  </Button>
                                )}
                                {!isAccepted && !isRevoked && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleResendInvite(inv._id, 'manual')}
                                    className="text-xs h-7 px-2.5 gap-1 border-slate-300 font-semibold text-blue-600 hover:bg-blue-50"
                                  >
                                    <Send className="w-3 h-3" />
                                    Resend
                                  </Button>
                                )}
                                {!isAccepted && !isRevoked && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRevokeInvite(inv._id)}
                                    className="text-xs h-7 px-2.5 gap-1 border-red-200 text-red-600 hover:bg-red-50 font-semibold"
                                  >
                                    <X className="w-3 h-3" />
                                    Revoke
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Pagination */}
                    {totalInvitePages > 1 && (
                      <div className="p-3 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                        <span>Page {invitePage} of {totalInvitePages}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={invitePage <= 1}
                            onClick={() => setInvitePage(p => Math.max(1, p - 1))}
                            className="h-7 text-xs px-2.5 gap-1"
                          >
                            <ChevronLeft className="w-3 h-3" /> Previous
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={invitePage >= totalInvitePages}
                            onClick={() => setInvitePage(p => Math.min(totalInvitePages, p + 1))}
                            className="h-7 text-xs px-2.5 gap-1"
                          >
                            Next <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: PLATFORM ACTIVITY LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">Platform Activity Logs</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Immutable audit trail of actions taken across the platform</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchInitialData}
                  className="text-xs h-8.5 px-3 gap-1.5 border-slate-300 font-semibold"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh Logs
                </Button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
                {activityLogs.length === 0 ? (
                  <div className="p-12 text-center text-xs text-slate-400">No activity logs recorded.</div>
                ) : (
                  activityLogs.map(log => (
                    <div key={log._id} className="p-4 flex items-start gap-4 hover:bg-slate-50 transition-colors">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                        {getActivityIcon(log.action)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-900">{log.action.replace(/_/g, ' ')}</p>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{log.description}</p>
                        {log.actor?.email && (
                          <p className="text-[10px] text-slate-400 mt-1">Actor: {log.actor.email}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL 1: Create Company */}
      {showCreateCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Create New Company</h3>
                <p className="text-xs text-slate-500">Add an independent corporate tenant to the platform.</p>
              </div>
              <button onClick={() => setShowCreateCompanyModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCompany} className="space-y-4 py-4">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Company Name *</Label>
                <Input
                  placeholder="e.g. Acme Corporation"
                  value={newCompany.name}
                  onChange={e => setNewCompany({ ...newCompany, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Company Code * (Unique Identifier)</Label>
                <Input
                  placeholder="e.g. ACME"
                  value={newCompany.code}
                  onChange={e => setNewCompany({ ...newCompany, code: e.target.value.toUpperCase() })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Corporate Domain (Optional)</Label>
                <Input
                  placeholder="e.g. acme.com"
                  value={newCompany.domain}
                  onChange={e => setNewCompany({ ...newCompany, domain: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Description</Label>
                <Input
                  placeholder="Brief business description"
                  value={newCompany.description}
                  onChange={e => setNewCompany({ ...newCompany, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setShowCreateCompanyModal(false)} className="text-xs h-9">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 font-semibold">
                  {submitting ? 'Creating...' : 'Create Company'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create Project */}
      {showCreateProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {isGlobalModalAction
                    ? (modalTargetCompanyId ? `Create Project in ${companies.find(c => c._id === modalTargetCompanyId)?.name || 'Selected Company'}` : 'Create Project')
                    : `Create Project in ${selectedCompany?.name || 'Company'}`}
                </h3>
                <p className="text-xs text-slate-500">Projects provide dedicated scoping for WDT and FTE analytics.</p>
              </div>
              <button 
                onClick={() => {
                  setShowCreateProjectModal(false);
                  if (returnToModalAfterAction) setShowProjectsViewModal(true);
                }} 
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="space-y-4 py-4">
              {/* Company Selection Dropdown for Global Action */}
              {isGlobalModalAction ? (
                <div className="space-y-1 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                  <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span>Target Company *</span>
                    <span className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">Required</span>
                  </Label>
                  <select
                    id="project-target-company-select"
                    value={modalTargetCompanyId}
                    onChange={e => setModalTargetCompanyId(e.target.value)}
                    required
                    className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-[#165BAA] focus:outline-none"
                  >
                    <option value="" disabled>-- Select a company --</option>
                    {companies.map(c => (
                      <option key={c._id} value={c._id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                  {modalTargetCompanyId && (
                    <p className="text-[11px] text-blue-700 font-semibold mt-1">
                      Selected: {companies.find(c => c._id === modalTargetCompanyId)?.name}
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                  <span>Target Company:</span>
                  <span className="font-bold text-slate-900">{selectedCompany?.name}</span>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Project Name *</Label>
                <Input
                  placeholder="e.g. Finance Operations 2026"
                  value={newProject.name}
                  onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Project Code * (Scoped to Company)</Label>
                <Input
                  placeholder="e.g. FIN_OPS"
                  value={newProject.code}
                  onChange={e => setNewProject({ ...newProject, code: e.target.value.toUpperCase() })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Department *</Label>
                <Input
                  placeholder="e.g. Finance & Accounting"
                  value={newProject.department}
                  onChange={e => setNewProject({ ...newProject, department: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Description</Label>
                <Input
                  placeholder="Operational scope of this project"
                  value={newProject.description}
                  onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setShowCreateProjectModal(false);
                    if (returnToModalAfterAction) setShowProjectsViewModal(true);
                  }} 
                  className="text-xs h-9"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={submitting || (isGlobalModalAction && !modalTargetCompanyId)} 
                  className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Invite Company Admin */}
      {showAssignAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {isGlobalModalAction
                    ? (modalTargetCompanyId ? `Invite Company Admin for ${companies.find(c => c._id === modalTargetCompanyId)?.name || 'Selected Company'}` : 'Invite Company Administrator')
                    : `Invite Company Admin for ${selectedCompany?.name || 'Company'}`}
                </h3>
                <p className="text-xs text-slate-500">Sends a secure onboarding invitation link to verify email and activate account.</p>
              </div>
              <button 
                onClick={() => {
                  setShowAssignAdminModal(false);
                  if (returnToModalAfterAction) setShowProjectsViewModal(true);
                }} 
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleInviteCompanyAdmin} className="space-y-4 py-4">
              {/* Company Selection Dropdown for Global Action */}
              {isGlobalModalAction ? (
                <div className="space-y-1 bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                  <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span>Target Company *</span>
                    <span className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">Required</span>
                  </Label>
                  <select
                    id="admin-target-company-select"
                    value={modalTargetCompanyId}
                    onChange={e => setModalTargetCompanyId(e.target.value)}
                    required
                    className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-[#165BAA] focus:outline-none"
                  >
                    <option value="" disabled>-- Select a company --</option>
                    {companies.map(c => (
                      <option key={c._id} value={c._id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                  {modalTargetCompanyId && (
                    <p className="text-[11px] text-amber-800 font-semibold mt-1">
                      Targeting: {companies.find(c => c._id === modalTargetCompanyId)?.name}
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                  <span>Target Company:</span>
                  <span className="font-bold text-slate-900">{selectedCompany?.name}</span>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Admin Full Name *</Label>
                <Input
                  placeholder="e.g. Sarah Jenkins"
                  value={newAdmin.name}
                  onChange={e => setNewAdmin({ ...newAdmin, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Admin Email Address *</Label>
                <Input
                  type="email"
                  placeholder="e.g. sjenkins@company.com"
                  value={newAdmin.email}
                  onChange={e => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  required
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="canCreateProjects"
                  checked={newAdmin.canCreateProjects}
                  onChange={e => setNewAdmin({ ...newAdmin, canCreateProjects: e.target.checked })}
                  className="rounded border-slate-300 text-[#165BAA] focus:ring-[#165BAA]"
                />
                <label htmlFor="canCreateProjects" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Allow this administrator to create new projects
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setShowAssignAdminModal(false);
                    if (returnToModalAfterAction) setShowProjectsViewModal(true);
                  }} 
                  className="text-xs h-9"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={submitting || (isGlobalModalAction && !modalTargetCompanyId)} 
                  className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Sending Invite...' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Quick Manage Company & Workspaces Modal */}
      {showProjectsViewModal && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200 animate-fadeIn space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#165BAA] font-bold flex items-center justify-center text-sm">
                  {selectedCompany.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{selectedCompany.name}</h3>
                  <p className="text-xs text-slate-500 font-medium">Quick Summary & Management Modal</p>
                </div>
              </div>
              <button onClick={() => setShowProjectsViewModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Configured Projects */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Configured Projects ({companyProjects.length})
                </h4>
                <Button
                  size="sm"
                  onClick={() => {
                    setIsGlobalModalAction(false);
                    setReturnToModalAfterAction(true);
                    setModalTargetCompanyId(selectedCompany._id);
                    setShowProjectsViewModal(false);
                    setShowCreateProjectModal(true);
                  }}
                  disabled={!selectedCompany.isActive}
                  className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-8 px-3 gap-1 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Project
                </Button>
              </div>

              {companyProjects.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                  No projects configured yet for this company.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 bg-slate-50/50 rounded-xl border border-slate-200/80 max-h-52 overflow-y-auto">
                  {companyProjects.map(p => (
                    <div key={p._id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{p.name}</span>
                          <span className="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            {p.code}
                          </span>
                        </div>
                        {p.department && (
                          <p className="text-slate-500 text-[11px] mt-0.5">Department: {p.department}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setShowProjectsViewModal(false);
                          handleOpenProjectWorkspace(p, selectedCompany);
                        }}
                        className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-7 px-3 gap-1 font-semibold"
                      >
                        Launch
                        <ArrowUpRight className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Configured Company Administrators */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Company Administrators ({companyAdmins.length})
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsGlobalModalAction(false);
                    setReturnToModalAfterAction(true);
                    setModalTargetCompanyId(selectedCompany._id);
                    setShowProjectsViewModal(false);
                    setShowAssignAdminModal(true);
                  }}
                  className="text-xs h-8 px-3 gap-1 font-semibold border-slate-300"
                >
                  <UserPlus className="w-3.5 h-3.5 text-amber-600" />
                  Invite Admin
                </Button>
              </div>

              {companyAdmins.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                  No company administrators assigned yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 bg-slate-50/50 rounded-xl border border-slate-200/80 max-h-36 overflow-y-auto">
                  {companyAdmins.map(a => (
                    <div key={a._id} className="p-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-xs">
                          {a.userId?.name?.charAt(0) || 'A'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 leading-tight">{a.userId?.name || 'Administrator'}</p>
                          <p className="text-[11px] text-slate-500 leading-tight">{a.userId?.email}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        Active Admin
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowProjectsViewModal(false);
                  openCompanyDetailsPage(selectedCompany);
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50"
              >
                Open Full Dedicated Company Page →
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowProjectsViewModal(false)}
                className="text-xs h-9 px-4 font-semibold"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: User Details & Assigned Memberships Inspection Modal */}
      {selectedUserForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 animate-fadeIn space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-sm">
                  {selectedUserForDetails.name?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{selectedUserForDetails.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedUserForDetails.email}</p>
                </div>
              </div>
              <button onClick={() => setSelectedUserForDetails(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">System Role</span>
                  <span className="font-bold text-slate-900 uppercase">{selectedUserForDetails.role}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                  <span className={`font-bold ${selectedUserForDetails.isActive ? 'text-emerald-700' : 'text-red-700'}`}>
                    {selectedUserForDetails.isActive ? 'Active Account' : 'Deactivated'}
                  </span>
                </div>
              </div>

              {/* Company Memberships */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Company Memberships ({selectedUserForDetails.companyMemberships?.length || 0})
                </h4>
                {selectedUserForDetails.companyMemberships?.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No direct company memberships assigned.</p>
                ) : (
                  <div className="divide-y divide-slate-100 bg-slate-50 rounded-xl border border-slate-200 max-h-32 overflow-y-auto">
                    {selectedUserForDetails.companyMemberships?.map(cm => (
                      <div key={cm._id} className="p-2.5 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">{cm.companyName} ({cm.companyCode})</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase">
                          {cm.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Project Memberships */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Project Memberships ({selectedUserForDetails.projectMemberships?.length || 0})
                </h4>
                {selectedUserForDetails.projectMemberships?.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No project memberships assigned.</p>
                ) : (
                  <div className="divide-y divide-slate-100 bg-slate-50 rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
                    {selectedUserForDetails.projectMemberships?.map(pm => (
                      <div key={pm._id} className="p-2.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-slate-900">{pm.projectName} ({pm.projectCode})</p>
                          <p className="text-[11px] text-slate-500">Company: {pm.companyName || 'Assigned'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700 uppercase">
                            {pm.role}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevokeProjectMembership(pm.projectId, selectedUserForDetails._id, pm.projectName)}
                            className="h-6 text-[10px] text-red-600 hover:text-red-800 hover:bg-red-50 px-1.5"
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              {selectedUserForDetails.role !== 'super_admin' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleUserStatus(selectedUserForDetails)}
                  className={`text-xs h-8 ${selectedUserForDetails.isActive ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'}`}
                >
                  {selectedUserForDetails.isActive ? 'Deactivate Account' : 'Reactivate Account'}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedUserForDetails(null)}
                className="text-xs h-8 px-4"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Replace Company Admin Modal */}
      {showReplaceAdminModal && adminToReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Replace Company Administrator</h3>
                <p className="text-xs text-slate-500">Deactivates current administrator and assigns new admin for {adminToReplace.company.name}.</p>
              </div>
              <button onClick={() => setShowReplaceAdminModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReplaceAdminSubmit} className="space-y-4 py-4">
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-900">
                Current Admin: <strong className="font-bold">{adminToReplace.admin.userId?.name}</strong> ({adminToReplace.admin.userId?.email})
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">New Admin Full Name</Label>
                <Input
                  placeholder="e.g. Jonathan Reed"
                  value={replaceForm.name}
                  onChange={e => setReplaceForm({ ...replaceForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">New Admin Email Address *</Label>
                <Input
                  type="email"
                  placeholder="e.g. jreed@company.com"
                  value={replaceForm.email}
                  onChange={e => setReplaceForm({ ...replaceForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="repCanCreateProjects"
                  checked={replaceForm.canCreateProjects}
                  onChange={e => setReplaceForm({ ...replaceForm, canCreateProjects: e.target.checked })}
                  className="rounded border-slate-300 text-[#165BAA]"
                />
                <label htmlFor="repCanCreateProjects" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Grant project creation permissions
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setShowReplaceAdminModal(false)} className="text-xs h-9">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 font-semibold">
                  {submitting ? 'Replacing...' : 'Confirm Replacement'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: Guided Company Onboarding Modal */}
      {showOnboardingModal && onboardingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 animate-fadeIn space-y-5">
            {/* Header with Step Progress */}
            <div className="border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#165BAA] text-white text-xs font-bold flex items-center justify-center">
                    {onboardingStep}
                  </span>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Step {onboardingStep} of 4: Guided Onboarding
                  </span>
                </div>
                <button 
                  onClick={() => setShowOnboardingModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                  title="Close and finish later"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Progress Tracker */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { step: 1, label: 'Company' },
                  { step: 2, label: 'Admin' },
                  { step: 3, label: 'Project' },
                  { step: 4, label: 'Ready' }
                ].map(s => (
                  <div key={s.step} className="space-y-1">
                    <div className={`h-1.5 rounded-full transition-all ${
                      onboardingStep >= s.step ? 'bg-[#165BAA]' : 'bg-slate-200'
                    }`} />
                    <p className={`text-[10px] font-bold text-center ${
                      onboardingStep >= s.step ? 'text-[#165BAA]' : 'text-slate-400'
                    }`}>
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* STEP 1: Company Confirmation */}
            {onboardingStep === 1 && (
              <div className="space-y-4 py-2">
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900">Company Created Successfully!</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Enterprise tenant <strong className="text-slate-900 font-bold">{onboardingCompany.name}</strong> ({onboardingCompany.code}) is now active in BPER.
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2">
                  <div className="flex justify-between text-slate-600">
                    <span>Company Name:</span>
                    <strong className="text-slate-900">{onboardingCompany.name}</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Company Code:</span>
                    <span className="font-mono font-bold text-slate-900">{onboardingCompany.code}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Status:</span>
                    <span className="text-emerald-700 font-bold">Active Isolated Tenant</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowOnboardingModal(false);
                      openCompanyDetailsPage(onboardingCompany);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Skip setup & open company
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setOnboardingStep(2)}
                    className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 px-4 gap-1.5 font-bold rounded-lg shadow-sm"
                  >
                    Step 2: Invite Admin
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 2: Invite First Company Admin */}
            {onboardingStep === 2 && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!onboardingAdmin.name || !onboardingAdmin.email) {
                    setErrorMsg('Admin Name and Email are required.');
                    return;
                  }
                  setSubmitting(true);
                  try {
                    const res = await apiFetch('/invite/create', {
                      method: 'POST',
                      body: JSON.stringify({
                        name: onboardingAdmin.name,
                        email: onboardingAdmin.email,
                        role: 'company_admin',
                        companyId: onboardingCompany._id,
                        deliveryMethod: 'manual'
                      })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || 'Failed to invite admin');
                    setOnboardingAdminsCreated([...onboardingAdminsCreated, onboardingAdmin.name]);
                    setSuccessMsg(`Invitation created for ${onboardingAdmin.name}!`);
                    await fetchInitialData();
                    await fetchPlatformInvites();
                    setOnboardingStep(3);
                  } catch (err: any) {
                    setErrorMsg(err.message);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="space-y-4 py-2"
              >
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Invite Company Administrator</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Issue an onboarding invitation to manage projects and workforce for <strong className="text-slate-800">{onboardingCompany.name}</strong>.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Admin Full Name *</Label>
                    <Input
                      placeholder="e.g. Alexander Vance"
                      value={onboardingAdmin.name}
                      onChange={e => setOnboardingAdmin({ ...onboardingAdmin, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Admin Email Address *</Label>
                    <Input
                      type="email"
                      placeholder="e.g. avance@company.com"
                      value={onboardingAdmin.email}
                      onChange={e => setOnboardingAdmin({ ...onboardingAdmin, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="onbCanCreateProjects"
                      checked={onboardingAdmin.canCreateProjects}
                      onChange={e => setOnboardingAdmin({ ...onboardingAdmin, canCreateProjects: e.target.checked })}
                      className="rounded border-slate-300 text-[#165BAA]"
                    />
                    <label htmlFor="onbCanCreateProjects" className="text-xs font-medium text-slate-700 cursor-pointer">
                      Grant project creation privileges
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOnboardingStep(3)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Skip this step
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 px-4 gap-1.5 font-bold rounded-lg shadow-sm"
                  >
                    {submitting ? 'Inviting...' : 'Invite & Continue'}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            )}

            {/* STEP 3: Create First Project */}
            {onboardingStep === 3 && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!onboardingProject.name || !onboardingProject.code || !onboardingProject.department) {
                    setErrorMsg('Project Name, Code, and Department are required.');
                    return;
                  }
                  setSubmitting(true);
                  try {
                    const res = await apiFetch('/projects', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...onboardingProject,
                        companyId: onboardingCompany._id
                      })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || 'Failed to create project');
                    setOnboardingProjectsCreated([...onboardingProjectsCreated, onboardingProject.name]);
                    setSuccessMsg(`Project ${onboardingProject.name} created for ${onboardingCompany.name}!`);
                    await fetchInitialData();
                    setOnboardingStep(4);
                  } catch (err: any) {
                    setErrorMsg(err.message);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="space-y-4 py-2"
              >
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Create First Project</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Create an initial workspace for workforce data collection and analytics under <strong className="text-slate-800">{onboardingCompany.name}</strong>.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Project Name *</Label>
                    <Input
                      placeholder="e.g. Operations & Supply 2026"
                      value={onboardingProject.name}
                      onChange={e => setOnboardingProject({ ...onboardingProject, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700">Project Code *</Label>
                      <Input
                        placeholder="e.g. OPS_2026"
                        value={onboardingProject.code}
                        onChange={e => setOnboardingProject({ ...onboardingProject, code: e.target.value.toUpperCase() })}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700">Department *</Label>
                      <Input
                        placeholder="e.g. Operations"
                        value={onboardingProject.department}
                        onChange={e => setOnboardingProject({ ...onboardingProject, department: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOnboardingStep(4)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Skip this step
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 px-4 gap-1.5 font-bold rounded-lg shadow-sm"
                  >
                    {submitting ? 'Creating...' : 'Create & Review'}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            )}

            {/* STEP 4: Review & Complete */}
            {onboardingStep === 4 && (
              <div className="space-y-4 py-2">
                <div className="text-center py-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 text-[#165BAA] flex items-center justify-center mx-auto mb-2 shadow-xs">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900">Onboarding Complete!</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review configured details for <strong className="text-slate-900">{onboardingCompany.name}</strong>.
                  </p>
                </div>

                <div className="divide-y divide-slate-100 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-slate-500">Company:</span>
                    <span className="font-bold text-slate-900">{onboardingCompany.name} ({onboardingCompany.code})</span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-slate-500">Company Admins:</span>
                    <span className="font-semibold text-slate-800">
                      {onboardingAdminsCreated.length > 0 ? onboardingAdminsCreated.join(', ') : 'None assigned yet'}
                    </span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-slate-500">Configured Projects:</span>
                    <span className="font-semibold text-slate-800">
                      {onboardingProjectsCreated.length > 0 ? onboardingProjectsCreated.join(', ') : 'None created yet'}
                    </span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-slate-500">Workforce Data:</span>
                    <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Zero Baseline (Clean Slate)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOnboardingModal(false)}
                    className="text-xs h-9 px-4 font-semibold text-slate-600"
                  >
                    Done (Return to Dashboard)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setShowOnboardingModal(false);
                      openCompanyDetailsPage(onboardingCompany);
                    }}
                    className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 px-4 gap-1.5 font-bold rounded-lg shadow-sm"
                  >
                    Open Company Management
                    <ArrowUpRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 8: Invite New User Modal & Manual Link Display */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 animate-fadeIn space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {generatedInviteLink ? 'Invitation Link Generated' : 'Invite User to Platform'}
                </h3>
                <p className="text-xs text-slate-500">
                  {generatedInviteLink 
                    ? 'Share this secure single-use invitation link with the recipient.' 
                    : 'Issue a role-based invitation for company admins, managers, or employees.'}
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowInviteModal(false);
                  setGeneratedInviteLink(null);
                }} 
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {generatedInviteLink ? (
              <div className="space-y-4 py-2">
                {inviteResultOutcome?.deliveryMethod === 'email' && inviteResultOutcome.deliveryStatus === 'email_sent' ? (
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Invitation Dispatched via Email
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      An official onboarding email has been delivered to <strong>{inviteResultOutcome.email}</strong>. The secure link expires in 72 hours.
                    </p>
                  </div>
                ) : inviteResultOutcome?.deliveryMethod === 'email' && inviteResultOutcome.deliveryStatus === 'delivery_failed' ? (
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 text-xs text-amber-900 space-y-2">
                    <p className="font-bold flex items-center gap-1.5 text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Email Delivery Failed — Manual Link Generated
                    </p>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      The invitation was created, but email dispatch failed: 
                      <span className="font-mono ml-1 text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 block mt-1">
                        {inviteResultOutcome.errorMessage || 'SMTP connection failed or service offline'}
                      </span>
                    </p>
                    <p className="text-[11px] text-amber-700 font-medium">
                      Please copy the manual registration link below and share it directly with the recipient.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-800 space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-blue-900">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      Manual Invitation Link Ready
                    </p>
                    <p className="text-[11px] text-blue-700">
                      This single-use cryptographic token is valid for 72 hours. Copy the link below to share with the recipient.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">Manual Registration Link</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={generatedInviteLink}
                      className="text-xs font-mono bg-slate-50 text-slate-800 select-all"
                    />
                    <Button
                      size="sm"
                      onClick={() => copyToClipboard(generatedInviteLink, 'manual_modal')}
                      className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 px-3 gap-1 shrink-0 font-semibold"
                    >
                      {copiedInviteId === 'manual_modal' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedInviteId === 'manual_modal' ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t border-slate-100">
                  <Button
                    onClick={() => {
                      setShowInviteModal(false);
                      setGeneratedInviteLink(null);
                      setInviteResultOutcome(null);
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs h-9 px-4 font-semibold"
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateEnterpriseInvite} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Full Name *</Label>
                    <Input
                      placeholder="e.g. Sarah Jenkins"
                      value={newInvite.name}
                      onChange={e => setNewInvite({ ...newInvite, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Email Address *</Label>
                    <Input
                      type="email"
                      placeholder="e.g. sjenkins@company.com"
                      value={newInvite.email}
                      onChange={e => setNewInvite({ ...newInvite, email: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Role to Assign *</Label>
                    <select
                      value={newInvite.role}
                      onChange={e => setNewInvite({ ...newInvite, role: e.target.value })}
                      className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg bg-white font-medium focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="company_admin">Company Admin</option>
                      <option value="project_admin">Project Admin</option>
                      <option value="manager">Operations Manager</option>
                      <option value="employee">Employee / Staff</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Assign Company *</Label>
                    <select
                      value={newInvite.companyId || (companies[0]?._id || '')}
                      onChange={e => setNewInvite({ ...newInvite, companyId: e.target.value })}
                      className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg bg-white font-medium focus:ring-2 focus:ring-blue-500"
                    >
                      {companies.map(c => (
                        <option key={c._id} value={c._id}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {newInvite.role !== 'company_admin' && (
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700">Department / Operational Area</Label>
                    <Input
                      placeholder="e.g. Finance & Accounting"
                      value={newInvite.department}
                      onChange={e => setNewInvite({ ...newInvite, department: e.target.value })}
                    />
                  </div>
                )}

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-700 block">Invitation Delivery Method *</Label>
                    {!newInvite.deliveryMethod && (
                      <span className="text-[11px] text-amber-600 font-semibold">Please choose an option</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                      newInvite.deliveryMethod === 'manual' 
                        ? 'border-blue-500 bg-blue-50/50 text-blue-900 font-bold' 
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}>
                      <input
                        type="radio"
                        name="deliveryMethod"
                        checked={newInvite.deliveryMethod === 'manual'}
                        onChange={() => setNewInvite({ ...newInvite, deliveryMethod: 'manual' })}
                        className="text-blue-600"
                        required
                      />
                      <span className="text-xs">Generate Manual Link</span>
                    </label>

                    <label className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                      newInvite.deliveryMethod === 'email' 
                        ? 'border-blue-500 bg-blue-50/50 text-blue-900 font-bold' 
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}>
                      <input
                        type="radio"
                        name="deliveryMethod"
                        checked={newInvite.deliveryMethod === 'email'}
                        onChange={() => setNewInvite({ ...newInvite, deliveryMethod: 'email' })}
                        className="text-blue-600"
                        required
                      />
                      <span className="text-xs">Send Email Invitation</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowInviteModal(false)}
                    className="text-xs h-9"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="bg-[#165BAA] hover:bg-[#124a8a] text-white text-xs h-9 font-semibold"
                  >
                    {submitting ? 'Generating...' : 'Issue Invitation'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
