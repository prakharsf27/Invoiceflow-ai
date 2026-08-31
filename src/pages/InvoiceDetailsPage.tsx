import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  Building2,
  FileText,
  ShieldAlert,
  Check,
  PauseCircle,
  Bot,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { StatusBadge } from '../components/common/StatusBadge';
import { EvidenceModal } from '../components/common/EvidenceModal';
import { useApp } from '../context/AppContext';
import { formatFullINR } from '../lib/utils';
import { aiService } from '../services/dataServices';
import type { InvoiceRiskAnalysis } from '../types';

export const InvoiceDetailsPage: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { invoices, approveInvoice, holdInvoice, refreshData, showToast } = useApp();

  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [riskAnalysis, setRiskAnalysis] = useState<InvoiceRiskAnalysis | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<{
    model?: string;
    analyzedAt?: string;
    cached?: boolean;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<'approve' | 'hold' | null>(null);

  // Find invoice in central state
  const invoice = invoices.find(
    (i) => i.id === invoiceId || i.invoiceNumber.toLowerCase() === invoiceId?.toLowerCase()
  );

  // Canonical state determinations
  const isApproved = Boolean(invoice && (invoice.status === 'approved' || invoice.status === 'paid'));
  const isOnHold = Boolean(invoice && (invoice.status === 'hold' || invoice.status === 'on_hold'));

  const handleApprove = async () => {
    if (!invoice || actionLoading !== null || isApproved) return;
    const targetId = invoice.id || (invoice as any)._id || invoice.invoiceNumber;
    setActionLoading('approve');
    try {
      await approveInvoice(targetId);
    } finally {
      setActionLoading(null);
    }
  };

  const handleHold = async () => {
    if (!invoice || actionLoading !== null || isApproved || isOnHold) return;
    const targetId = invoice.id || (invoice as any)._id || invoice.invoiceNumber;
    setActionLoading('hold');
    try {
      await holdInvoice(targetId);
    } finally {
      setActionLoading(null);
    }
  };

  // Load already-generated AI results from company records without making any network AI call on page mount
  useEffect(() => {
    if (invoice) {
      if (invoice.aiAnalysis && invoice.aiAnalysis.result) {
        setRiskAnalysis(invoice.aiAnalysis.result);
        setAnalysisMeta({
          model: 'InvoiceFlow AI Engine',
          analyzedAt: invoice.aiAnalysis.analyzedAt,
          cached: true,
        });
      } else if (invoice.riskAnalysis) {
        setRiskAnalysis(invoice.riskAnalysis);
        setAnalysisMeta({
          model: 'InvoiceFlow AI Engine',
          analyzedAt: invoice.riskAnalysis.analyzedAt,
          cached: true,
        });
      } else {
        setRiskAnalysis(null);
        setAnalysisMeta(null);
      }
    }
  }, [invoice?.id, invoice?.aiAnalysis, invoice?.riskAnalysis]);

  const handleRunRiskAnalysis = async (force = false) => {
    if (!invoice) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await aiService.analyzeInvoiceRisk(invoice.id, { forceReanalyze: force });
      if (res && res.analysis) {
        setRiskAnalysis(res.analysis);
        setAnalysisMeta({
          model: 'InvoiceFlow AI Engine',
          analyzedAt: res.analyzedAt || new Date().toISOString(),
          cached: res.cached ?? false,
        });
        showToast(
          res.cached
            ? 'Using existing cached AI analysis.'
            : 'AI risk analysis completed successfully.',
          'success'
        );
      }
      await refreshData();
    } catch (err: any) {
      console.error('Failed to analyze invoice risk:', err);
      const errMsg = err?.message || 'AI risk analysis could not be completed. Please try again.';
      setAnalysisError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!invoice) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Invoice Not Found</h2>
        <p className="text-xs text-slate-500">The invoice you are looking for does not exist or has been removed.</p>
        <Button onClick={() => navigate('/app/invoices')} variant="outline" size="sm" className="cursor-pointer">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Invoices
        </Button>
      </div>
    );
  }

  const getRiskScoreColor = (score: number) => {
    if (score <= 30) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score <= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
  };

  const getRiskProgressBarColor = (score: number) => {
    if (score <= 30) return 'bg-emerald-500';
    if (score <= 60) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getDecisionBadge = (decision: string) => {
    if (decision === 'approve') {
      return <Badge variant="success" size="sm" className="font-bold uppercase tracking-wider">Decision: APPROVE</Badge>;
    }
    if (decision === 'hold') {
      return <Badge variant="danger" size="sm" className="font-bold uppercase tracking-wider">Decision: HOLD</Badge>;
    }
    return <Badge variant="warning" size="sm" className="font-bold uppercase tracking-wider">Decision: REVIEW</Badge>;
  };

  const formatAnalyzedTime = (isoString?: string) => {
    if (!isoString) return 'Previously saved in company records';
    try {
      const date = new Date(isoString);
      const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin === 1) return '1 minute ago';
      if (diffMin < 60) return `${diffMin} minutes ago`;
      const diffHours = Math.round(diffMin / 60);
      if (diffHours === 1) return '1 hour ago';
      if (diffHours < 24) return `${diffHours} hours ago`;
      return date.toLocaleString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return 'Completed';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top navigation back bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/app/invoices')}
          className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Invoices
        </button>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowEvidenceModal(true)}
            variant="purpleLight"
            size="sm"
            className="cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Why this was flagged?</span>
          </Button>
        </div>
      </div>

      {/* Main Header Banner */}
      <Card className="p-6 bg-white border-slate-200/90 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-bold text-slate-900">
                {invoice.invoiceNumber}
              </span>
              <StatusBadge type="invoice" value={invoice.status} />
              <StatusBadge type="risk" value={invoice.riskLevel} />
            </div>
            <p className="text-sm font-medium text-slate-600">
              {invoice.supplierName} • PO: {invoice.poNumber || 'None'}
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-500 block">Total Amount</span>
            <span className="text-2xl md:text-3xl font-extrabold text-slate-900 tabular-nums">
              {formatFullINR(invoice.amount)}
            </span>
          </div>
        </div>
      </Card>

      {/* AI Risk Analysis Dedicated Card */}
      <Card className="p-6 bg-white border-slate-200/90 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  AI Risk Analysis
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase tracking-wide">
                  AI Risk Engine
                </span>
                {analysisMeta?.cached && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 flex items-center gap-1">
                    <CheckCircle className="w-2.5 h-2.5 text-emerald-600" />
                    Cached Result
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>
                  {analysisMeta?.analyzedAt
                    ? `AI analysis completed ${formatAnalyzedTime(analysisMeta.analyzedAt)}`
                    : 'Deep AP risk evaluation across vendor catalog, 3-way PO matching, and bank details'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {riskAnalysis ? (
              <Button
                onClick={() => handleRunRiskAnalysis(true)}
                disabled={isAnalyzing}
                variant="outline"
                size="sm"
                className="cursor-pointer gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isAnalyzing ? 'animate-spin' : ''}`} />
                <span>{isAnalyzing ? 'Analyzing...' : 'Re-analyze with AI'}</span>
              </Button>
            ) : (
              <Button
                onClick={() => handleRunRiskAnalysis(false)}
                disabled={isAnalyzing}
                variant="primary"
                size="sm"
                className="cursor-pointer gap-1.5"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                <span>{isAnalyzing ? 'Analyzing...' : 'Run AI Risk Analysis'}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Loading State */}
        {isAnalyzing && (
          <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center">
            <Loader2 className="w-7 h-7 text-brand-600 animate-spin" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-900">
                AI Risk Engine is executing AP risk analysis...
              </p>
              <p className="text-[11px] text-slate-500">
                Reconciling line items, evaluating vendor historical signals, and calculating risk score
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {analysisError && !isAnalyzing && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-red-900">Risk Analysis Unavailable: </span>
                <span>{analysisError}</span>
              </div>
            </div>
            <Button
              onClick={() => handleRunRiskAnalysis(true)}
              variant="outline"
              size="sm"
              className="shrink-0 text-red-800 border-red-300 hover:bg-red-100 cursor-pointer"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Not yet analyzed Callout */}
        {!riskAnalysis && !isAnalyzing && !analysisError && (
          <div className="p-6 rounded-xl bg-slate-50 border border-slate-200/80 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h4 className="text-xs font-bold text-slate-900">AI Risk Analysis on Demand</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Deterministic invoice checks are already verified below. Click below to run AI AP risk reasoning.
              </p>
            </div>
            <Button
              onClick={() => handleRunRiskAnalysis(false)}
              variant="primary"
              size="sm"
              className="cursor-pointer gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Run AI Risk Analysis</span>
            </Button>
          </div>
        )}

        {/* Loaded Risk Analysis Content */}
        {riskAnalysis && !isAnalyzing && (
          <div className="space-y-5">
            {/* Top Score & Decision Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Score Box */}
              <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium">Risk Score</span>
                  <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-slate-900 tabular-nums">
                    {riskAnalysis.riskScore}
                  </span>
                  <span className="text-xs font-medium text-slate-400">/ 100</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${getRiskProgressBarColor(riskAnalysis.riskScore)}`}
                    style={{ width: `${Math.max(5, riskAnalysis.riskScore)}%` }}
                  />
                </div>
              </div>

              {/* Risk Level Box */}
              <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-2">
                <span className="text-xs font-medium text-slate-500 block">Risk Level</span>
                <div className="pt-1">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider ${getRiskScoreColor(riskAnalysis.riskScore)}`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {riskAnalysis.riskLevel} Risk
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {riskAnalysis.riskLevel === 'low' ? 'Standard low-risk invoice' : 'Elevated risk parameters identified'}
                </p>
              </div>

              {/* Decision Box */}
              <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-2">
                <span className="text-xs font-medium text-slate-500 block">Recommended Action</span>
                <div className="pt-1">
                  {getDecisionBadge(riskAnalysis.decision)}
                </div>
                <p className="text-[11px] text-slate-500">
                  {riskAnalysis.decision === 'approve'
                    ? 'Safe for autonomous payment release'
                    : 'Requires manual verification prior to payment'}
                </p>
              </div>
            </div>

            {/* Reasons & Warnings 2-Column Split */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Positive Reasons */}
              <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wide">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Key Validation Factors
                </h4>
                {riskAnalysis.reasons && riskAnalysis.reasons.length > 0 ? (
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {riskAnalysis.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold text-xs mt-0.5">✓</span>
                        <span className="leading-relaxed">{r}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 italic">No specific positive factors reported.</p>
                )}
              </div>

              {/* Risk Warnings */}
              <div className="p-4 rounded-xl bg-white border border-slate-200/90 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wide">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Flagged Exceptions & Warnings
                </h4>
                {riskAnalysis.warnings && riskAnalysis.warnings.length > 0 ? (
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {riskAnalysis.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold text-xs mt-0.5">⚠</span>
                        <span className="leading-relaxed text-amber-900">{w}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Zero anomalous flags or exceptions detected.</span>
                  </p>
                )}
              </div>
            </div>

            {/* AI Executive Recommendation */}
            <div className="p-4 rounded-xl bg-brand-50/50 border border-brand-200/80 space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-brand-600" /> AI Risk Recommendation
              </span>
              <p className="text-xs font-medium text-slate-800 leading-relaxed">
                {riskAnalysis.recommendation}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Action CTA Bar */}
      <Card className="p-4 bg-white border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          Status:{' '}
          <span className={`font-semibold uppercase ${isApproved ? 'text-emerald-700' : isOnHold ? 'text-amber-700' : 'text-slate-900'}`}>
            {isApproved ? 'APPROVED' : isOnHold ? 'ON HOLD' : invoice.status.toUpperCase()}
          </span>{' '}
          • Payment:{' '}
          <span className="font-semibold text-slate-900 uppercase">{invoice.paymentStatus}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isApproved ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Approved & Verified</span>
            </div>
          ) : (
            <>
              <Button
                onClick={handleApprove}
                disabled={actionLoading !== null}
                variant="primary"
                size="sm"
                className="cursor-pointer gap-1.5"
              >
                {actionLoading === 'approve' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Approving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve Invoice</span>
                  </>
                )}
              </Button>

              {!isOnHold && (
                <Button
                  onClick={handleHold}
                  disabled={actionLoading !== null}
                  variant="outline"
                  size="sm"
                  className="cursor-pointer gap-1.5"
                >
                  {actionLoading === 'hold' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Putting on Hold...</span>
                    </>
                  ) : (
                    <>
                      <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Place on Hold</span>
                    </>
                  )}
                </Button>
              )}
            </>
          )}

          <Button
            onClick={() => navigate('/app/copilot')}
            variant="secondary"
            size="sm"
            className="cursor-pointer gap-1.5"
          >
            <Bot className="w-3.5 h-3.5 text-brand-600" />
            <span>Ask Copilot</span>
          </Button>
        </div>
      </Card>

      {/* Two Column Layout: Left Details + Right AI Checks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Metadata & Items */}
        <div className="lg:col-span-2 space-y-6">
          {/* Metadata Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 space-y-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Document Overview
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Invoice Date</span>
                  <span className="font-medium text-slate-900">{invoice.invoiceDate || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Payment Due Date</span>
                  <span className="font-medium text-slate-900">{invoice.dueDate || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Payment Terms</span>
                  <span className="font-medium text-slate-900">{invoice.paymentTerms || '—'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Purchase Order</span>
                  <span className="font-mono font-medium text-brand-700">{invoice.poNumber || 'None'}</span>
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Supplier Details
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">GSTIN</span>
                  <span className="font-mono font-medium text-slate-900">{invoice.supplierGstin || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Email</span>
                  <span className="font-medium text-slate-900">{invoice.supplierEmail || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Phone</span>
                  <span className="font-medium text-slate-900">{invoice.supplierPhone || '—'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Bank Account</span>
                  <span className={`font-mono text-[11px] ${invoice.bankDetails?.isChangedFromPrevious ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>
                    {invoice.bankDetails?.accountNumber ? `${invoice.bankDetails.accountNumber} (${invoice.bankDetails.bankName?.split(',')[0] || 'Bank'})` : '—'}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Line Items Table */}
          <Card className="p-5 space-y-4">
            <h4 className="text-xs font-semibold text-slate-900 tracking-tight">
              Line Items & Quantities
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-400 font-semibold">
                  <tr>
                    <th className="pb-2.5">Description</th>
                    <th className="pb-2.5 text-center">Qty</th>
                    <th className="pb-2.5 text-right">Unit Price</th>
                    <th className="pb-2.5 text-right">Tax Rate</th>
                    <th className="pb-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {invoice.items && invoice.items.length > 0 ? (
                    invoice.items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 pr-2">
                          <span className="font-medium text-slate-900 block">{item.description}</span>
                          {item.poItemMatched === false && (
                            <span className="text-[10px] text-rose-600 font-semibold bg-rose-50 px-1.5 py-0.5 rounded inline-block mt-0.5">
                              ⚠ Rate differs from PO
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-center tabular-nums">{item.quantity}</td>
                        <td className="py-3 text-right tabular-nums">{formatFullINR(item.unitPrice)}</td>
                        <td className="py-3 text-right tabular-nums">{item.taxRate}% ({formatFullINR(item.taxAmount)})</td>
                        <td className="py-3 text-right font-bold text-slate-900 tabular-nums">{formatFullINR(item.total)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-slate-400">No line items itemized.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <div className="w-64 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatFullINR(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>GST / Tax</span>
                  <span className="tabular-nums">{formatFullINR(invoice.tax)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total Amount</span>
                  <span className="tabular-nums">{formatFullINR(invoice.amount)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Col: Deterministic Verification Checks & Security */}
        <div className="space-y-6">
          <Card className="p-5 space-y-4 border-brand-200/80">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-600" /> Deterministic AP Checks
              </h4>
              <Badge variant="purple" size="sm">Deterministic</Badge>
            </div>

            <div className="space-y-3">
              {invoice.aiChecks && invoice.aiChecks.map((check) => (
                <div
                  key={check.id}
                  className={`p-3 rounded-lg border text-xs space-y-1 ${
                    check.passed
                      ? 'bg-emerald-50/40 border-emerald-200/70 text-slate-800'
                      : check.type === 'critical'
                      ? 'bg-rose-50 border-rose-200 text-rose-950'
                      : 'bg-amber-50 border-amber-200 text-amber-950'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{check.title}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        check.passed
                          ? 'bg-emerald-100 text-emerald-800'
                          : check.type === 'critical'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {check.passed ? 'PASSED' : 'FLAGGED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{check.detail}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Bank Security Guarantee */}
          <Card className="p-4 bg-slate-900 text-white space-y-3 border-slate-800">
            <div className="flex items-center gap-2 text-brand-400">
              <ShieldAlert className="w-4 h-4" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Payment Safety Protocol</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Disbursements are locked against bank account anomalies. Payout execution validates against pre-mandated accounts.
            </p>
            <div className="pt-1 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800">
              <span>Security Level: Bank-Grade</span>
              <span className="text-emerald-400 font-medium">Active</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Flag Explanation / Evidence Modal */}
      {invoice && (
        <EvidenceModal
          isOpen={showEvidenceModal}
          onClose={() => setShowEvidenceModal(false)}
          invoice={invoice}
          riskAnalysis={riskAnalysis}
        />
      )}
    </div>
  );
};
