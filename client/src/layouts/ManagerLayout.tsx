import { ReactNode, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  BarChart3, 
  Grid3X3, 
  LogOut, 
  Menu, 
  Bell, 
  MessagesSquare,
  UserCircle,
  Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';
import { labelTransition, sidebarTransition, sidebarVariants } from './sidebarConfig';
import { topbarBadgeClass, topbarIconButtonClass } from './topbarConfig';

interface ManagerLayoutProps {
  children: ReactNode;
  user: {
    name: string;
    role: string;
    email: string;
  };
  onLogout: () => void;
}

export default function ManagerLayout({ children, user, onLogout }: ManagerLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  const navItems = [
    { name: 'Dashboard', path: '/manager/dashboard', icon: LayoutDashboard },
    { name: 'Users', path: '/manager/users', icon: Users },
    { name: 'Forms', path: '/manager/forms', icon: FileText },
    { name: 'WDT Analytics', path: '/manager/wdt-analytics', icon: BarChart3 },
    { name: '6x6 Analysis', path: '/manager/6x6-analysis', icon: Grid3X3 },
    { name: 'Deep Analysis', path: '/manager/deep-analysis', icon: Briefcase },
  ];

  const isSidebarExpanded = isSidebarOpen || isSidebarHovered;

  const currentPageName = useMemo(() => {
    const activeItem = navItems.find((item) => item.path === location.pathname);
    if (activeItem) return activeItem.name;

    if (location.pathname.startsWith('/manager/')) {
      const slug = location.pathname.replace('/manager/', '');
      if (!slug) return 'Dashboard';
      return slug
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }

    return 'Dashboard';
  }, [location.pathname, navItems]);

  return (
    <div className="flex h-screen bg-[#165BAA]/5 overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={isSidebarExpanded ? 'open' : 'closed'}
        variants={sidebarVariants}
        transition={sidebarTransition}
        className="bg-[#001529] text-white flex flex-col shadow-xl z-20 relative border-r border-white/10"
        onMouseEnter={() => {
          if (!isSidebarOpen) setIsSidebarHovered(true);
        }}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        {/* Sidebar Header - Logo */}
        <div className="h-18 flex items-center px-5 border-b border-white/5 shrink-0 overflow-hidden">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <motion.div
              transition={sidebarTransition}
              className="w-12 h-12 rounded-full bg-[#0F243A] shadow-[0_6px_16px_rgba(0,0,0,0.35)] flex items-center justify-center shrink-0"
            >
              <span className="text-[17px] font-bold tracking-tight text-[#4D89C9]">QG</span>
            </motion.div>
            <motion.span
              animate={{
                opacity: isSidebarExpanded ? 1 : 0,
                x: isSidebarExpanded ? 0 : -8,
                maxWidth: isSidebarExpanded ? 165 : 0,
                marginLeft: isSidebarExpanded ? 0 : -4,
              }}
              transition={labelTransition}
              className="font-medium text-[15px] tracking-tight text-white/90 overflow-hidden whitespace-nowrap"
            >
              Quintes Global
            </motion.span>
          </div>
        </div>

        {/* User Profile Section */}
        <div 
          className="p-4 border-b border-white/5 shrink-0 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => navigate('/manager/my-profile')}
        >
          <div className="flex items-center gap-3">
            <motion.div
              transition={sidebarTransition}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/10"
            >
              <UserCircle className="w-6 h-6 text-white/60" />
            </motion.div>
            <motion.div
              animate={{
                opacity: isSidebarExpanded ? 1 : 0,
                x: isSidebarExpanded ? 0 : -8,
                maxWidth: isSidebarExpanded ? 150 : 0,
              }}
              transition={labelTransition}
              className="overflow-hidden whitespace-nowrap"
            >
              <p className="text-sm font-semibold truncate text-white/90">{user.name}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Manager</p>
            </motion.div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto custom-scrollbar overflow-x-hidden">
          <ul className="space-y-2 px-3">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <motion.button
                    type="button"
                    onClick={() => {
                      if (isActive) return;
                      navigate(item.path);
                    }}
                    whileHover={{ x: isSidebarOpen ? 2 : 0 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                    className={`flex items-center w-full h-12 gap-3 px-4 rounded-md group relative overflow-hidden transition-colors ${
                      isActive 
                        ? 'bg-[#165BAA] text-white shadow-lg' 
                        : 'text-white/65 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <motion.span
                      animate={{ scale: 1 }}
                      transition={sidebarTransition}
                      className="flex items-center justify-center shrink-0"
                    >
                      <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-white/40 group-hover:text-white'}`} />
                    </motion.span>
                    <motion.span
                      animate={{
                        opacity: isSidebarExpanded ? 1 : 0,
                        x: isSidebarExpanded ? 0 : -8,
                        maxWidth: isSidebarExpanded ? 150 : 0,
                      }}
                      transition={labelTransition}
                      className="text-sm font-medium whitespace-nowrap overflow-hidden"
                    >
                      {item.name}
                    </motion.span>
                  </motion.button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sidebar Footer - Logout */}
        <div className="p-3 border-t border-white/5 shrink-0">
          <motion.button
            onClick={onLogout}
            className="flex items-center w-full h-12 gap-3 px-4 rounded-md transition-colors duration-200 group text-white/65 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="w-5 h-5 shrink-0 text-white/40 group-hover:text-white" />
            <motion.span
              animate={{
                opacity: isSidebarExpanded ? 1 : 0,
                x: isSidebarExpanded ? 0 : -8,
                maxWidth: isSidebarExpanded ? 150 : 0,
              }}
              transition={labelTransition}
              className="text-sm font-medium whitespace-nowrap overflow-hidden"
            >
              Logout
            </motion.span>
          </motion.button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm border-b border-gray-100">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="text-gray-500 hover:bg-gray-100"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="hidden md:block">
              <nav className="flex items-center text-xs font-medium text-gray-400 uppercase tracking-widest">
                <span className="hover:text-[#165BAA] cursor-pointer transition-colors">BPER</span>
                <span className="mx-2">/</span>
                <span className="text-gray-900">Manager Portal</span>
              </nav>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className={topbarIconButtonClass}>
              <MessagesSquare className="w-4.5 h-4.5" />
              <span className={topbarBadgeClass}>0</span>
            </Button>
            <Button variant="ghost" size="icon" className={`${topbarIconButtonClass} ml-1`}>
              <Bell className="w-4.5 h-4.5" />
              <span className={topbarBadgeClass}>0</span>
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto min-h-full flex flex-col">
            <div className="mb-4 md:mb-5">
              <div className="flex items-center gap-2.5 text-[11px] md:text-xs font-bold uppercase tracking-[0.18em]">
                <span className="text-[#1E5EAB]">Overview</span>
                <span className="text-[#AFB8C5]">/</span>
                <span className="text-[#9AA4B2]">{currentPageName}</span>
              </div>
            </div>

            <div className="flex-1">{children}</div>

            <footer className="mt-10 pt-6 border-t border-slate-200/70 text-center">
              <p className="text-xs font-bold tracking-[0.16em] uppercase text-slate-400">
                Business Process and Efforts Review &copy; 2026
              </p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
