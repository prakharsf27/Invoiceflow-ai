import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';

export const MonitoringPage: React.FC = () => {
  const navigate = useNavigate();
  const { invoices, refreshData } = useApp();

  React.useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Find risk & security flagged invoices
  const flaggedInvoices = invoices.filter(
    (i) => i.riskLevel === 'high' || i.status === 'critical' || i.bankDetails?.isChangedFromPrevious
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Supplier Security & Risk Monitoring
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Real-time compliance monitoring, bank mandate changes, duplicate detection, and payment fraud alerts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {flaggedInvoices.length === 0 ? (
          <Card className="p-8 text-center space-y-2 border-slate-200">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="text-base font-bold text-slate-900">Zero active security alerts</h3>
            <p className="text-xs text-slate-500">All registered supplier mandates and bank details are verified clean.</p>
          </Card>
        ) : (
          flaggedInvoices.map((inv) => (
            <Card key={inv.id} className="p-5 border-rose-200 bg-rose-50/20 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{inv.supplierName}</span>
                      <Badge variant={inv.riskLevel === 'high' ? 'danger' : 'warning'} size="sm">
                        {inv.aiStatus?.toUpperCase() || 'RISK ALERT'}
                      </Badge>
                    </div>
                    <span className="text-xs text-slate-500">{inv.invoiceNumber} • PO: {inv.poNumber || 'None'}</span>
                  </div>
                </div>

                <Button
                  onClick={() => navigate(`/app/invoices/${inv.id}`)}
                  variant="danger"
                  size="sm"
                  className="cursor-pointer"
                >
                  <span>Inspect Evidence</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white border border-slate-200 rounded-lg text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block">Bank Account:</span>
                  <span className="font-semibold text-slate-700">{inv.bankDetails.accountNumber} ({inv.bankDetails.bankName.split(',')[0]})</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Invoice Total:</span>
                  <span className="font-bold text-rose-600">₹{(inv.amount / 100000).toFixed(2)}L</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 pl-1">{inv.aiRecommendation}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
