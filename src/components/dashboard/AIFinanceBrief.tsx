import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useApp } from '../../context/AppContext';

export const AIFinanceBrief: React.FC = () => {
  const navigate = useNavigate();
  const { invoices, needAttentionCount } = useApp();

  const attentionInvoices = invoices.filter(
    (i) => i.status === 'review' || i.status === 'critical' || i.status === 'hold' || i.status === 'on_hold' || i.riskLevel === 'high'
  );

  const topPriority = attentionInvoices[0];

  return (
    <Card className="p-5 border-slate-200/90 bg-white shadow-xs">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left / Main Summary */}
        <div className="space-y-2.5 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-900 text-white shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              AI Finance Brief
            </h2>
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
              Live Monitored
            </span>
          </div>

          {needAttentionCount === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-700 leading-relaxed max-w-3xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>All invoices in your workspace are verified and reconciled. Zero critical items require manual review.</span>
              </p>
              <div className="flex items-start sm:items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <span className="font-semibold text-slate-900 shrink-0 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Status:
                </span>
                <span className="text-slate-600 text-[11px]">
                  Upload new invoices via the Upload tab to perform automated 3-way matching and risk scanning.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-700 leading-relaxed max-w-3xl">
                You have <strong className="font-bold text-slate-900">{needAttentionCount} invoice(s) requiring attention</strong>.
                {topPriority && (
                  <>
                    {' '}Priority action required on <span className="font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">{topPriority.supplierName || topPriority.invoiceNumber}</span> ({topPriority.invoiceNumber}) totaling <strong className="text-slate-900">₹{topPriority.amount.toLocaleString('en-IN')}</strong>.
                  </>
                )}
              </p>

              {/* Recommended Action callout */}
              <div className="flex items-start sm:items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800">
                <span className="font-semibold text-slate-900 shrink-0 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                  Recommended action:
                </span>
                <span className="text-slate-600 text-[11px]">
                  {topPriority?.aiRecommendation || 'Review line items and verification checks before releasing payment.'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right CTA Actions */}
        <div className="flex sm:flex-col md:flex-row items-center gap-2.5 shrink-0 pt-2 md:pt-0">
          {needAttentionCount > 0 && topPriority ? (
            <Button
              onClick={() => navigate(`/app/invoices/${topPriority.id}`)}
              variant="primary"
              size="sm"
              className="w-full sm:w-auto font-semibold cursor-pointer gap-1"
            >
              <span>Review Priority Invoice</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              onClick={() => navigate('/app/upload')}
              variant="primary"
              size="sm"
              className="w-full sm:w-auto font-semibold cursor-pointer gap-1"
            >
              <span>Upload Invoice</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
