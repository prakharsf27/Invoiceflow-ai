import React from 'react';
import { TrendingUp, TrendingDown, Clock, AlertCircle, FileText, Wallet } from 'lucide-react';
import { Card } from '../ui/Card';
import { cn } from '../../lib/utils';

export interface MetricCardProps {
  title: string;
  value: string;
  subtext: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  icon?: 'wallet' | 'invoices' | 'attention' | 'overdue' | 'time';
  variant?: 'default' | 'attention' | 'overdue' | 'time';
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtext,
  trend,
  icon,
  variant = 'default',
  onClick,
}) => {
  const getIcon = () => {
    switch (icon) {
      case 'wallet':
        return <Wallet className="w-4 h-4 text-slate-600" />;
      case 'invoices':
        return <FileText className="w-4 h-4 text-slate-600" />;
      case 'attention':
        return <AlertCircle className="w-4 h-4 text-amber-600" />;
      case 'overdue':
        return <AlertCircle className="w-4 h-4 text-rose-600" />;
      case 'time':
        return <Clock className="w-4 h-4 text-brand-600" />;
      default:
        return null;
    }
  };

  const getBorderColor = () => {
    switch (variant) {
      case 'attention':
        return 'border-l-4 border-l-amber-500 hover:border-amber-300';
      case 'overdue':
        return 'border-l-4 border-l-rose-500 hover:border-rose-300';
      case 'time':
        return 'border-l-4 border-l-brand-500 hover:border-brand-300';
      default:
        return 'hover:border-slate-300';
    }
  };

  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      className={cn(
        "p-5 flex flex-col justify-between transition-all duration-150",
        getBorderColor(),
        onClick && "cursor-pointer"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        {icon && (
          <div className="p-1.5 rounded-md bg-slate-50 border border-slate-100">
            {getIcon()}
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
          {value}
        </div>

        <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center font-medium gap-0.5",
                trend.isPositive ? "text-emerald-600" : "text-rose-600"
              )}
            >
              {trend.isPositive ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {trend.value}
            </span>
          )}
          <span>{subtext}</span>
        </div>
      </div>
    </Card>
  );
};
