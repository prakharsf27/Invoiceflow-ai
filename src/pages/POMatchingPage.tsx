import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import { FileCheck2, ArrowRight } from 'lucide-react';

export const POMatchingPage: React.FC = () => {
  const navigate = useNavigate();
  const { purchaseOrders, invoices, acceptPOVariance, requestPOClarification, refreshData } = useApp();
  const [tab, setTab] = useState<'all' | 'mismatch' | 'matched'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  React.useEffect(() => {
    refreshData();
  }, [refreshData]);

  const filteredPOs = purchaseOrders.filter((po) => {
    if (tab === 'mismatch') return po.matchStatus === 'mismatch';
    if (tab === 'matched') return po.matchStatus === 'matched';
    return true;
  });

  const handleAcceptVariance = async (poNumber: string, invoiceId?: string) => {
    try {
      setActionLoading(`accept-${poNumber}`);
      await acceptPOVariance(poNumber, invoiceId);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestClarification = async (poNumber: string, invoiceId?: string) => {
    try {
      setActionLoading(`clarify-${poNumber}`);
      await requestPOClarification(poNumber, invoiceId);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Purchase Order Matching
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated 3-way reconciliation between POs, vendor invoices, and delivery receipts.
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200/80 text-xs self-start sm:self-auto">
          <button
            onClick={() => setTab('all')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
              tab === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All POs ({purchaseOrders.length})
          </button>
          <button
            onClick={() => setTab('mismatch')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
              tab === 'mismatch' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mismatched ({purchaseOrders.filter((p) => p.matchStatus === 'mismatch').length})
          </button>
          <button
            onClick={() => setTab('matched')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
              tab === 'matched' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Matched ({purchaseOrders.filter((p) => p.matchStatus === 'matched').length})
          </button>
        </div>
      </div>

      {/* PO List or Empty State */}
      {filteredPOs.length === 0 ? (
        <Card className="p-12 text-center space-y-4 border-dashed border-slate-300">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <FileCheck2 className="w-6 h-6 text-slate-500" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-base font-bold text-slate-900">No Purchase Orders Found</h3>
            <p className="text-xs text-slate-500">
              Upload invoices with PO references to perform automated 3-way matching with your procurement records.
            </p>
          </div>
          <Button onClick={() => navigate('/app/upload')} variant="brand" size="sm" className="cursor-pointer">
            Upload Invoice with PO
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredPOs.map((po) => {
            const linkedInvoice = invoices.find(
              (i) => (i.poNumber && i.poNumber.trim().toLowerCase() === po.poNumber.trim().toLowerCase()) || i.id === po.invoiceId
            );
            const hasLinkedInvoice = Boolean(linkedInvoice);
            const poAmount = typeof po.totalAmount === 'number' && !isNaN(po.totalAmount) ? po.totalAmount : 0;
            const invAmount = hasLinkedInvoice && typeof linkedInvoice!.amount === 'number' && !isNaN(linkedInvoice!.amount)
              ? linkedInvoice!.amount
              : 0;

            const variance = hasLinkedInvoice ? invAmount - poAmount : 0;
            const isAmountReconciled = hasLinkedInvoice && Math.abs(variance) <= 2.0;
            const isExplicitVarianceAccepted = Boolean((po as any).varianceAccepted);
            const isClarificationRequested = Boolean((po as any).clarificationRequested);

            const isMatched = isExplicitVarianceAccepted || (hasLinkedInvoice && isAmountReconciled && !isClarificationRequested) || po.matchStatus === 'matched' || po.status === 'matched';
            const isVarianceAccepted = isExplicitVarianceAccepted || (isMatched && !isAmountReconciled);
            const isMismatch = !isMatched && (isClarificationRequested || (hasLinkedInvoice && !isAmountReconciled) || po.matchStatus === 'mismatch' || po.status === 'mismatch');

            // Safe variance label calculation (Never produces NaN or Infinity)
            let varianceLabel = 'No Linked Invoice';
            let varianceClass = 'text-slate-500';
            let cardBgClass = 'bg-slate-50 border-slate-200';

            if (!hasLinkedInvoice) {
              varianceLabel = 'Pending Invoice';
              varianceClass = 'text-slate-500';
              cardBgClass = 'bg-slate-50 border-slate-200';
            } else if (isVarianceAccepted) {
              varianceLabel = 'Variance Accepted (100% Reconciled)';
              varianceClass = 'text-emerald-600';
              cardBgClass = 'bg-emerald-50/70 border-emerald-200';
            } else if (isAmountReconciled) {
              varianceLabel = '100% Match (0% Variance)';
              varianceClass = 'text-emerald-600';
              cardBgClass = 'bg-emerald-50/70 border-emerald-200';
            } else if (poAmount > 0) {
              const pct = ((Math.abs(variance) / poAmount) * 100).toFixed(1);
              if (variance > 0) {
                varianceLabel = `+${pct}% Overrun`;
                varianceClass = 'text-rose-600';
                cardBgClass = 'bg-rose-50/70 border-rose-200';
              } else {
                varianceLabel = `-${pct}% Underrun`;
                varianceClass = 'text-amber-600';
                cardBgClass = 'bg-amber-50/70 border-amber-200';
              }
            } else {
              varianceLabel = variance > 0 ? `+₹${variance.toLocaleString('en-IN')}` : `₹0`;
              varianceClass = 'text-rose-600';
              cardBgClass = 'bg-rose-50/70 border-rose-200';
            }

            return (
              <Card key={po.id || po.poNumber} className="p-6 border-slate-200/90 space-y-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">
                        {po.supplierName || 'Vendor'} Reconciliation
                      </h2>
                      {isVarianceAccepted ? (
                        <Badge variant="success" size="sm" dot>VARIANCE ACCEPTED</Badge>
                      ) : isMatched ? (
                        <Badge variant="success" size="sm" dot>100% PO MATCHED</Badge>
                      ) : isMismatch ? (
                        <Badge variant="danger" size="sm" dot>PO MISMATCH DETECTED</Badge>
                      ) : po.matchStatus === 'partial_match' ? (
                        <Badge variant="warning" size="sm" dot>PARTIAL PO MATCH</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm" dot>PENDING INVOICE</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Comparing Purchase Order <span className="font-mono font-semibold text-slate-700">{po.poNumber}</span>
                      {linkedInvoice ? (
                        <> with Invoice <span className="font-mono font-semibold text-slate-700">{linkedInvoice.invoiceNumber}</span></>
                      ) : (
                        <span className="text-slate-400"> (No linked vendor invoice uploaded yet)</span>
                      )}
                    </p>
                  </div>

                  {isMismatch && (
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => {
                          const poKey = po.poNumber || po.id;
                          const invKey = linkedInvoice?.id || (linkedInvoice as any)?._id || linkedInvoice?.invoiceNumber;
                          handleAcceptVariance(poKey, invKey);
                        }}
                        disabled={actionLoading === `accept-${po.poNumber || po.id}`}
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                      >
                        {actionLoading === `accept-${po.poNumber || po.id}` ? 'Accepting...' : 'Accept Variance'}
                      </Button>
                      <Button
                        onClick={() => {
                          const poKey = po.poNumber || po.id;
                          const invKey = linkedInvoice?.id || (linkedInvoice as any)?._id || linkedInvoice?.invoiceNumber;
                          handleRequestClarification(poKey, invKey);
                        }}
                        disabled={actionLoading === `clarify-${po.poNumber || po.id}`}
                        variant="brand"
                        size="sm"
                        className="cursor-pointer"
                      >
                        {actionLoading === `clarify-${po.poNumber || po.id}` ? 'Requesting...' : 'Request Clarification'}
                      </Button>
                    </div>
                  )}
                </div>

                {/* 3-Box Comparison Header */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                      Approved Purchase Order
                    </span>
                    <div className="text-sm font-mono text-slate-600 font-semibold mb-1">{po.poNumber}</div>
                    <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
                      ₹{poAmount.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-200/70">
                    <span className="text-xs font-semibold uppercase tracking-wider text-purple-700 block mb-1">
                      Billed Vendor Invoice
                    </span>
                    <div className="text-sm font-mono text-purple-900 font-semibold mb-1">
                      {linkedInvoice?.invoiceNumber || 'No Linked Invoice'}
                    </div>
                    <div className="text-2xl font-extrabold text-purple-950 tabular-nums">
                      {hasLinkedInvoice ? `₹${invAmount.toLocaleString('en-IN')}` : '—'}
                    </div>
                  </div>

                  <div className={`p-4 rounded-xl border ${cardBgClass}`}>
                    <span className="text-xs font-semibold uppercase tracking-wider block mb-1 text-slate-700">
                      Variance / Discrepancy
                    </span>
                    <div className={`text-sm font-semibold mb-1 ${varianceClass}`}>
                      {varianceLabel}
                    </div>
                    <div className="text-2xl font-extrabold tabular-nums text-slate-900">
                      {!hasLinkedInvoice
                        ? '—'
                        : isAmountReconciled
                        ? '₹0'
                        : (variance >= 0 ? `+₹${variance.toLocaleString('en-IN')}` : `-₹${Math.abs(variance).toLocaleString('en-IN')}`)}
                    </div>
                  </div>
                </div>

                {/* Items list if available */}
                {po.items && po.items.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Line Item Verification
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-y border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Item Description</th>
                            <th className="py-2.5 px-3 text-center">Qty</th>
                            <th className="py-2.5 px-3 text-right">Unit Price</th>
                            <th className="py-2.5 px-3 text-right">Total Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {po.items.map((item, idx) => (
                            <tr key={item.id || `po-item-${idx}`}>
                              <td className="py-3 px-3 font-medium text-slate-900">{item.description}</td>
                              <td className="py-3 px-3 text-center">{item.quantity}</td>
                              <td className="py-3 px-3 text-right tabular-nums">₹{(item.unitPrice || 0).toLocaleString('en-IN')}</td>
                              <td className="py-3 px-3 text-right tabular-nums font-semibold">₹{(item.total || 0).toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {linkedInvoice && (
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={() => navigate(`/app/invoices/${linkedInvoice.id}`)}
                      variant="outline"
                      size="sm"
                      className="cursor-pointer text-xs"
                    >
                      <span>View Linked Invoice Details</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
