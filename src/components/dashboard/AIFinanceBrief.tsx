import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Bot, ShieldCheck, CheckCircle2 } from 'lucide-react';
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
    <Card className="relative overflow-hidden border-brand-200/90 bg-gradient-to-br from-white via-brand-50/20 to-purple-50/40 p-6 shadow-sm">
      {/* Decorative subtle background element */}
      <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-brand-200/20 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left / Main Summary */}
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand-600 text-white shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              AI Finance Brief
            </h2>
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-100/80 text-brand-700 border border-brand-200 uppercase">
              LIVE MONITORED
            </span>
          </div>

          {needAttentionCount === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700 leading-relaxed max-w-3xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>All invoices in your company workspace are currently clear and fully verified. Zero critical items require manual review.</span>
              </p>
              <div className="flex items-start sm:items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white/90 border border-emerald-200/70 text-xs text-slate-800 shadow-xs">
                <span className="font-semibold text-emerald-700 shrink-0 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Status:
                </span>
                <span className="text-slate-600">
                  Upload new invoices via the Upload tab to perform automated 3-way matching and risk scanning.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-700 leading-relaxed max-w-3xl">
                You have <strong className="font-semibold text-slate-900">{needAttentionCount} invoice(s) requiring attention</strong>.
                {topPriority && (
                  <>
                    {' '}Highest priority item: <span className="font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200/60">{topPriority.supplierName || topPriority.invoiceNumber}</span> ({topPriority.invoiceNumber}) totaling <strong className="text-slate-900">₹{topPriority.amount.toLocaleString('en-IN')}</strong>.
                  </>
                )}
              </p>

              {/* Recommended Action callout */}
              <div className="flex items-start sm:items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white/90 border border-brand-200/70 text-xs text-slate-800 shadow-xs">
                <span className="font-semibold text-brand-700 shrink-0 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-brand-600" />
                  Recommended action:
                </span>
                <span className="text-slate-600">
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
              variant="brand"
              size="sm"
              className="w-full sm:w-auto font-medium cursor-pointer"
            >
              <span>Review Priority Invoice</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={() => navigate('/app/upload')}
              variant="brand"
              size="sm"
              className="w-full sm:w-auto font-medium cursor-pointer"
            >
              <span>Upload Invoice</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}

          <Button
            onClick={() => navigate('/app/copilot')}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto bg-white/90 hover:bg-slate-50 border-slate-200 text-slate-700 font-medium cursor-pointer"
          >
            <Bot className="w-3.5 h-3.5 text-brand-600" />
            <span>Ask Copilot</span>
          </Button>
        </div>
      </div>
    </Card>
  );
};
