import { aiService, InvoiceRiskAnalysisResult, AnalysisResponse } from './ai/aiService.js';
import { DEFAULT_GEMINI_MODEL } from './ai/prompts.js';

export const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;
export type { InvoiceRiskAnalysisResult, AnalysisResponse };

/**
 * Proxy export maintaining backward compatibility.
 * All operations are handled by the centralized production AI service layer.
 */
export const geminiService = {
  isConfigured: () => aiService.isConfigured(),
  getModel: () => aiService.getModel(),
  generateText: (prompt: string, context?: any) => aiService.generateText(prompt, context).then((r) => r.response),
  extractFromMedia: (fileBuffer: Buffer, mimeType: string, _prompt?: string, context?: any) =>
    aiService.extractDocumentMedia(fileBuffer, mimeType, context).then((r) => r.jsonText),
  analyzeInvoiceRisk: (invoice: any, supplier?: any, po?: any, checks?: any, context?: any) =>
    aiService.analyzeInvoiceRisk(invoice, supplier, po, checks, context).then((r) => r.analysis),
};
