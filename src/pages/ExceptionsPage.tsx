import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import { formatFullINR } from '../lib/utils';

export const ExceptionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { invoices } = useApp();
  const [filter, setFilter] = useState<'all' | 'critical' | 'review'>('all');

  // Filter invoices that require human attention
  const activeExceptions = invoices.filter(
    (i) => i.status === 'review' || i.status === 'critical' || i.status === 'on_hold' || i.riskLevel === 'high'
  );

  const filtered = activeExceptions.filter((e) => {
    if (filter === 'critical') return e.status === 'critical' || e.riskLevel === 'high';
    if (filter === 'review') return e.status === 'review' || e.status === 'on_hold';
    return true;
  });

  const autoClearedCount = invoices.filter((i) => i.status === 'ready' || i.status === 'paid').length;
  const autoPercent = invoices.length > 0 ? ((autoClearedCount / invoices.length) * 100).toFixed(1) : '100.0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Exception Center
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Invoices requiring human attention, rate dispute resolution, or fraud prevention checks.
        </p>
      </div>

      {/* Value Statement Banner */}
      <div className="p-4 rounded-xl bg-brand-50/80 border border-brand-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold shrink-0">
            AI
          </div>
          <div>
            <span className="font-semibold text-brand-900 block text-sm">
              AI has automatically processed {autoClearedCount} invoices and surfaced {activeExceptions.length} exceptions for review.
            </span>
            <span className="text-brand-700">
              {autoPercent}% of invoice operations completed autonomously without human intervention.
            </span>
          </div>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            filter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All Exceptions ({activeExceptions.length})
        </button>
        <button
          onClick={() => setFilter('critical')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            filter === 'critical' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
          }`}
        >
          Critical ({activeExceptions.filter((e) => e.status === 'critical' || e.riskLevel === 'high').length})
        </button>
        <button
          onClick={() => setFilter('review')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            filter === 'review' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          Review Required ({activeExceptions.filter((e) => e.status === 'review' || e.status === 'on_hold').length})
        </button>
      </div>

      {/* Exceptions List */}
      {filtered.length === 0 ? (
        <Card className="p-8 text-center space-y-2 border-slate-200">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">No active exceptions in this view</h3>
          <p className="text-xs text-slate-500">All flagged invoices have been resolved and queued for payment.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((item) => (
            <Card
              key={item.id}
              hoverable
              onClick={() => navigate(`/app/invoices/${item.id}`)}
              className="p-5 border-slate-200/90 cursor-pointer space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-900 text-sm">
                    {item.supplierName}
                  </span>
                  <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    {item.invoiceNumber}
                  </span>
                  <Badge variant={item.status === 'critical' || item.riskLevel === 'high' ? 'danger' : 'warning'} size="sm" dot>
                    {(item.riskLevel || 'review').toUpperCase()}
                  </Badge>
                </div>

                <div className="text-sm font-bold text-slate-900 tabular-nums">
                  {formatFullINR(item.amount)}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  {item.aiStatus}
                </div>
                <p className="text-slate-600 pl-5">{item.aiRecommendation}</p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <span className="text-brand-700 font-medium">
                  PO Reference: {item.poNumber || 'None'}
                </span>
                <span className="font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  Inspect Invoice <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
