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
  const companyId = req.user!.companyId;
  const userId = req.user!.userId;
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

    // 1. Rate Limit Enforcement (using existing rate limiter)
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
      // 3. Centralized AI Call (using existing aiService.generateText - model fallback queue managed internally)
      const { response: rawAiText, model } = await aiService.generateText(
        promptPayload,
        PROMPTS.COPILOT_SYSTEM_INSTRUCTION,
        { companyId, userId }
      );
      modelUsed = model;

      const cleanedJson = rawAiText
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
          reasons: Array.isArray(parsed.highlightItem.reasons)
            ? parsed.highlightItem.reasons.map((r: any) => String(r))
            : [],
          actionUrl: parsed.highlightItem.actionUrl ? String(parsed.highlightItem.actionUrl) : null,
          actionLabel: parsed.highlightItem.actionLabel ? String(parsed.highlightItem.actionLabel) : null,
        };
      }
    } catch (aiErr: any) {
      console.warn('⚠️ Gemini Copilot synthesis fallback to grounded responder:', aiErr?.message);

      // Grounded Fallback Responder using contextData companyMetrics
      const q = userQuery.toLowerCase();
      const metrics = contextData.companyMetrics;

      if (q.includes('attention') || q.includes('review')) {
        if (metrics.attentionRequiredCount === 0) {
          replyText = `There are currently 0 invoices requiring attention for ${req.user?.companyName || 'your organization'}. All records are in clear status.`;
        } else {
          const firstAttn = contextData.querySpecificRecords.relevantInvoices[0];
          replyText = `You have ${metrics.attentionRequiredCount} invoice(s) requiring attention today. Top priority is ${firstAttn?.supplierName || 'Invoice'} (${firstAttn?.invoiceNumber || ''}) for ₹${(firstAttn?.amount || 0).toLocaleString('en-IN')}.`;
          if (firstAttn) {
            actionTitle = 'Priority Attention Item';
            highlightItem = {
              title: `${firstAttn.supplierName} (${firstAttn.invoiceNumber})`,
              amount: `₹${firstAttn.amount.toLocaleString('en-IN')}`,
              reasons: [firstAttn.aiStatus || 'Review required', firstAttn.aiRecommendation || 'Verify details'],
              actionUrl: `/app/invoices/${firstAttn.id}`,
              actionLabel: 'Inspect Details',
            };
          }
        }
      } else if (q.includes('overdue')) {
        if (metrics.overdueInvoicesCount === 0) {
          replyText = `No invoices are currently overdue for ${req.user?.companyName || 'your organization'}.`;
        } else {
          replyText = `${metrics.overdueInvoicesCount} invoice(s) are currently overdue totaling ₹${metrics.overdueTotalAmount.toLocaleString('en-IN')}.`;
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
            actionUrl: `/app/invoices/${top.id}`,
            actionLabel: 'Inspect Invoice',
          };
        } else {
          replyText = `No invoices found in your organization's records.`;
        }
      } else {
        replyText = `${req.user?.companyName || 'Your organization'} tracks ${metrics.totalInvoicesCount} invoice(s) totaling ₹${metrics.totalPayablesAmount.toLocaleString('en-IN')} in outstanding payables across ${metrics.openPOCount} open PO(s).`;
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
