import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral' | 'outline';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'neutral',
  size = 'md',
  dot = false,
  children,
  ...props
}) => {
  const baseStyles = "inline-flex items-center font-medium rounded-full tracking-wide";

  const variants = {
    neutral: "bg-slate-100 text-slate-700 border border-slate-200/60",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200/70",
    warning: "bg-amber-50 text-amber-800 border border-amber-200/80",
    danger: "bg-rose-50 text-rose-700 border border-rose-200/70",
    info: "bg-blue-50 text-blue-700 border border-blue-200/70",
    purple: "bg-purple-50 text-purple-700 border border-purple-200/70",
    outline: "bg-transparent text-slate-600 border border-slate-200",
  };

  const dotColors = {
    neutral: "bg-slate-400",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    info: "bg-blue-500",
    purple: "bg-purple-500",
    outline: "bg-slate-400",
  };

  const sizes = {
    sm: "text-[11px] px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1.5",
  };

  return (
    <span className={cn(baseStyles, variants[variant], sizes[size], className)} {...props}>
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColors[variant])} />}
      {children}
    </span>
  );
};
