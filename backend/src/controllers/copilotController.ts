import { Request, Response } from 'express';
import { InvoiceModel } from '../models/Invoice.js';
import { aiRateLimiter } from '../services/ai/aiRateLimiter.js';
import { aiLogger } from '../services/ai/aiLogger.js';

// POST /api/copilot/ask
export const askCopilot = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const { question } = req.body;
    const q = (question || '').toLowerCase();

    const companyId = req.user!.companyId;
    const userId = req.user?.userId;
    const limitKey = userId || companyId;

    // Check rate limit
    const limitCheck = aiRateLimiter.checkLimit(limitKey);
    if (!limitCheck.allowed) {
      const retryAfter = limitCheck.retryAfterSeconds || 10;
      res.status(429).json({
        success: false,
        message: `Copilot rate limit reached. Please wait ${retryAfter} seconds before asking again.`,
        retryAfter,
      });
      return;
    }

    aiRateLimiter.consume(limitKey);

    const invoices = await InvoiceModel.find({ companyId });
    const totalInvoices = invoices.length;
    const totalPayables = invoices
      .filter((i) => i.paymentStatus !== 'paid' && i.status !== 'paid')
      .reduce((sum, i) => sum + i.amount, 0);

    let reply = '';
    let structuredData: any = undefined;

    if (q.includes('attention') || q.includes('today') || q.includes('need') || q.includes('review')) {
      const attentionInvoices = invoices.filter(
        (i) => i.status === 'review' || i.status === 'critical' || i.status === 'hold' || i.status === 'on_hold'
      );

      if (attentionInvoices.length === 0) {
        reply = `There are currently no invoices requiring attention for your organization. All ingested invoices are in clear or paid status.`;
      } else {
        const top = attentionInvoices[0];
        reply = `${attentionInvoices.length} invoice(s) require attention today. Highest priority is ${top.supplierName || 'Invoice'} (${top.invoiceNumber}) for ₹${top.amount.toLocaleString('en-IN')} due to ${top.aiStatus || 'pending review'}.`;

        structuredData = {
          type: 'recommendation',
          title: 'Priority Attention Items',
          highlightItem: {
            title: `${top.supplierName || 'Vendor'} (${top.invoiceNumber})`,
            amount: `₹${top.amount.toLocaleString('en-IN')}`,
            dueDate: top.dueDate || 'N/A',
            risk: top.riskLevel === 'high' ? 'HIGH RISK' : 'NEEDS REVIEW',
            reasons: [top.aiStatus || 'Review required', top.aiRecommendation || 'Verify details before approval'],
            recommendation: top.aiRecommendation || 'Inspect line items and supplier details.',
            actionUrl: `/app/invoices/${top.id}`,
            actionLabel: 'Review Invoice',
          },
        };
      }
    } else if (q.includes('overdue')) {
      const overdueInvoices = invoices.filter((i) => i.status === 'overdue' || i.paymentStatus === 'overdue');
      const totalOverdue = overdueInvoices.reduce((sum, i) => sum + i.amount, 0);

      if (overdueInvoices.length === 0) {
        reply = `No invoices are currently overdue for your organization.`;
      } else {
        const first = overdueInvoices[0];
        reply = `${overdueInvoices.length} invoice(s) currently overdue totaling ₹${totalOverdue.toLocaleString('en-IN')} (${overdueInvoices.map((i) => `${i.supplierName} - ${i.invoiceNumber}`).join(', ')}).`;

        structuredData = {
          type: 'invoice_list',
          title: 'Overdue Invoices',
          totalPayable: `₹${totalOverdue.toLocaleString('en-IN')}`,
          highlightItem: {
            title: first.supplierName || first.invoiceNumber,
            amount: `₹${first.amount.toLocaleString('en-IN')}`,
            dueDate: `Due ${first.dueDate || 'N/A'}`,
            actionUrl: `/app/invoices/${first.id}`,
            actionLabel: 'View Invoice',
          },
        };
      }
    } else if (q.includes('bank') || q.includes('changed')) {
      const bankChanged = invoices.filter((i) => i.bankDetails?.isChangedFromPrevious);
      if (bankChanged.length === 0) {
        reply = `No bank account changes or unverified payment destinations detected in your invoices.`;
      } else {
        const first = bankChanged[0];
        reply = `${first.supplierName} (${first.invoiceNumber}) submitted a bank account marked as changed from previous records (${first.bankDetails?.bankName} A/C ending in ${first.bankDetails?.accountNumber?.slice(-4)}). Recommend verifying before payout.`;
        structuredData = {
          type: 'recommendation',
          title: 'Bank Detail Security Alert',
          highlightItem: {
            title: `${first.supplierName} (${first.invoiceNumber})`,
            amount: `₹${first.amount.toLocaleString('en-IN')}`,
            risk: 'SECURITY REVIEW REQUIRED',
            reasons: ['Bank details differ from previous mandate'],
            recommendation: 'Call verified contact before executing transfer.',
            actionUrl: `/app/invoices/${first.id}`,
            actionLabel: 'Inspect Bank Details',
          },
        };
      }
    } else {
      const autoCleared = invoices.filter((i) => i.status === 'ready' || i.status === 'paid').length;
      const pct = totalInvoices > 0 ? ((autoCleared / totalInvoices) * 100).toFixed(1) : '0';

      if (totalInvoices === 0) {
        reply = `InvoiceFlow AI is tracking 0 invoices for your organization. Upload your first invoice to get started.`;
      } else {
        reply = `InvoiceFlow AI is tracking ${totalInvoices} invoice(s) for your organization, totaling ₹${totalPayables.toLocaleString('en-IN')} in payables. ${autoCleared} invoice(s) (${pct}%) are cleared.`;
        structuredData = {
          type: 'recommendation',
          title: 'Operations Summary',
          highlightItem: {
            title: 'Company Payables Summary',
            amount: `₹${totalPayables.toLocaleString('en-IN')} Total Payables`,
            reasons: [`${totalInvoices} Total Invoices`, `${autoCleared} Auto-cleared (${pct}%)`],
            recommendation: 'Keep uploading invoices for real-time 3-way matching and risk detection.',
            actionUrl: '/app/invoices',
            actionLabel: 'View Invoice Inbox',
          },
        };
      }
    }

    const latencyMs = Date.now() - startTime;
    aiLogger.log({
      requestType: 'copilot_query',
      companyId,
      userId,
      timestamp: new Date().toISOString(),
      success: true,
      cached: false,
      model: 'deterministic_synthesis',
      latencyMs,
    });

    res.json({
      success: true,
      data: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        structuredData,
      },
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    aiLogger.log({
      requestType: 'copilot_query',
      companyId: req.user?.companyId,
      userId: req.user?.userId,
      timestamp: new Date().toISOString(),
      success: false,
      cached: false,
      model: 'deterministic_synthesis',
      latencyMs,
      error: (error as Error).message,
    });
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};
