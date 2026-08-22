import React from 'react';
import { CheckCircle2, AlertTriangle, Zap } from 'lucide-react';
import { Card } from '../ui/Card';
import { useApp } from '../../context/AppContext';

export const AutomationFunnel: React.FC = () => {
  const { invoices } = useApp();

  const totalProcessedCount = invoices.length;
  const autoClearedCount = invoices.filter((i) => i.status === 'ready' || i.status === 'paid').length;
  const needsReviewCount = invoices.filter((i) => i.status === 'review' || i.status === 'hold' || i.status === 'on_hold').length;
  const criticalCount = invoices.filter((i) => i.status === 'critical' || i.riskLevel === 'high').length;

  const autoClearedPercent = totalProcessedCount > 0 ? Math.round((autoClearedCount / totalProcessedCount) * 100) : 0;

  return (
    <Card className="p-5 border-slate-200/90">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              Autonomous Operations Funnel
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            AI automatically validates 3-way PO matching, bank security, and math
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            {autoClearedPercent}% Auto-Resolved
          </span>
        </div>
      </div>

      {/* Pipeline steps visual */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Step 1: Received & Ingested */}
        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-medium">Total Ingested</span>
            <span className="font-mono text-slate-400">Step 1</span>
          </div>
          <div className="text-xl font-bold text-slate-900 tabular-nums">
            {totalProcessedCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Invoices read & extracted via AI
          </div>
        </div>

        {/* Step 2: Auto-Cleared */}
        <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200/80">
          <div className="flex items-center justify-between text-xs text-emerald-700 mb-1">
            <span className="font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Auto-Cleared
            </span>
            <span className="font-mono text-emerald-600 font-bold">{autoClearedPercent}%</span>
          </div>
          <div className="text-xl font-bold text-emerald-800 tabular-nums">
            {autoClearedCount}
          </div>
          <div className="text-[11px] text-emerald-700 mt-1">
            0 variance, 3-way matched & scheduled
          </div>
        </div>

        {/* Step 3: Surfaced for Review */}
        <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200/80">
          <div className="flex items-center justify-between text-xs text-amber-800 mb-1">
            <span className="font-medium flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Exceptions
            </span>
            <span className="font-mono text-amber-700">{needsReviewCount + criticalCount} Total</span>
          </div>
          <div className="text-xl font-bold text-amber-900 tabular-nums">
            {criticalCount} Critical
          </div>
          <div className="text-[11px] text-amber-700 mt-1">
            Requires human approval decision
          </div>
        </div>
      </div>
    </Card>
  );
};
