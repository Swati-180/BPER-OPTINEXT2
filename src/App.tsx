/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Loader2, Eye, EyeOff, ArrowRight, ShieldCheck, UserRound } from 'lucide-react';

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
import ManagerEmployee360 from './pages/manager/Employee360';

import Unauthorized from './pages/Unauthorized';
import { clearActiveUnderReviewReferenceId } from './pages/employee/bperSubmissionStorage';
import { clearAuthUser, loadAuthUser, saveAuthUser, type AppAuthUser, type PortalRole } from './lib/authStorage';

const DEMO_CREDENTIALS = {
  employee: { name: 'QG User1', email: 'employee.demo@bper.local', password: 'pass1234', role: 'employee' },
  manager: { name: 'QG User2', email: 'manager.demo@bper.local', password: 'pass1234', role: 'manager' }
};

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
  const params = useParams();
  const fixedRole = params.portal === 'employee' || params.portal === 'manager' ? params.portal : null;
  const [role, setRole] = useState<PortalRole>(fixedRole ?? 'employee');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (fixedRole) {
      setRole(fixedRole);
      const creds = fixedRole === 'employee' ? DEMO_CREDENTIALS.employee : DEMO_CREDENTIALS.manager;
      setEmail(creds.email);
      setPassword(creds.password);
    }
  }, [fixedRole]);

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

  const handleRoleChange = (value: string) => {
    setRole(value);
    const creds = value === 'employee' ? DEMO_CREDENTIALS.employee : DEMO_CREDENTIALS.manager;
    setEmail(creds.email);
    setPassword(creds.password);
    setErrors({});
    setGeneralError(null);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    if (!validate()) return;
    setIsLoading(true);

    await new Promise(resolve => setTimeout(resolve, 1500));
    const demoCreds = role === 'employee' ? DEMO_CREDENTIALS.employee : DEMO_CREDENTIALS.manager;

    if (email === demoCreds.email && password === demoCreds.password) {
      const nextUser: AppAuthUser = {
        name: demoCreds.name,
        email: demoCreds.email,
        role: demoCreds.role,
        source: 'demo',
      };

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(LOGIN_SESSION_KEY, new Date().toISOString());
      }
      if (demoCreds.role === 'employee') {
        clearActiveUnderReviewReferenceId();
      }
      saveAuthUser(nextUser);
      onLogin(nextUser);
    } else {
      setGeneralError('Invalid credentials. Please check your email and password or ensure the correct role is selected.');
    }
    setIsLoading(false);
  };

  if (!fixedRole && params.portal && params.portal !== 'employee' && params.portal !== 'manager') {
    return <Navigate to="/" replace />;
  }

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
            {fixedRole && (
              <div className="rounded-xl border border-[#D8E4F2] bg-[#F6FAFF] px-4 py-3 text-sm text-[#4A607C]">
                You selected the <span className="font-bold text-[#1A3556]">{fixedRole === 'employee' ? 'Employee' : 'Manager'}</span> portal.
              </div>
            )}
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
              {!fixedRole && (
                <div className="space-y-1.5">
                  <Label htmlFor="role" className="text-[11px] font-bold uppercase tracking-wider text-[#666666]">
                    Demo Role (Testing)
                  </Label>
                  <select
                    id="role"
                    value={role}
                    onChange={(event) => handleRoleChange(event.target.value)}
                    className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm text-[#1A3556] outline-none focus:border-[#165BAA] focus:ring-2 focus:ring-[#165BAA]/20"
                  >
                    <option value="employee">Demo Employee</option>
                    <option value="manager">Demo Manager</option>
                  </select>
                  <p className="text-[10px] text-[#94A3B8]">Use this to enter without backend API.</p>
                </div>
              )}
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
            </form>
          </CardContent>
        </Card>
        <div className="mt-6 text-center space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">
            Demo Credentials
          </p>
          <div className="flex flex-col gap-0.5 text-[10px] text-[#64748B] font-medium">
            <p>Employee: {DEMO_CREDENTIALS.employee.email} / {DEMO_CREDENTIALS.employee.password}</p>
            <p>Manager: {DEMO_CREDENTIALS.manager.email} / {DEMO_CREDENTIALS.manager.password}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
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
          element={
            user ? (
              <Navigate to={user.role === 'employee' ? '/employee/dashboard' : '/manager/dashboard'} replace />
            ) : (
              <PortalSelectionPage />
            )
          } 
        />
        <Route path="/login/:portal" element={user ? <Navigate to={user.role === 'employee' ? '/employee/dashboard' : '/manager/dashboard'} replace /> : <LoginPage onLogin={handleLogin} />} />
        <Route path="/invite-signup" element={user ? <Navigate to="/employee/dashboard" replace /> : <InviteSignupPage onLogin={handleLogin} />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* Employee Routes */}
        <Route
          path="/employee/*"
          element={
            <ProtectedRoute user={user} allowedRole="employee">
              <EmployeeLayout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="dashboard" element={<EmployeeDashboard />} />
                  <Route path="profile" element={<EmployeeProfile />} />
                  <Route path="form" element={<BPERForm />} />
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
            <ProtectedRoute user={user} allowedRole="manager">
              <ManagerLayout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="dashboard" element={<ManagerDashboard />} />
                  <Route path="users" element={<ManagerUsers />} />
                  <Route path="forms" element={<ManagerForms />} />
                  <Route path="wdt-analytics" element={<ManagerWDTAnalytics />} />
                  <Route path="6x6-analysis" element={<ManagerSixBySixAnalysis />} />
                  <Route path="employee-360" element={<ManagerEmployee360 />} />
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


