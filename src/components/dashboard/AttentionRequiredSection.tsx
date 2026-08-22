import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, ShieldAlert, Copy, Clock, FileDiff, CheckCircle2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatFullINR } from '../../lib/utils';
import { useApp } from '../../context/AppContext';

export const AttentionRequiredSection: React.FC = () => {
  const navigate = useNavigate();
  const { invoices } = useApp();

  // Filter central invoices for those requiring attention
  const attentionInvoices = invoices.filter(
    (i) => i.status === 'review' || i.status === 'critical' || i.status === 'on_hold' || i.riskLevel === 'high'
  );

  const getSeverityBadge = (status: string, riskLevel: string) => {
    if (status === 'critical' || riskLevel === 'high') {
      return <Badge variant="danger" size="sm" dot>HIGH PRIORITY</Badge>;
    }
    if (status === 'on_hold') {
      return <Badge variant="warning" size="sm" dot>ON HOLD</Badge>;
    }
    return <Badge variant="warning" size="sm" dot>REVIEW</Badge>;
  };

  const getIssueIcon = (aiStatus?: string) => {
    const s = aiStatus?.toLowerCase() || '';
    if (s.includes('po') || s.includes('mismatch')) return <FileDiff className="w-4 h-4 text-rose-600" />;
    if (s.includes('duplicate')) return <Copy className="w-4 h-4 text-amber-600" />;
    if (s.includes('bank')) return <ShieldAlert className="w-4 h-4 text-rose-600" />;
    if (s.includes('overdue')) return <Clock className="w-4 h-4 text-rose-600" />;
    return <AlertCircle className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            Attention Required
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 tabular-nums">
              {attentionInvoices.length}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Exceptions flagged by AI requiring human approval or clarification
          </p>
        </div>

        <button
          onClick={() => navigate('/app/exceptions')}
          className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>View all exceptions</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {attentionInvoices.length === 0 ? (
        <Card className="p-6 text-center space-y-2 border-slate-200">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900">All exceptions cleared!</h3>
          <p className="text-xs text-slate-500">Every incoming invoice is reconciled and ready for payout.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {attentionInvoices.slice(0, 4).map((item) => (
            <Card
              key={item.id}
              hoverable
              onClick={() => navigate(`/app/invoices/${item.id}`)}
              className="p-4 flex flex-col justify-between border-slate-200/90 transition-all hover:border-slate-300 cursor-pointer group"
            >
              <div>
                {/* Header: Supplier + Invoice Number + Severity Badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900 group-hover:text-brand-600 transition-colors">
                        {item.supplierName}
                      </span>
                      <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {item.invoiceNumber}
                      </span>
                    </div>
                  </div>
                  {getSeverityBadge(item.status, item.riskLevel)}
                </div>

                {/* Amount */}
                <div className="text-lg font-bold text-slate-900 tabular-nums mb-2.5">
                  {formatFullINR(item.amount)}
                </div>

                {/* Issue Description */}
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-700 mb-3">
                  <span className="shrink-0 mt-0.5">{getIssueIcon(item.aiStatus)}</span>
                  <div className="space-y-0.5">
                    <span className="font-medium text-slate-900 block">{item.aiStatus}</span>
                    <span className="text-slate-500 line-clamp-1">{item.aiRecommendation}</span>
                  </div>
                </div>
              </div>

              {/* Footer Action */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <span className="text-[11px] text-slate-400">
                  Action needed before payment
                </span>
                <span className="font-semibold text-brand-600 group-hover:text-brand-700 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                  Review <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
