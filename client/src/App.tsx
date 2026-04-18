/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, type FormEvent } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

// Layouts & Components
import EmployeeLayout from './layouts/EmployeeLayout';
import ManagerLayout from './layouts/ManagerLayout';
import ProtectedRoute from './components/ProtectedRoute';
import PortalSelectionPage from './pages/PortalSelection';
import InviteSignupPage from './pages/InviteSignup';

// Pages
import EmployeeDashboard from './pages/employee/Dashboard';
import EmployeeProfile from './pages/employee/Profile';
import BPERForm from './pages/employee/BPERForm';
import FormStatus from './pages/employee/FormStatus';

import ManagerDashboard from './pages/manager/Dashboard';
import ManagerUsers from './pages/manager/Users';
import ManagerForms from './pages/manager/Forms';
import ManagerWDTAnalytics from './pages/manager/WDTAnalytics';
import ManagerSixBySixAnalysis from './pages/manager/SixBySixAnalysis';
import DeepAnalysis from './pages/manager/DeepAnalysis';
import ProcessManagementPage from './pages/manager/ProcessManagementPage';
import TaxonomyManagement from './pages/manager/TaxonomyManagement';
import AuditLogs from './pages/manager/AuditLogs';
import PersonalProfile from './pages/manager/PersonalProfile';

import Unauthorized from './pages/Unauthorized';
import { clearActiveUnderReviewReferenceId } from './pages/employee/bperSubmissionStorage';
import { clearAuthUser, loadAuthUser, saveAuthUser, type AppAuthUser, type PortalRole } from './lib/authStorage';

const LOGIN_SESSION_KEY = 'bper.session.loginAt';

function Logo() {
  return (
    <div className="flex flex-col items-center mb-4 md:mb-6">
      <div className="flex items-center gap-1">
        <div className="flex items-center font-bold text-3xl md:text-4xl tracking-tighter">
          <span className="text-[#F27D26]">Q</span>
          <span className="text-[#165BAA]">G</span>
          <span className="ml-1 text-[#F27D26]">Quintes</span>
          <span className="text-[#165BAA]">Global</span>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-[10px] md:text-[12px] italic font-serif text-[#333333]">
          Co-Creating Value <span className="text-[#F27D26] not-italic mx-0.5">|</span> Simplifying Tomorrow
        </span>
      </div>
    </div>
  );
}

interface FormErrors {
  email?: string;
  password?: string;
}

function LoginPage({ onLogin }: { onLogin: (user: AppAuthUser) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!email) {
      newErrors.email = 'Work email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid work email address';
    }
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters long';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    if (!validate()) return;
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      const nextUser: AppAuthUser = {
        name: data.user.name,
        email: data.user.email,
        role: data.user.role as PortalRole,
        organization: data.user.organization || '',
        source: 'normal',
      };

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(LOGIN_SESSION_KEY, new Date().toISOString());
        window.localStorage.setItem('bper.auth.token', data.token);
      }
      
      if (nextUser.role === 'employee') {
        clearActiveUnderReviewReferenceId();
      }
      
      saveAuthUser(nextUser);
      onLogin(nextUser);
      navigate(nextUser.role === 'employee' ? '/employee-portal' : '/choose-portal', { replace: true });
    } catch (err: any) {
      setGeneralError(err.message || 'Invalid credentials. Please check your email and password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#165BAA]/5 p-4 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-105 flex flex-col items-center"
      >
        <Logo />
        <Card className="w-full border-none shadow-xl bg-card rounded-xl overflow-hidden">
          <CardHeader className="space-y-1 pb-4 pt-6 px-8">
            <div className="text-[11px] font-bold text-[#165BAA] uppercase tracking-wider mb-1">
              BPER Platform
            </div>
            <CardTitle className="text-3xl font-bold text-[#1A1A1A]">Sign In</CardTitle>
            <CardDescription className="text-sm text-[#666666]">
              Institutional access to BPER to start your session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-8 pb-6">
            <AnimatePresence mode="wait">
              {generalError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Alert variant="destructive" className="py-2 px-3 border-none bg-destructive/10 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs ml-2">
                      {generalError}
                    </AlertDescription>
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[11px] font-bold uppercase tracking-wider text-[#666666]">
                  Work Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors(prev => ({ ...prev, email: undefined }));
                  }}
                  className={`h-11 bg-[#F8FAFC] border-[#E2E8F0] focus:ring-[#165BAA]/20 transition-colors ${errors.email ? 'border-destructive ring-destructive/20' : ''}`}
                />
                {errors.email && (
                  <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {errors.email}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" title="Password" className="text-[11px] font-bold uppercase tracking-wider text-[#666666]">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors(prev => ({ ...prev, password: undefined }));
                    }}
                    className={`h-11 bg-[#F8FAFC] border-[#E2E8F0] pr-10 focus:ring-[#165BAA]/20 transition-colors ${errors.password ? 'border-destructive ring-destructive/20' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {errors.password}
                  </p>
                )}
              </div>
              <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full h-12 text-base font-bold bg-[#165BAA] hover:bg-[#124a8a] shadow-lg transition-all duration-200 active:scale-[0.98] rounded-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>

              <p className="text-center text-sm text-[#7A7A7A]">
                Don&apos;t Have An Account?{' '}
                <Link to="/auth/signup" className="font-semibold text-[#3C45C6] hover:underline">
                  Register Now.
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function ManagerChoosePortalRoute({ user }: { user: AppAuthUser | null }) {
  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (user.role !== 'manager' && user.role !== 'admin') {
    return <Navigate to="/employee-portal" replace />;
  }

  return <PortalSelectionPage />;
}

export default function App() {
  const [user, setUser] = useState<AppAuthUser | null>(() => loadAuthUser());

  const handleLogin = (userData: AppAuthUser) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(LOGIN_SESSION_KEY, new Date().toISOString());
    }
    if (userData.role === 'employee') {
      clearActiveUnderReviewReferenceId();
    }
    saveAuthUser(userData);
    setUser(userData);
  };

  const handleLogout = () => {
    clearAuthUser();
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(LOGIN_SESSION_KEY);
    }
    setUser(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route 
          path="/" 
          element={<Navigate to="/auth/login" replace />} 
        />
        <Route 
          path="/auth/login" 
          element={<LoginPage onLogin={handleLogin} />} 
        />
        <Route path="/auth/signup" element={<InviteSignupPage onLogin={handleLogin} />} />
        <Route path="/choose-portal" element={<ManagerChoosePortalRoute user={user} />} />
        <Route
          path="/employee-portal"
          element={
            user ? (
              user.role === 'employee' || user.role === 'manager'
                ? <Navigate to="/employee/dashboard" replace />
                : <Navigate to="/auth/login" replace />
            ) : (
              <Navigate to="/auth/login" replace />
            )
          }
        />
        <Route
          path="/manager-portal"
          element={
            user ? (
              user.role === 'manager' || user.role === 'admin' ? <Navigate to="/manager/dashboard" replace /> : <Navigate to="/employee-portal" replace />
            ) : (
              <Navigate to="/auth/login" replace />
            )
          }
        />
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* Employee Routes */}
        <Route
          path="/employee/*"
          element={
            <ProtectedRoute user={user} allowedRoles={["employee", "manager", "admin"]}>
              <EmployeeLayout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="dashboard" element={<EmployeeDashboard />} />
                  <Route path="profile" element={<EmployeeProfile />} />
                  <Route path="form" element={<BPERForm />} />
                  <Route path="form/:refId" element={<BPERForm />} />
                  <Route path="status" element={<FormStatus />} />
                  <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Routes>
              </EmployeeLayout>
            </ProtectedRoute>
          }
        />

        {/* Manager Routes */}
        <Route
          path="/manager/*"
          element={
            <ProtectedRoute user={user} allowedRoles={["manager", "admin"]}>
              <ManagerLayout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="dashboard" element={<ManagerDashboard />} />
                  <Route path="users" element={<ManagerUsers />} />
                  <Route path="forms" element={<ManagerForms />} />
                  <Route path="wdt-analytics" element={<ManagerWDTAnalytics />} />
                  <Route path="6x6-analysis" element={<ManagerSixBySixAnalysis />} />
                  <Route path="deep-analysis" element={<DeepAnalysis />} />
                                    <Route path="process-management" element={<ProcessManagementPage />} />
                  <Route path="taxonomy" element={<TaxonomyManagement />} />
                  <Route path="audit-logs" element={<AuditLogs />} />
                  <Route path="my-profile" element={<PersonalProfile />} />
                  <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Routes>
              </ManagerLayout>
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}


