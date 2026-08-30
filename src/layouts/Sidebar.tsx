import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  AlertTriangle,
  FileCheck2,
  Users,
  CreditCard,
  Sparkles,
  BarChart3,
  ShieldAlert,
  Settings,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: number | string;
  badgeVariant?: 'purple' | 'amber' | 'neutral';
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { invoices, needAttentionCount } = useApp();
  const { user, isOwner } = useAuth();

  const navGroups: NavGroup[] = [
    {
      label: 'OPERATIONS',
      items: [
        { name: 'Dashboard', href: '/app', icon: LayoutDashboard },
        { name: 'Invoice Inbox', href: '/app/invoices', icon: Inbox, badge: invoices.length, badgeVariant: 'purple' },
        { name: 'Exceptions', href: '/app/exceptions', icon: AlertTriangle, badge: needAttentionCount > 0 ? needAttentionCount : undefined, badgeVariant: 'amber' },
        { name: 'PO Matching', href: '/app/po-matching', icon: FileCheck2 },
        { name: 'Suppliers', href: '/app/suppliers', icon: Users },
        { name: 'Payments', href: '/app/payments', icon: CreditCard },
      ],
    },
    {
      label: 'INTELLIGENCE',
      items: [
        { name: 'AI Copilot', href: '/app/copilot', icon: Sparkles },
        { name: 'Reports', href: '/app/reports', icon: BarChart3 },
        { name: 'Monitoring', href: '/app/monitoring', icon: ShieldAlert },
      ],
    },
    {
      label: 'SYSTEM',
      items: [
        { name: 'Settings', href: '/app/settings', icon: Settings },
      ],
    },
  ];

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 flex flex-col w-64 bg-white border-r border-slate-200/80 transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto shrink-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo and Brand */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-100">
          <NavLink to="/app" className="flex items-center gap-3 group">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-600 text-white font-bold text-sm shadow-sm group-hover:bg-brand-700 transition-colors">
              IF
            </div>
            <div>
              <span className="font-semibold text-slate-900 text-base tracking-tight flex items-center gap-1.5">
                InvoiceFlow <span className="text-[11px] font-bold px-1.5 py-0.2 text-brand-700 bg-brand-50 border border-brand-200/60 rounded">AI</span>
              </span>
            </div>
          </NavLink>

          {/* Close button for mobile */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 lg:hidden"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Workspace Context Pill */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs">🏢</span>
            <span className="text-xs font-semibold text-slate-800 truncate" title={user?.companyName}>
              {user?.companyName || 'Workspace'}
            </span>
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 uppercase tracking-wider shrink-0">
            {isOwner ? 'Owner' : 'Member'}
          </span>
        </div>

        {/* Navigation list */}
        <div className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                {group.label}
              </div>
              <nav className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      end={item.href === '/app'}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          "group flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-150",
                          isActive
                            ? "bg-brand-50/80 text-brand-700 font-semibold"
                            : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <div className="flex items-center gap-3">
                            <Icon
                              className={cn(
                                "w-4 h-4 transition-colors",
                                isActive
                                  ? "text-brand-600"
                                  : "text-slate-400 group-hover:text-slate-600"
                              )}
                            />
                            <span>{item.name}</span>
                          </div>

                          {item.badge !== undefined && (
                            <span
                              className={cn(
                                "text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums",
                                item.badgeVariant === 'purple' && "bg-brand-100 text-brand-700",
                                item.badgeVariant === 'amber' && "bg-amber-100 text-amber-800",
                                (!item.badgeVariant || item.badgeVariant === 'neutral') && "bg-slate-100 text-slate-600"
                              )}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Bottom AI Status / Environment */}
        <div className="p-4 m-3 rounded-xl bg-slate-50 border border-slate-200/70">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-slate-800">AI Engine Online</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            {invoices.filter(i => i.status === 'ready' || i.status === 'paid').length} invoices auto-cleared.
          </p>
        </div>
      </aside>
    </>
  );
};
