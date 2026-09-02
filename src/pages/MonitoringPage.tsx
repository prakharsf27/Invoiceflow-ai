import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Building2,
  CreditCard,
  AlertCircle
} from 'lucide-react';
import { Card, Skeleton } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import type { Invoice } from '../types';

/**
 * Safely format bank account and institution information avoiding any null/undefined crashes.
 * Never call .split(), .trim(), or .toLowerCase() without strict type guards.
 */
function getSafeBankDisplay(bankDetails?: Invoice['bankDetails']): {
  displayText: string;
  hasChanged: boolean;
  previousAccount: string | null;
  ifsc: string | null;
} {
  if (!bankDetails) {
    return {
      displayText: 'Not configured',
      hasChanged: false,
      previousAccount: null,
      ifsc: null,
    };
  }

  const rawAccount = bankDetails.accountNumber;
  const accountNumber =
    typeof rawAccount === 'string' && rawAccount.trim().length > 0
      ? rawAccount.trim()
      : null;

  const rawBankName = bankDetails.bankName;
  let bankName: string | null = null;
  if (typeof rawBankName === 'string' && rawBankName.trim().length > 0) {
    const trimmed = rawBankName.trim();
    // Guard against split crash or comma-separated branch strings
    const parts = trimmed.split(',');
    bankName = parts.length > 0 && parts[0] ? parts[0].trim() : trimmed;
  }

  const rawIfsc = bankDetails.ifsc;
  const ifsc =
    typeof rawIfsc === 'string' && rawIfsc.trim().length > 0
      ? rawIfsc.trim()
      : null;

  let displayText = 'Not configured';
  if (accountNumber && bankName) {
    displayText = `${accountNumber} (${bankName})`;
  } else if (accountNumber) {
    displayText = ifsc ? `${accountNumber} (IFSC: ${ifsc})` : accountNumber;
  } else if (bankName) {
    displayText = bankName;
  }

  const hasChanged = Boolean(bankDetails.isChangedFromPrevious);
  const previousAccount =
    typeof bankDetails.previousAccountNumber === 'string' &&
    bankDetails.previousAccountNumber.trim().length > 0
      ? bankDetails.previousAccountNumber.trim()
      : null;

  return {
    displayText,
    hasChanged,
    previousAccount,
    ifsc,
  };
}

/**
 * Safely format monetary amounts into Indian currency strings without NaN or null crashes.
 */
function formatMonetaryAmount(amount?: number | null): string {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return 'Not available';
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)}L`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

const MonitoringContent: React.FC = () => {
  const navigate = useNavigate();
  const { invoices = [], isLoading, apiError, refreshData } = useApp();
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Load data once on mount only if invoices list is empty, avoiding duplicate infinite loops
  useEffect(() => {
    if (!invoices || invoices.length === 0) {
      refreshData().catch((err) => {
        console.warn('Initial monitoring data refresh skipped or failed:', err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } catch (err) {
      console.error('Failed to manually refresh monitoring data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Find risk & security flagged invoices safely
  const flaggedInvoices = useMemo(() => {
    if (!Array.isArray(invoices)) return [];
    return invoices.filter((i) => {
      if (!i) return false;
      const isHighRisk = i.riskLevel === 'high' || (i.riskLevel as string) === 'critical';
      const isCriticalStatus = i.status === 'critical';
      const isBankChanged = Boolean(i.bankDetails?.isChangedFromPrevious);
      const isRiskAlert =
        typeof i.aiStatus === 'string' &&
        (i.aiStatus.toLowerCase().includes('risk') ||
          i.aiStatus.toLowerCase().includes('alert') ||
          i.aiStatus.toLowerCase().includes('bank') ||
          i.aiStatus.toLowerCase().includes('duplicate') ||
          i.aiStatus.toLowerCase().includes('critical') ||
          i.aiStatus.toLowerCase().includes('mismatch'));
      const isRiskAnalysisFlagged = Boolean(
        i.riskAnalysis &&
          (i.riskAnalysis.riskLevel === 'high' ||
            (i.riskAnalysis.riskLevel as string) === 'critical' ||
            i.riskAnalysis.decision === 'hold')
      );
      return isHighRisk || isCriticalStatus || isBankChanged || isRiskAlert || isRiskAnalysisFlagged;
    });
  }, [invoices]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Supplier Security & Risk Monitoring
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time compliance monitoring, bank mandate changes, duplicate detection, and payment fraud alerts.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing || isLoading}
            className="cursor-pointer text-xs"
          >
            <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Alerts'}</span>
          </Button>
        </div>
      </div>

      {/* Non-blocking API Availability Banner */}
      {apiError && (
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/80 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-semibold">Backend Connection Issue: </span>
              <span className="text-amber-800">
                {apiError || 'Unable to sync live security telemetry with the backend server.'}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="shrink-0 cursor-pointer bg-white text-amber-900 hover:bg-amber-100/60 border-amber-300 text-xs"
          >
            Retry Connection
          </Button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="grid grid-cols-1 gap-4">
        {isLoading && (!invoices || invoices.length === 0) ? (
          // Loading Skeleton State
          <div className="space-y-4">
            <Card className="p-5 border-slate-200 space-y-4 animate-pulse">
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-lg bg-slate-200" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="w-48 h-4 bg-slate-200 rounded" />
                  <Skeleton className="w-32 h-3 bg-slate-200 rounded" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg">
                <Skeleton className="w-full h-8 bg-slate-200 rounded" />
                <Skeleton className="w-full h-8 bg-slate-200 rounded" />
              </div>
            </Card>
            <Card className="p-5 border-slate-200 space-y-4 animate-pulse">
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-lg bg-slate-200" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="w-44 h-4 bg-slate-200 rounded" />
                  <Skeleton className="w-28 h-3 bg-slate-200 rounded" />
                </div>
              </div>
            </Card>
          </div>
        ) : !isLoading && invoices.length === 0 && apiError ? (
          // Backend API Unreachable & No Cached Records
          <Card className="p-8 text-center space-y-3 border-slate-200 bg-white shadow-subtle">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Security Monitoring Data Unavailable</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Unable to retrieve invoice risk telemetry from the backend API. Please verify your connection or retry.
              </p>
            </div>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="cursor-pointer text-xs"
              >
                <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Retry Connection</span>
              </Button>
            </div>
          </Card>
        ) : flaggedInvoices.length === 0 ? (
          // Clean State: Zero active security alerts
          <Card className="p-8 text-center space-y-2 border-slate-200 shadow-subtle">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="text-base font-bold text-slate-900">Zero active security alerts</h3>
            <p className="text-xs text-slate-500">
              All registered supplier mandates and bank details are verified clean.
            </p>
          </Card>
        ) : (
          // Flagged Security Alert Invoices
          flaggedInvoices.map((inv) => {
            const bankInfo = getSafeBankDisplay(inv.bankDetails);
            const supplierName = inv.supplierName?.trim() || 'Unknown Supplier';
            const invoiceNumber = inv.invoiceNumber?.trim() || '—';
            const poNumber = inv.poNumber?.trim() || null;
            const aiStatusDisplay =
              typeof inv.aiStatus === 'string' && inv.aiStatus.trim().length > 0
                ? inv.aiStatus.toUpperCase()
                : inv.riskLevel === 'high' || (inv.riskLevel as string) === 'critical'
                ? 'HIGH RISK'
                : 'SECURITY ALERT';
            const riskBadgeVariant =
              inv.riskLevel === 'high' || (inv.riskLevel as string) === 'critical'
                ? 'danger'
                : 'warning';
            const recommendationText =
              inv.aiRecommendation?.trim() ||
              (Array.isArray(inv.riskAnalysis?.reasons) && inv.riskAnalysis.reasons.length > 0
                ? inv.riskAnalysis.reasons.join(' • ')
                : 'Mandate or risk verification required before approving invoice disbursement.');

            return (
              <Card
                key={inv.id || `inv-${invoiceNumber}-${Math.random()}`}
                className="p-5 border-rose-200 bg-rose-50/20 space-y-3 shadow-subtle hover:border-rose-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold shrink-0">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 truncate" title={supplierName}>
                          {supplierName}
                        </span>
                        <Badge variant={riskBadgeVariant} size="sm">
                          {aiStatusDisplay}
                        </Badge>
                        {bankInfo.hasChanged && (
                          <Badge variant="danger" size="sm" className="bg-rose-600 text-white font-semibold">
                            MANDATE CHANGED
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 block truncate">
                        {invoiceNumber} • PO: {poNumber || 'None'}
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={() => inv.id && navigate(`/app/invoices/${inv.id}`)}
                    variant="danger"
                    size="sm"
                    className="cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <span>Inspect Evidence</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>

                {/* Mandate & Financial Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white border border-slate-200 rounded-lg text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 block flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      <span>Bank Account:</span>
                    </span>
                    <div className="font-semibold text-slate-700 mt-0.5 break-all">
                      <span>{bankInfo.displayText}</span>
                      {bankInfo.hasChanged && bankInfo.previousAccount && (
                        <span className="text-[10px] text-rose-600 block font-normal mt-0.5">
                          Previous Mandate: {bankInfo.previousAccount}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      <span>Invoice Total:</span>
                    </span>
                    <span className="font-bold text-rose-600 text-sm mt-0.5 block">
                      {formatMonetaryAmount(inv.amount)}
                    </span>
                  </div>
                </div>

                {/* Recommendation */}
                <p className="text-xs text-slate-600 pl-1 leading-relaxed">
                  {recommendationText}
                </p>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export const MonitoringPage: React.FC = () => {
  return (
    <ErrorBoundary
      fallbackTitle="Unable to load Security Monitoring"
      fallbackMessage="An unexpected error occurred while loading security monitoring data. The rest of the application remains fully functional."
    >
      <MonitoringContent />
    </ErrorBoundary>
  );
};
