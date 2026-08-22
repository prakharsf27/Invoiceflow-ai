import dotenv from 'dotenv';
import path from 'path';

import { PROMPTS, DEFAULT_GEMINI_MODEL } from './prompts.js';
import { aiRateLimiter } from './aiRateLimiter.js';
import { aiQueue } from './aiQueue.js';
import { withAIRetry } from './aiRetry.js';
import { aiCacheService } from './aiCacheService.js';
import { aiLogger } from './aiLogger.js';

import { geminiProvider } from './providers/geminiProvider.js';
import { groqProvider } from './providers/groqProvider.js';
import { isRetryableAIError, AIProviderResult } from './types.js';

// Load .env configuration
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

export interface InvoiceRiskAnalysisResult {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  decision: 'approve' | 'review' | 'hold';
  reasons: string[];
  warnings: string[];
  recommendation: string;
}

export interface AnalysisResponse {
  analysis: InvoiceRiskAnalysisResult;
  model: string;
  provider?: 'gemini' | 'groq';
  analyzedAt: string;
  analysisKey: string;
  cached: boolean;
}

class CentralizedAIService {
  /**
   * Check whether at least one AI provider is configured in environment.
   */
  public isConfigured(): boolean {
    return geminiProvider.isConfigured() || groqProvider.isConfigured();
  }

  public getModel(): string {
    if (geminiProvider.isConfigured()) {
      return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    }
    if (groqProvider.isConfigured()) {
      return 'llama-3.3-70b-versatile';
    }
    return DEFAULT_GEMINI_MODEL;
  }

  /**
   * Check sliding-window rate limit for given company/user.
   */
  private checkRateLimit(companyId?: string, userId?: string): void {
    const limitKey = userId || companyId || 'global';
    const limitCheck = aiRateLimiter.checkLimit(limitKey);

    if (!limitCheck.allowed) {
      const waitTime = limitCheck.retryAfterSeconds || 10;
      throw new Error(
        `AI rate limit exceeded (${limitCheck.remainingMinute === 0 ? 'per-minute' : 'daily'} quota). Please retry in ${waitTime} seconds.`
      );
    }
  }

  /**
   * Primary-to-Fallback AI Provider Orchestration Execution Engine.
   * Attempts Gemini first. If Gemini fails with a retryable availability/rate-limit error,
   * automatically attempts Groq fallback.
   */
  private async executeWithFallback<T>(
    operationName: string,
    geminiOp: () => Promise<AIProviderResult<T>>,
    groqOp: () => Promise<AIProviderResult<T>>,
    companyId: string,
    userId?: string
  ): Promise<AIProviderResult<T>> {
    const limitKey = userId || companyId;

    // 1. Attempt Primary Provider: Gemini
    if (geminiProvider.isConfigured()) {
      console.log(`[AI] Trying Gemini (${operationName})...`);
      try {
        const result = await aiQueue.enqueue(() =>
          withAIRetry(async () => {
            this.checkRateLimit(companyId, userId);
            aiRateLimiter.consume(limitKey);
            return await geminiOp();
          })
        );
        console.log(`[AI] Gemini succeeded (${result.model})`);
        return result;
      } catch (geminiErr: any) {
        const errMsg = geminiErr?.message || String(geminiErr);
        console.warn(`[AI] Gemini failed for ${operationName}: ${errMsg}`);

        // Only fallback to Groq if the error is a provider availability / rate-limit / 429 error
        if (!isRetryableAIError(geminiErr)) {
          console.error(`[AI] Non-retryable application/validation error in Gemini. Skipping fallback.`);
          throw geminiErr;
        }

        console.warn(`[AI] Gemini unavailable/rate limited. Preparing fallback to Groq...`);
      }
    } else {
      console.warn(`[AI] Gemini is not configured. Falling back directly to Groq...`);
    }

    // 2. Attempt Fallback Provider: Groq
    if (groqProvider.isConfigured()) {
      console.log(`[AI] Falling back to Groq (${operationName})...`);
      try {
        const result = await aiQueue.enqueue(() =>
          withAIRetry(async () => {
            this.checkRateLimit(companyId, userId);
            aiRateLimiter.consume(limitKey);
            return await groqOp();
          })
        );
        console.log(`[AI] Groq succeeded (${result.model})`);
        return result;
      } catch (groqErr: any) {
        const groqMsg = groqErr?.message || String(groqErr);
        console.error(`[AI] Groq fallback failed for ${operationName}: ${groqMsg}`);
        console.error(`[AI] All AI providers unavailable.`);
        throw new Error(`AI processing unavailable across all providers (Gemini & Groq). Please try again shortly.`);
      }
    }

    throw new Error('No AI provider configured. Please set GEMINI_API_KEY or GROQ_API_KEY in environment.');
  }

  /**
   * Extract document data (PDF, PNG, JPG) using AI OCR capabilities with Groq fallback.
   */
  public async extractDocumentMedia(
    fileBuffer: Buffer,
    mimeType: string,
    context?: { companyId?: string; userId?: string; systemInstruction?: string }
  ): Promise<{ jsonText: string; model: string; provider: 'gemini' | 'groq'; latencyMs: number }> {
    if (!this.isConfigured()) {
      throw new Error('No AI provider configured. Please set GEMINI_API_KEY or GROQ_API_KEY in environment.');
    }

    const companyId = context?.companyId || 'company-demo-01';
    const userId = context?.userId;
    const startTime = Date.now();
    const options = context?.systemInstruction ? { systemInstruction: context.systemInstruction } : undefined;

    try {
      const result = await this.executeWithFallback<string>(
        'ocr_extraction',
        () => geminiProvider.extractDocumentMedia(fileBuffer, mimeType, options),
        () => groqProvider.extractDocumentMedia(fileBuffer, mimeType, options),
        companyId,
        userId
      );

      const latencyMs = Date.now() - startTime;

      aiLogger.log({
        requestType: 'ocr_extraction',
        companyId,
        userId,
        timestamp: new Date().toISOString(),
        success: true,
        cached: false,
        model: `${result.provider}:${result.model}`,
        latencyMs,
      });

      return {
        jsonText: result.response,
        model: result.model,
        provider: result.provider,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      aiLogger.log({
        requestType: 'ocr_extraction',
        companyId,
        userId,
        timestamp: new Date().toISOString(),
        success: false,
        cached: false,
        model: 'all_providers_failed',
        latencyMs,
        error: err?.message,
      });
      throw err;
    }
  }

  /**
   * Analyze invoice AP risk with caching, deterministic hash keys, and AI provider fallback.
   */
  public async analyzeInvoiceRisk(
    invoice: any,
    supplier?: any,
    purchaseOrder?: any,
    validationResults?: any,
    context?: { companyId?: string; userId?: string; forceReanalyze?: boolean }
  ): Promise<AnalysisResponse> {
    const companyId = context?.companyId || invoice.companyId || 'company-demo-01';
    const userId = context?.userId;
    const forceReanalyze = Boolean(context?.forceReanalyze);

    // 1. Deterministic analysis key check in cache
    const analysisKey = aiCacheService.generateInvoiceAnalysisKey(invoice);

    if (!forceReanalyze) {
      const cached = await aiCacheService.getCachedInvoiceAnalysis(invoice.id || invoice._id, companyId, analysisKey);
      if (cached && cached.result) {
        aiLogger.log({
          requestType: 'risk_analysis',
          companyId,
          userId,
          timestamp: new Date().toISOString(),
          success: true,
          cached: true,
          model: cached.model || this.getModel(),
          latencyMs: 0,
        });

        return {
          analysis: cached.result,
          model: cached.model,
          analyzedAt: cached.analyzedAt,
          analysisKey,
          cached: true,
        };
      }
    }

    if (!this.isConfigured()) {
      throw new Error('No AI provider configured. Please set GEMINI_API_KEY or GROQ_API_KEY in environment.');
    }

    const startTime = Date.now();

    // 2. Construct minimal context payload
    const minimalContext = {
      invoice: {
        number: invoice.invoiceNumber,
        supplier: invoice.supplierName,
        gstin: invoice.supplierGstin,
        amount: invoice.amount,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        dueDate: invoice.dueDate,
        poNumber: invoice.poNumber,
        bankChanged: invoice.bankDetails?.isChangedFromPrevious,
        itemCount: Array.isArray(invoice.items) ? invoice.items.length : 0,
      },
      supplier: supplier ? {
        name: supplier.name,
        spend: supplier.totalSpend,
        invoices: supplier.invoiceCount,
        risk: supplier.riskLevel,
      } : 'No previous supplier history in records.',
      po: purchaseOrder ? {
        poNumber: purchaseOrder.poNumber,
        total: purchaseOrder.totalAmount,
        status: purchaseOrder.matchStatus,
      } : (invoice.poNumber ? `PO ${invoice.poNumber} referenced but not found` : 'Direct billing (No PO)'),
      checks: Array.isArray(validationResults)
        ? validationResults.map((c: any) => `${c.title}: ${c.passed ? 'PASSED' : 'FLAGGED'}`)
        : ['Calculations verified'],
    };

    const prompt = `Analyze AP risk for this invoice summary:\n${JSON.stringify(minimalContext, null, 2)}`;

    try {
      const result = await this.executeWithFallback<string>(
        'risk_analysis',
        () => geminiProvider.generateText(prompt, PROMPTS.RISK_ANALYSIS_SYSTEM_INSTRUCTION, { temperature: 0.2, jsonMode: true }),
        () => groqProvider.generateText(prompt, PROMPTS.RISK_ANALYSIS_SYSTEM_INSTRUCTION, { temperature: 0.2, jsonMode: true }),
        companyId,
        userId
      );

      const latencyMs = Date.now() - startTime;
      const cleaned = result.response
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

      const parsed: InvoiceRiskAnalysisResult = JSON.parse(cleaned);

      const validatedResult: InvoiceRiskAnalysisResult = {
        riskScore: Math.min(100, Math.max(0, typeof parsed.riskScore === 'number' ? parsed.riskScore : 20)),
        riskLevel: ['low', 'medium', 'high', 'critical'].includes(parsed.riskLevel) ? parsed.riskLevel : 'low',
        decision: ['approve', 'review', 'hold'].includes(parsed.decision) ? parsed.decision : 'review',
        reasons: Array.isArray(parsed.reasons) ? parsed.reasons : ['Math and metadata verified'],
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        recommendation: parsed.recommendation || 'Proceed with standard approval workflow.',
      };

      // Save to MongoDB cache
      const stored = await aiCacheService.saveInvoiceAnalysis(
        invoice.id || invoice._id,
        companyId,
        validatedResult,
        `${result.provider}:${result.model}`,
        analysisKey
      );

      aiLogger.log({
        requestType: 'risk_analysis',
        companyId,
        userId,
        timestamp: new Date().toISOString(),
        success: true,
        cached: false,
        model: `${result.provider}:${result.model}`,
        latencyMs,
      });

      return {
        analysis: validatedResult,
        model: result.model,
        provider: result.provider,
        analyzedAt: stored.analyzedAt,
        analysisKey,
        cached: false,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      aiLogger.log({
        requestType: 'risk_analysis',
        companyId,
        userId,
        timestamp: new Date().toISOString(),
        success: false,
        cached: false,
        model: 'all_providers_failed',
        latencyMs,
        error: err?.message,
      });
      throw err;
    }
  }

  /**
   * General text generation endpoint with Gemini -> Groq fallback.
   */
  public async generateText(
    prompt: string,
    systemInstruction?: string,
    context?: { companyId?: string; userId?: string }
  ): Promise<{ response: string; model: string; provider: 'gemini' | 'groq'; latencyMs: number }> {
    if (!this.isConfigured()) {
      throw new Error('No AI provider configured. Please set GEMINI_API_KEY or GROQ_API_KEY in environment.');
    }

    const companyId = context?.companyId || 'company-demo-01';
    const userId = context?.userId;
    const startTime = Date.now();

    try {
      const result = await this.executeWithFallback<string>(
        'text_generation',
        () => geminiProvider.generateText(prompt, systemInstruction),
        () => groqProvider.generateText(prompt, systemInstruction),
        companyId,
        userId
      );

      const latencyMs = Date.now() - startTime;

      aiLogger.log({
        requestType: 'test',
        companyId,
        userId,
        timestamp: new Date().toISOString(),
        success: true,
        cached: false,
        model: `${result.provider}:${result.model}`,
        latencyMs,
      });

      return {
        response: result.response,
        model: result.model,
        provider: result.provider,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      aiLogger.log({
        requestType: 'test',
        companyId,
        userId,
        timestamp: new Date().toISOString(),
        success: false,
        cached: false,
        model: 'all_providers_failed',
        latencyMs,
        error: err?.message,
      });
      throw err;
    }
  }
}

export const aiService = new CentralizedAIService();
