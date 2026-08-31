import { Request, Response } from 'express';
import { copilotContextService } from '../services/ai/copilotContextService.js';
import { aiService } from '../services/ai/aiService.js';
import { PROMPTS } from '../services/ai/prompts.js';
import { aiRateLimiter } from '../services/ai/aiRateLimiter.js';
import { aiLogger } from '../services/ai/aiLogger.js';

/**
 * POST /api/copilot/ask
 * Authenticated, read-only AI Copilot endpoint.
 * Retrieves question-aware MongoDB context for req.user.companyId and synthesizes answers using Gemini.
 */
export const askCopilot = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const companyId = req.user?.companyId || 'company-demo-01';
  const userId = req.user?.userId || 'user-anonymous';
  const limitKey = userId || companyId;

  try {
    const { question } = req.body;
    const userQuery = (question || '').trim();

    if (!userQuery) {
      res.status(400).json({
        success: false,
        message: 'Question prompt is required.',
      });
      return;
    }

    // 1. Rate Limit Enforcement
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

    // 2. Question-Aware Context Retrieval from Company-Scoped MongoDB
    const contextData = await copilotContextService.buildQuestionAwareContext(companyId, userQuery);

    const promptPayload = `USER QUESTION: "${userQuery}"

COMPANY FINANCIAL CONTEXT (Company: "${req.user?.companyName || 'Organization'}"):
${JSON.stringify(contextData, null, 2)}

Provide a clear, grounded answer strictly based on the above context payload.`;

    let replyText = '';
    let actionTitle: string | null = null;
    let highlightItem: any = null;
    let modelUsed = 'gemini-2.5-flash';

    try {
      // 3. Centralized AI Call
      const { response: rawAiText, model } = await aiService.generateText(
        promptPayload,
        PROMPTS.COPILOT_SYSTEM_INSTRUCTION,
        { companyId, userId }
      );
      modelUsed = model;

      const cleanedJson = (rawAiText || '')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

      let parsed: any = {};
      try {
        parsed = JSON.parse(cleanedJson);
      } catch {
        parsed = { reply: rawAiText };
      }

      replyText = String(parsed.reply || rawAiText || 'No clear answer generated.').trim();
      actionTitle = typeof parsed.actionTitle === 'string' && parsed.actionTitle.trim() ? parsed.actionTitle.trim() : null;

      if (parsed.highlightItem && typeof parsed.highlightItem === 'object') {
        highlightItem = {
          title: String(parsed.highlightItem.title || 'Related Item').trim(),
          amount: parsed.highlightItem.amount ? String(parsed.highlightItem.amount) : null,
          dueDate: parsed.highlightItem.dueDate ? String(parsed.highlightItem.dueDate) : null,
          risk: parsed.highlightItem.risk ? String(parsed.highlightItem.risk) : null,
          reasons: Array.isArray(parsed.highlightItem.reasons)
            ? parsed.highlightItem.reasons.map((r: any) => String(r))
            : [],
          recommendation: parsed.highlightItem.recommendation ? String(parsed.highlightItem.recommendation) : null,
          actionUrl: parsed.highlightItem.actionUrl ? String(parsed.highlightItem.actionUrl) : null,
          actionLabel: parsed.highlightItem.actionLabel ? String(parsed.highlightItem.actionLabel) : null,
        };
      }
    } catch (aiErr: any) {
      console.warn('⚠️ Gemini Copilot synthesis fallback to grounded responder:', aiErr?.message);

      // Grounded Fallback Responder using contextData companyMetrics
      const q = userQuery.toLowerCase();
      const metrics = contextData.companyMetrics;
      const orgName = req.user?.companyName || 'your organization';

      if (q === 'hi' || q === 'hello' || q === 'hey' || q.startsWith('hi ') || q.startsWith('hello ')) {
        replyText = `Hello! I am your AI Finance Copilot for ${orgName}. I am currently monitoring ${metrics.totalInvoicesCount} invoice(s) totaling ₹${(metrics.totalPayablesAmount || 0).toLocaleString('en-IN')} in payables across ${metrics.openPOCount || 0} open PO(s). What would you like to investigate today?`;
      } else if (q.includes('attention') || q.includes('review') || q.includes('priority')) {
        if (metrics.attentionRequiredCount === 0) {
          replyText = `There are currently 0 invoices requiring attention for ${orgName}. All records are in clear status.`;
        } else {
          const firstAttn = contextData.querySpecificRecords.relevantInvoices[0];
          replyText = `You have ${metrics.attentionRequiredCount} invoice(s) requiring attention today. Top priority is ${firstAttn?.supplierName || 'Invoice'} (${firstAttn?.invoiceNumber || ''}) for ₹${(firstAttn?.amount || 0).toLocaleString('en-IN')}.`;
          if (firstAttn) {
            actionTitle = 'Priority Attention Item';
            highlightItem = {
              title: `${firstAttn.supplierName} (${firstAttn.invoiceNumber})`,
              amount: `₹${(firstAttn.amount || 0).toLocaleString('en-IN')}`,
              reasons: [firstAttn.aiStatus || 'Review required', firstAttn.aiRecommendation || 'Verify details'],
              actionUrl: firstAttn.id ? `/app/invoices/${firstAttn.id}` : '/app/invoices',
              actionLabel: 'Inspect Details',
            };
          }
        }
      } else if (q.includes('overdue')) {
        if (metrics.overdueInvoicesCount === 0) {
          replyText = `No invoices are currently overdue for ${orgName}. All payment schedules are up to date.`;
        } else {
          replyText = `${metrics.overdueInvoicesCount} invoice(s) are currently overdue totaling ₹${metrics.overdueTotalAmount.toLocaleString('en-IN')}.`;
        }
      } else if (q.includes('bank') || q.includes('changed')) {
        if (metrics.bankDetailsChangedCount === 0) {
          replyText = `No suppliers have changed their bank accounts in recent billing cycles.`;
        } else {
          replyText = `Alert: ${metrics.bankDetailsChangedCount} invoice(s) contain bank account numbers differing from verified vendor records. Review bank mandates prior to disbursement.`;
        }
      } else if (q.includes('po') || q.includes('mismatch')) {
        if (metrics.poMismatchCount === 0) {
          replyText = `All invoices referencing Purchase Orders are 100% matched with 0 price or quantity discrepancies.`;
        } else {
          replyText = `There are ${metrics.poMismatchCount} invoice(s) flagged with PO price or quantity variances requiring reconciliation.`;
        }
      } else if (q.includes('highest') || q.includes('maximum') || q.includes('biggest')) {
        if (metrics.highestAmountInvoice) {
          const top = metrics.highestAmountInvoice;
          replyText = `The invoice with the highest amount is ${top.supplierName} (${top.invoiceNumber}) for ₹${top.amount.toLocaleString('en-IN')}.`;
          actionTitle = 'Highest Amount Invoice';
          highlightItem = {
            title: `${top.supplierName} (${top.invoiceNumber})`,
            amount: `₹${top.amount.toLocaleString('en-IN')}`,
            reasons: [`Status: ${top.status}`],
            actionUrl: top.id ? `/app/invoices/${top.id}` : '/app/invoices',
            actionLabel: 'Inspect Invoice',
          };
        } else {
          replyText = `No invoices found in your organization's records.`;
        }
      } else {
        replyText = `${orgName} tracks ${metrics.totalInvoicesCount} invoice(s) totaling ₹${metrics.totalPayablesAmount.toLocaleString('en-IN')} in outstanding payables across ${metrics.openPOCount} open PO(s).`;
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
      model: modelUsed,
      latencyMs,
    });

    const structuredDataPayload = highlightItem
      ? {
          type: 'recommendation',
          title: actionTitle || 'Recommended Action',
          highlightItem,
        }
      : undefined;

    res.json({
      success: true,
      data: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionTitle,
        highlightItem,
        structuredData: structuredDataPayload,
      },
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    aiLogger.log({
      requestType: 'copilot_query',
      companyId: req.user?.companyId,
      userId: req.user?.userId,
      timestamp: new Date().toISOString(),
      success: false,
      cached: false,
      model: 'gemini-2.5-flash',
      latencyMs,
      error: error?.message,
    });

    res.status(500).json({
      success: false,
      message: error?.message || 'Copilot query processing failed.',
    });
  }
};
