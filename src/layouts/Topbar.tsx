import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Sparkles, Bell, Menu, CheckCircle2, AlertTriangle, ShieldAlert, LogOut, Building, UserCheck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

interface TopbarProps {
  onOpenMobileMenu: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onOpenMobileMenu }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, markNotificationRead, markAllNotificationsRead } = useApp();
  const { user, logout } = useAuth();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPageContext = () => {
    const path = location.pathname;
    if (path === '/app' || path === '/app/dashboard') return { title: 'Dashboard', subtitle: 'Overview & daily actions' };
    if (path.startsWith('/app/invoices/')) return { title: 'Invoice Details', subtitle: 'Detailed verification & line items' };
    if (path === '/app/invoices') return { title: 'Invoice Inbox', subtitle: 'AI-processed invoice stream' };
    if (path === '/app/upload') return { title: 'Upload Invoice', subtitle: 'Drag & drop automated processing' };
    if (path === '/app/exceptions') return { title: 'Exceptions', subtitle: 'Invoices requiring human review' };
    if (path === '/app/po-matching') return { title: 'PO Matching', subtitle: 'Purchase order reconciliation' };
    if (path.startsWith('/app/suppliers/')) return { title: 'Supplier Profile', subtitle: 'Risk & payment timeline' };
    if (path === '/app/suppliers') return { title: 'Suppliers', subtitle: 'Vendor directory & bank security' };
    if (path === '/app/payments') return { title: 'Payments', subtitle: 'Scheduled & upcoming payables' };
    if (path === '/app/copilot') return { title: 'AI Copilot', subtitle: 'Finance query assistant' };
    if (path === '/app/reports') return { title: 'Reports & Analytics', subtitle: 'Automation & spend insights' };
    if (path === '/app/monitoring') return { title: 'Supplier Monitoring', subtitle: 'Bank & compliance alerts' };
    if (path === '/app/settings') return { title: 'Settings', subtitle: 'System & team preferences' };
    return { title: 'InvoiceFlow AI', subtitle: 'Operations' };
  };

  const context = getPageContext();

  const formatRole = (role?: string) => {
    if (role === 'owner' || role === 'finance_admin') return 'Workspace Owner';
    if (role === 'accountant') return 'Senior Accountant';
    if (role === 'reviewer') return 'Invoice Reviewer';
    return 'Team Member';
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'P';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
      {/* Left: Mobile Toggle & Page Context */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 lg:hidden cursor-pointer"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-base font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            {context.title}
          </h1>
          <p className="hidden text-xs text-slate-500 sm:block">
            {context.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Quick Actions, AI Copilot Pill, Notifications, Profile */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Upload Invoice Button */}
        <Button
          onClick={() => navigate('/app/upload')}
          size="sm"
          variant="primary"
          className="hidden sm:inline-flex shadow-sm bg-slate-900 hover:bg-slate-800 text-white font-medium cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Invoice</span>
        </Button>

        {/* AI Copilot Button */}
        <button
          onClick={() => navigate('/app/copilot')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-50 border border-brand-200/80 text-brand-700 hover:bg-brand-100/70 hover:border-brand-300 transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-brand-600 animate-pulse" />
          <span>Copilot</span>
        </button>

        <div className="h-5 w-px bg-slate-200 mx-0.5 hidden sm:block" />

        {/* Interactive Notifications Panel */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-slate-500 rounded-lg hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title={`${unreadCount} notifications`}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl border border-slate-200 shadow-dropdown z-50 overflow-hidden text-left">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllNotificationsRead}
                    className="text-[11px] font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs">No notifications</div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        markNotificationRead(item.id);
                        if (item.invoiceId) {
                          navigate(`/app/invoices/${item.invoiceId}`);
                        } else {
                          navigate('/app/exceptions');
                        }
                        setShowNotifications(false);
                      }}
                      className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 ${
                        !item.read ? 'bg-brand-50/30' : ''
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {item.type === 'critical' ? (
                          <ShieldAlert className="w-4 h-4 text-rose-600" />
                        ) : item.type === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold ${!item.read ? 'text-slate-900' : 'text-slate-700'}`}>
                            {item.title}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">{item.time}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-normal line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
                <button
                  onClick={() => {
                    navigate('/app/exceptions');
                    setShowNotifications(false);
                  }}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
                >
                  View Exception Center →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Authenticated User Profile & Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 pl-1.5 py-1 pr-2 rounded-lg hover:bg-slate-100/80 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-600 to-indigo-500 text-white flex items-center justify-center font-bold text-xs shadow-sm ring-2 ring-white">
              {initial}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-slate-900 leading-tight">
                {user?.name || 'Prakhar'}
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
                {formatRole(user?.role)}
              </div>
            </div>
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl border border-slate-200 shadow-dropdown z-50 overflow-hidden text-left divide-y divide-slate-100">
              <div className="p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {user?.name || 'Prakhar'}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-brand-100 text-brand-800">
                    {user?.role || 'admin'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {user?.email || 'demo@invoiceflow.ai'}
                </p>
                <div className="pt-1.5 flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
                  <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{user?.companyName || 'Acme Enterprises'}</span>
                </div>
              </div>

              <div className="p-1.5">
                <button
                  onClick={() => {
                    navigate('/app/settings');
                    setShowProfileMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>Account & Company Settings</span>
                </button>
              </div>

              <div className="p-1.5">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-600" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
