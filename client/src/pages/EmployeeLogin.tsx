import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Loader2, Eye, EyeOff, Lock, UserCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { type AppAuthUser, saveAuthUser, type PortalRole } from '../lib/authStorage';
import { clearActiveUnderReviewReferenceId } from './employee/bperSubmissionStorage';
import { API_ENDPOINTS } from '../lib/config';

function Logo() {
  return (
    <div className="flex flex-col items-center mb-6">
      <div className="flex items-center gap-1">
        <div className="flex items-center font-bold text-3xl tracking-tighter">
          <span className="text-[#F27D26]">Q</span>
          <span className="text-[#165BAA]">G</span>
          <span className="ml-1 text-[#F27D26]">Quintes</span>
          <span className="text-[#165BAA]">Global</span>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-[10px] italic font-serif text-[#333333]">
          Empowering Employees <span className="text-[#F27D26] not-italic mx-0.5">|</span> Shaping Excellence
        </span>
      </div>
    </div>
  );
}

interface EmployeeLoginProps {
  onLogin: (user: AppAuthUser) => void;
}

export default function EmployeeLoginPage({ onLogin }: EmployeeLoginProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please enter both your work email and password.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_ENDPOINTS.AUTH}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed');
      }

      // Check if user is actually an employee or has access
      const role = data.user.role as PortalRole;
      
      if (role === 'manager' || role === 'admin') {
        throw new Error('Access denied. Managers must use the main administrative portal.');
      }

      const nextUser: AppAuthUser = {
        name: data.user.name,
        email: data.user.email,
        role: role,
        organization: data.user.organization || '',
        source: 'normal',
      };

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('bper.auth.token', data.token);
      }
      
      if (role === 'employee') {
        clearActiveUnderReviewReferenceId();
      }
      
      saveAuthUser(nextUser);
      onLogin(nextUser);
      
      // Navigate to employee dashboard
      navigate('/employee/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Invalid credentials. Please verify your details.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
            <Link to="/auth/login" className="inline-flex items-center text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase tracking-widest gap-2 mb-4">
                <ArrowLeft size={14} /> Back to Portal Selection
            </Link>
            <Logo />
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Employee Login</h1>
            <p className="text-slate-500 mt-2">Access your productivity dashboard and form submissions.</p>
        </div>

        <Card className="border-none shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] rounded-2xl overflow-hidden">
          <CardContent className="p-8">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6"
                >
                  <Alert variant="destructive" className="py-3 border-none bg-red-50 text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs font-medium ml-2">
                      {error}
                    </AlertDescription>
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Work Email
                </Label>
                <div className="relative">
                  <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 bg-slate-50 border-slate-200 pl-10 focus:ring-blue-500/10 focus:border-blue-500 transition-all rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" title="Password" className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 bg-slate-50 border-slate-200 pl-10 pr-10 focus:ring-blue-500/10 focus:border-blue-500 transition-all rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full h-12 text-sm font-bold bg-[#165BAA] hover:bg-[#124a8a] text-white shadow-lg shadow-blue-900/10 transition-all duration-200 active:scale-[0.98] rounded-xl mt-4"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Login to Employee Portal'
                )}
              </Button>

              <div className="pt-4 text-center">
                <p className="text-sm text-slate-500">
                    New Employee?{' '}
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter block mt-1">
                        Contact your manager for an invite link.
                    </span>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
