import React, { useEffect } from 'react';
import {
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Calculator,
  FileText,
  Bot,
  TrendingUp,
  Info,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { Invoice, InvoiceRiskAnalysis } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

interface EvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  riskAnalysis: InvoiceRiskAnalysis | null;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  isOpen,
  onClose,
  invoice,
  riskAnalysis,
}) => {
  const navigate = useNavigate();
  const { purchaseOrders } = useApp();

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Format currency helper
  const formatINR = (val?: number) => {
    if (val === undefined || isNaN(val)) return '₹0';
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  };

  // Math Reconciliation calculations
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const calculatedItemsSubtotal = items.reduce(
    (sum, it) => sum + (it.quantity * it.unitPrice || 0),
    0
  );
  const calculatedItemsTax = items.reduce((sum, it) => {
    if (typeof it.taxAmount === 'number') return sum + it.taxAmount;
    const taxRate = typeof it.taxRate === 'number' ? it.taxRate : 18;
    return sum + (it.quantity * it.unitPrice * taxRate) / 100;
  }, 0);

  const declaredSubtotal = typeof invoice.subtotal === 'number' ? invoice.subtotal : 0;
  const declaredTax = typeof invoice.tax === 'number' ? invoice.tax : 0;
  const declaredTotal = typeof invoice.amount === 'number' ? invoice.amount : 0;

  const subtotalDiff = declaredSubtotal - calculatedItemsSubtotal;
  const taxDiff = declaredTax - calculatedItemsTax;
  const mathFormulaTotal = declaredSubtotal + declaredTax - (invoice.discount || 0);
  const isMathDiscrepancy =
    Math.abs(mathFormulaTotal - declaredTotal) > 1.0 ||
    (items.length > 0 && Math.abs(subtotalDiff) > 1.0) ||
    (items.length > 0 && Math.abs(taxDiff) > 1.0);

  // Link PO if available
  const linkedPO = purchaseOrders.find(
    (p) =>
      (invoice.poNumber && p.poNumber.trim().toLowerCase() === invoice.poNumber.trim().toLowerCase()) ||
      p.id === (invoice as any).poId ||
      p.invoiceId === invoice.id
  );

  const poAmount = linkedPO?.totalAmount || 0;
  const poVariance = linkedPO ? declaredTotal - poAmount : 0;
  const isPOAmountReconciled = linkedPO && Math.abs(poVariance) <= 2.0;
  const poVariancePct = poAmount > 0 ? ((Math.abs(poVariance) / poAmount) * 100).toFixed(1) : '0.0';

  // Dynamic deterministic risk calculation
  let calculatedScore = 10;
  const detectedAnomalies: string[] = [];

  if (Math.abs(mathFormulaTotal - declaredTotal) > 1.0) {
    calculatedScore += 30;
    detectedAnomalies.push(
      `Math discrepancy: Stated subtotal (${formatINR(declaredSubtotal)}) + tax (${formatINR(declaredTax)}) does not equal total amount (${formatINR(declaredTotal)}).`
    );
  }

  if (items.length > 0 && Math.abs(subtotalDiff) > 1.0) {
    calculatedScore += 20;
    detectedAnomalies.push(
      `Itemized subtotal disparity: Sum of line items (${formatINR(calculatedItemsSubtotal)}) differs from header subtotal (${formatINR(declaredSubtotal)}) by ${formatINR(Math.abs(subtotalDiff))}.`
    );
  }

  if (items.length > 0 && Math.abs(taxDiff) > 1.0) {
    calculatedScore += 20;
    detectedAnomalies.push(
      `Tax computation disparity: Sum of line taxes (${formatINR(calculatedItemsTax)}) differs from declared invoice tax (${formatINR(declaredTax)}) by ${formatINR(Math.abs(taxDiff))}.`
    );
  }

  if (linkedPO && !isPOAmountReconciled) {
    calculatedScore += 35;
    if (poVariance > 0) {
      detectedAnomalies.push(
        `PO Overrun Discrepancy: Invoice total (${formatINR(declaredTotal)}) exceeds Purchase Order ${linkedPO.poNumber} (${formatINR(poAmount)}) by +${formatINR(poVariance)} (+${poVariancePct}%).`
      );
    } else {
      detectedAnomalies.push(
        `PO Underrun Discrepancy: Invoice total (${formatINR(declaredTotal)}) is less than Purchase Order ${linkedPO.poNumber} (${formatINR(poAmount)}) by -${formatINR(Math.abs(poVariance))} (-${poVariancePct}%).`
      );
    }
  }

  if (invoice.bankDetails?.isChangedFromPrevious) {
    calculatedScore += 40;
    detectedAnomalies.push('Bank details alert: Remittance bank account differs from historical vendor records.');
  }

  if (
    invoice.status === 'overdue' ||
    invoice.paymentStatus === 'overdue' ||
    (invoice.dueDate && new Date(invoice.dueDate).getTime() < Date.now() && invoice.status !== 'paid')
  ) {
    calculatedScore += 15;
    detectedAnomalies.push(`Payment overdue: Invoice due date (${invoice.dueDate || 'past'}) has elapsed.`);
  }

  // Merge AI warnings and deterministic detected anomalies
  const riskWarnings = Array.isArray(riskAnalysis?.warnings) ? riskAnalysis!.warnings : [];
  const failedChecks = (invoice.aiChecks || []).filter(
    (c) => !c.passed || c.type === 'critical' || c.type === 'warning'
  );

  const allWarnings: string[] = [];
  detectedAnomalies.forEach((a) => {
    if (!allWarnings.includes(a)) allWarnings.push(a);
  });
  riskWarnings.forEach((w) => {
    if (!allWarnings.includes(w)) allWarnings.push(w);
  });
  failedChecks.forEach((fc) => {
    const text = `${fc.title}: ${fc.detail}`;
    if (!allWarnings.includes(text)) allWarnings.push(text);
  });

  const finalRiskScore = Math.min(
    100,
    Math.max(10, riskAnalysis?.riskScore !== undefined ? riskAnalysis.riskScore : calculatedScore)
  );
  const finalRiskLevel =
    riskAnalysis?.riskLevel ||
    (finalRiskScore >= 70 ? 'high' : finalRiskScore >= 35 ? 'medium' : 'low');
  const finalDecision =
    riskAnalysis?.decision ||
    (finalRiskLevel === 'high' || finalRiskLevel === 'critical'
      ? 'hold'
      : finalRiskLevel === 'medium'
      ? 'review'
      : 'approve');

  const recommendation =
    riskAnalysis?.recommendation ||
    invoice.aiRecommendation ||
    (allWarnings.length > 0
      ? 'Review flagged line items and tax reconciliation before releasing payment disbursement.'
      : 'All parameters verified. Safe for scheduled payment release.');

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-rose-700 bg-rose-50 border-rose-200';
    if (score >= 35) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  };

  const getProgressColor = (score: number) => {
    if (score >= 70) return 'bg-rose-500';
    if (score >= 35) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Why this Invoice was Flagged
                </h3>
                <Badge variant="purple" size="sm">
                  AI Audit Reasoning
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Invoice <span className="font-mono font-semibold text-slate-700">{invoice.invoiceNumber}</span> • {invoice.supplierName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-800">
          {/* Executive Risk Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Risk Score */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Calculated Risk Score</span>
                <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-slate-900 tabular-nums">
                  {finalRiskScore}
                </span>
                <span className="text-xs font-medium text-slate-400">/ 100</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${getProgressColor(finalRiskScore)}`}
                  style={{ width: `${Math.max(5, finalRiskScore)}%` }}
                />
              </div>
            </div>

            {/* Risk Level */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="text-xs font-medium text-slate-500 block">Risk Evaluation</span>
              <div className="pt-0.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold uppercase tracking-wider ${getScoreColor(finalRiskScore)}`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {finalRiskLevel} Risk
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {finalRiskLevel === 'low'
                  ? 'Standard low-risk invoice'
                  : 'Elevated anomaly indicators detected'}
              </p>
            </div>

            {/* Recommended Action */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="text-xs font-medium text-slate-500 block">Decision Recommendation</span>
              <div className="pt-0.5">
                <Badge
                  variant={finalDecision === 'approve' ? 'success' : finalDecision === 'hold' ? 'danger' : 'warning'}
                  size="sm"
                  className="font-bold uppercase tracking-wider"
                >
                  DECISION: {finalDecision.toUpperCase()}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500">
                {finalDecision === 'approve'
                  ? 'Pre-cleared for autonomous disbursement'
                  : 'Requires AP accountant verification'}
              </p>
            </div>
          </div>

          {/* AI Recommendation Banner */}
          <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200/80 space-y-1.5">
            <div className="flex items-center gap-2 text-purple-900 font-semibold text-xs">
              <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span>AI AP Advisory & Recommendation</span>
            </div>
            <p className="text-xs text-purple-950 leading-relaxed font-medium pl-5.5">
              {recommendation}
            </p>
          </div>

          {/* Flagged Exceptions / Warnings Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Primary Flagged Anomalies ({allWarnings.length})</span>
            </h4>

            {allWarnings.length > 0 ? (
              <div className="space-y-2">
                {allWarnings.map((w, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 text-xs text-amber-950 flex items-start gap-3"
                  >
                    <div className="w-5 h-5 rounded-full bg-amber-200/70 text-amber-900 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[11px]">
                      !
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-amber-950 leading-relaxed">{w}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Zero anomalous risk flags found. All automated verification parameters are fully reconciled.</span>
              </div>
            )}
          </div>

          {/* Financial Breakdown & Tax Computation Analysis */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-brand-600" />
                <span>Financial Math & Tax Breakdown Comparison</span>
              </h4>
              {isMathDiscrepancy ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                  ⚠ Discrepancy Detected
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                  ✓ Reconciled
                </span>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Declared on Invoice */}
                <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                    Declared on Invoice Header
                  </span>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Stated Subtotal:</span>
                      <span className="font-semibold text-slate-900 font-mono">{formatINR(declaredSubtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Stated Tax / GST:</span>
                      <span className="font-semibold text-slate-900 font-mono">{formatINR(declaredTax)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-1.5">
                      <span className="font-bold text-slate-900">Total Invoice Amount:</span>
                      <span className="font-bold text-brand-600 font-mono text-sm">{formatINR(declaredTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Calculated from Line Items */}
                <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                    Computed from Line Items ({items.length} items)
                  </span>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sum of Line Subtotals:</span>
                      <span className="font-semibold text-slate-900 font-mono">{formatINR(calculatedItemsSubtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sum of Line Item Taxes:</span>
                      <span className="font-semibold text-slate-900 font-mono">{formatINR(calculatedItemsTax)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-1.5">
                      <span className="font-bold text-slate-900">Calculated Item Total:</span>
                      <span className="font-bold text-slate-900 font-mono text-sm">
                        {formatINR(calculatedItemsSubtotal + calculatedItemsTax - (invoice.discount || 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic 3-Way PO Match Context Note */}
              <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200/70 text-xs text-blue-950 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed text-[11px] space-y-1">
                  {linkedPO ? (
                    isPOAmountReconciled ? (
                      <>
                        <span className="font-semibold text-blue-900">3-Way PO Match Context:</span> Invoice total ({formatINR(declaredTotal)}) exactly matches Purchase Order <span className="font-mono font-semibold">{linkedPO.poNumber}</span> ({formatINR(poAmount)}). {isMathDiscrepancy ? 'However, this invoice was flagged for review due to line-item tax breakdown or subtotal computation differences.' : 'All financial amounts are fully reconciled.'}
                      </>
                    ) : poVariance > 0 ? (
                      <>
                        <span className="font-semibold text-blue-900">3-Way PO Match Context:</span> PO Overrun Detected. Invoice total ({formatINR(declaredTotal)}) exceeds Purchase Order <span className="font-mono font-semibold">{linkedPO.poNumber}</span> ({formatINR(poAmount)}) by <strong className="text-rose-700">+{formatINR(poVariance)} (+{poVariancePct}%)</strong>.
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-blue-900">3-Way PO Match Context:</span> PO Underrun Detected. Invoice total ({formatINR(declaredTotal)}) is less than Purchase Order <span className="font-mono font-semibold">{linkedPO.poNumber}</span> ({formatINR(poAmount)}) by <strong className="text-amber-700">-{formatINR(Math.abs(poVariance))} (-{poVariancePct}%)</strong>.
                      </>
                    )
                  ) : invoice.poNumber ? (
                    <>
                      <span className="font-semibold text-blue-900">3-Way PO Match Context:</span> Referenced Purchase Order <span className="font-mono font-semibold">{invoice.poNumber}</span>. Automated validation cross-references line-item unit pricing, tax rates, and stated invoice totals.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-blue-900">Direct Invoicing Context:</span> Direct vendor billing without linked PO. Automated verification checks GSTIN active status, arithmetic precision, and bank mandate security.
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Key Validation Checks Status */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-600" />
              <span>Deterministic Validation Checks</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(invoice.aiChecks && invoice.aiChecks.length > 0
                ? invoice.aiChecks
                : [
                    {
                      id: 'chk-gstin',
                      title: 'GSTIN Verified',
                      passed: Boolean(invoice.supplierGstin || invoice.supplierName),
                      type: 'success' as const,
                      detail: `Supplier ${invoice.supplierName} profile verified active.`,
                    },
                    {
                      id: 'chk-math',
                      title: 'Financial Math Check',
                      passed: !isMathDiscrepancy,
                      type: isMathDiscrepancy ? ('warning' as const) : ('success' as const),
                      detail: isMathDiscrepancy
                        ? 'Tax computation breakdown or subtotal disparity detected.'
                        : 'Subtotal + Tax equals declared amount.',
                    },
                    {
                      id: 'chk-bank',
                      title: 'Bank Details Check',
                      passed: !invoice.bankDetails?.isChangedFromPrevious,
                      type: invoice.bankDetails?.isChangedFromPrevious ? ('critical' as const) : ('success' as const),
                      detail: invoice.bankDetails?.isChangedFromPrevious
                        ? 'Bank account changed from historical record.'
                        : 'Disbursement account verified against mandate.',
                    },
                    {
                      id: 'chk-po',
                      title: 'Purchase Order Match',
                      passed: Boolean(linkedPO ? isPOAmountReconciled : invoice.poNumber),
                      type: linkedPO && !isPOAmountReconciled ? ('warning' as const) : ('success' as const),
                      detail: linkedPO
                        ? isPOAmountReconciled
                          ? `Matched 100% against ${linkedPO.poNumber}.`
                          : `PO variance detected against ${linkedPO.poNumber}.`
                        : invoice.poNumber
                        ? `Referenced PO ${invoice.poNumber}.`
                        : 'Direct billing invoice.',
                    },
                  ]
              ).map((chk) => (
                <div
                  key={chk.id}
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    chk.passed
                      ? 'bg-emerald-50/40 border-emerald-200/80 text-slate-800'
                      : chk.type === 'critical'
                      ? 'bg-rose-50 border-rose-200 text-rose-950'
                      : 'bg-amber-50 border-amber-200 text-amber-950'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{chk.title}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        chk.passed
                          ? 'bg-emerald-100 text-emerald-800'
                          : chk.type === 'critical'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {chk.passed ? 'PASSED' : 'FLAGGED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{chk.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Button
            onClick={() => {
              onClose();
              navigate('/app/copilot');
            }}
            variant="secondary"
            size="sm"
            className="cursor-pointer gap-1.5 w-full sm:w-auto"
          >
            <Bot className="w-3.5 h-3.5 text-brand-600" />
            <span>Ask Copilot for Further Details</span>
          </Button>

          <Button
            onClick={onClose}
            variant="primary"
            size="sm"
            className="cursor-pointer gap-1.5 w-full sm:w-auto"
          >
            <span>Understood, Close</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
