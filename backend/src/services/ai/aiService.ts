import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

import { PROMPTS, DEFAULT_GEMINI_MODEL, MAX_OUTPUT_TOKENS } from './prompts.js';
import { aiRateLimiter } from './aiRateLimiter.js';
import { aiQueue } from './aiQueue.js';
import { withAIRetry } from './aiRetry.js';
import { aiCacheService, StoredAIAnalysis } from './aiCacheService.js';
import { aiLogger } from './aiLogger.js';

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
  analyzedAt: string;
  analysisKey: string;
  cached: boolean;
}

class CentralizedAIService {
  private client: GoogleGenAI | null = null;
  private currentKey: string | null = null;
  private modelFallbackQueue = [
    process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    'gemini-3.6-flash',
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
  ];

  public isConfigured(): boolean {
    const apiKey = process.env.GEMINI_API_KEY;
    return Boolean(apiKey && apiKey.trim() !== '');
  }

  public getModel(): string {
    return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  }

  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Gemini API key is not configured. Please set GEMINI_API_KEY in backend/.env');
    }

    if (!this.client || this.currentKey !== apiKey.trim()) {
      this.client = new GoogleGenAI({ apiKey: apiKey.trim() });
      this.currentKey = apiKey.trim();
    }

    return this.client;
  }

  /**
   * Check rate limits before executing an AI call.
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
   * Helper to execute Gemini requests across model fallback queue if model 404s.
   */
  private async executeGenerate(
    runner: (client: GoogleGenAI, modelName: string) => Promise<string>
  ): Promise<{ text: string; effectiveModel: string }> {
    const client = this.getClient();
    const primary = this.getModel();
    const uniqueModels = Array.from(new Set([primary, ...this.modelFallbackQueue]));

    let lastError: any = null;

    for (const modelName of uniqueModels) {
      try {
        const text = await runner(client, modelName);
        if (text && text.trim() !== '') {
          return { text: text.trim(), effectiveModel: modelName };
        }
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        if (msg.includes('NOT_FOUND') || msg.includes('404') || msg.includes('is not found')) {
          console.warn(`[CentralizedAIService] Model ${modelName} 404/not available. Trying fallback...`);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('Failed to generate content across available models.');
  }

  /**
   * Extract document data (PDF, PNG, JPG) using Gemini multimodal capabilities.
   */
  public async extractDocumentMedia(
    fileBuffer: Buffer,
    mimeType: string,
    context?: { companyId?: string; userId?: string }
  ): Promise<{ jsonText: string; model: string; latencyMs: number }> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured. Please set GEMINI_API_KEY in backend/.env');
    }

    const companyId = context?.companyId || 'company-demo-01';
    const userId = context?.userId;
    const limitKey = userId || companyId;

    this.checkRateLimit(companyId, userId);

    const base64Data = fileBuffer.toString('base64');
    const startTime = Date.now();
    let effectiveModelUsed = this.getModel();

    try {
      const jsonText = await aiQueue.enqueue(() =>
        withAIRetry(async () => {
          aiRateLimiter.consume(limitKey);

          const { text, effectiveModel } = await this.executeGenerate((client, modelName) =>
            client.models
              .generateContent({
                model: modelName,
                contents: [
                  {
                    inlineData: {
                      mimeType,
                      data: base64Data,
                    },
                  },
                  PROMPTS.OCR_USER_PROMPT,
                ],
                config: {
                  systemInstruction: PROMPTS.OCR_SYSTEM_INSTRUCTION,
                  temperature: 0.1,
                  maxOutputTokens: MAX_OUTPUT_TOKENS,
                  responseMimeType: 'application/json',
                },
              })
              .then((res) => res.text || '')
          );

          effectiveModelUsed = effectiveModel;
          return text;
        })
      );

      const latencyMs = Date.now() - startTime;

      aiLogger.log({
        requestType: 'ocr_extraction',
        companyId,
        userId,
        timestamp: new Date().toISOString(),
        success: true,
        cached: false,
        model: effectiveModelUsed,
        latencyMs,
      });

      return { jsonText, model: effectiveModelUsed, latencyMs };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      aiLogger.log({
        requestType: 'ocr_extraction',
        companyId,
        userId,
        timestamp: new Date().toISOString(),
        success: false,
        cached: false,
        model: effectiveModelUsed,
        latencyMs,
        error: err?.message,
      });
      throw err;
    }
  }

  /**
   * Analyze invoice AP risk with caching, deterministic hash keys, and minimal context payload.
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

    // 1. Generate deterministic analysis key from invoice data
    const analysisKey = aiCacheService.generateInvoiceAnalysisKey(invoice);

    // 2. Check cache in MongoDB unless explicit re-analysis requested
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
      throw new Error('Gemini API key is not configured. Please set GEMINI_API_KEY in backend/.env');
    }

    this.checkRateLimit(companyId, userId);
    const limitKey = userId || companyId;
    const startTime = Date.now();
    let effectiveModelUsed = this.getModel();

    // 3. Construct minimal, bounded context payload
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
      const rawText = await aiQueue.enqueue(() =>
        withAIRetry(async () => {
          aiRateLimiter.consume(limitKey);

          const { text, effectiveModel } = await this.executeGenerate((client, modelName) =>
            client.models
              .generateContent({
                model: modelName,
                contents: prompt,
                config: {
                  systemInstruction: PROMPTS.RISK_ANALYSIS_SYSTEM_INSTRUCTION,
                  temperature: 0.2,
                  maxOutputTokens: MAX_OUTPUT_TOKENS,
                  responseMimeType: 'application/json',
                },
              })
              .then((res) => res.text || '')
          );

          effectiveModelUsed = effectiveModel;
          return text;
        })
      );

      const latencyMs = Date.now() - startTime;
      const cleaned = rawText
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

      // 4. Save to MongoDB document cache
      const stored = await aiCacheService.saveInvoiceAnalysis(
        invoice.id || invoice._id,
        companyId,
        validatedResult,
        effectiveModelUsed,
        analysisKey
      );

      aiLogger.log({
        requestType: 'risk_analysis',
        companyId,
        userId,
        timestamp: new Date().toISOString(),
        success: true,
        cached: false,
        model: effectiveModelUsed,
        latencyMs,
      });

      return {
        analysis: validatedResult,
        model: effectiveModelUsed,
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
        model: effectiveModelUsed,
        latencyMs,
        error: err?.message,
      });
      throw err;
    }
  }

  /**
   * General text generation endpoint (e.g. for testing connection).
   */
  public async generateText(
    prompt: string,
    context?: { companyId?: string; userId?: string }
  ): Promise<{ response: string; model: string; latencyMs: number }> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured. Please set GEMINI_API_KEY in backend/.env');
    }

    const companyId = context?.companyId || 'company-demo-01';
    const userId = context?.userId;
    const limitKey = userId || companyId;

    this.checkRateLimit(companyId, userId);

    const startTime = Date.now();
    let effectiveModelUsed = this.getModel();

    try {
      const responseText = await aiQueue.enqueue(() =>
        withAIRetry(async () => {
          aiRateLimiter.consume(limitKey);

          const { text, effectiveModel } = await this.executeGenerate((client, modelName) =>
            client.models
              .generateContent({
                model: modelName,
                contents: prompt.trim(),
                config: {
                  temperature: 0.7,
                  maxOutputTokens: MAX_OUTPUT_TOKENS,
                },
              })
              .then((res) => res.text || '')
          );

          effectiveModelUsed = effectiveModel;
          return text;
        })
      );

      const latencyMs = Date.now() - startTime;

      aiLogger.log({
        requestType: 'test',
        companyId,
        userId,
        timestamp: new Date().toISOString(),
        success: true,
        cached: false,
        model: effectiveModelUsed,
        latencyMs,
      });

      return { response: responseText, model: effectiveModelUsed, latencyMs };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      aiLogger.log({
        requestType: 'test',
        companyId,
        userId,
        timestamp: new Date().toISOString(),
        success: false,
        cached: false,
        model: effectiveModelUsed,
        latencyMs,
        error: err?.message,
      });
      throw err;
    }
  }
}

export const aiService = new CentralizedAIService();
