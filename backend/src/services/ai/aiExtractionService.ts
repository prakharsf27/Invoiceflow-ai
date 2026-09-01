import { aiService } from './aiService.js';
import { PROMPTS } from './prompts.js';
import { NormalizationHelper } from '../extraction/normalizationHelper.js';

export interface ExtractedInvoiceData {
  documentType: 'invoice';
  confidence: number;
  invoiceNumber: string | null;
  supplierName: string | null;
  supplierGstin: string | null;
  supplierEmail: string | null;
  supplierPhone: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  poNumber: string | null;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  discount: number;
  amount: number | null;
  paymentTerms: string | null;
  bankDetails?: {
    accountNumber: string | null;
    ifsc: string | null;
    bankName: string | null;
  };
  lineItems: Array<{
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    taxRate: number | null;
    taxAmount: number | null;
    total: number | null;
  }>;
}

export interface ExtractedPOData {
  documentType: 'purchase_order';
  confidence: number;
  poNumber: string | null;
  poDate: string | null;
  buyerName: string | null;
  buyerGstin: string | null;
  supplierName: string | null;
  supplierGstin: string | null;
  supplierEmail: string | null;
  deliveryAddress: string | null;
  paymentTerms: string | null;
  expectedDeliveryDate: string | null;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  lineItems: Array<{
    itemCode: string | null;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    taxRate: number | null;
    taxAmount: number | null;
    total: number | null;
  }>;
}

/**
 * Robust JSON extraction helper that handles markdown wrappers, preamble text,
 * trailing commas, and unescaped linebreaks cleanly.
 */
export const cleanAndParseJson = (rawText: string): any => {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty or invalid raw text from AI provider.');
  }

  // 1. Strip markdown codeblock markers
  let cleaned = rawText
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/\s*```$/im, '')
    .trim();

  // 2. Extract first '{' to last '}' block if preamble/epilogue text exists
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // 3. Remove trailing commas before closing braces/brackets (e.g. { "a": 1, } or [ 1, 2, ])
  cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');

  // 4. Try standard JSON.parse
  try {
    return JSON.parse(cleaned);
  } catch (firstErr: any) {
    // 5. Secondary fallback: repair unescaped newlines inside strings
    try {
      const sanitized = cleaned
        .replace(/([^\\])"([^"\n]*)\n([^"\n]*)"/g, '$1"$2\\n$3"')
        .replace(/,\s*([\}\]])/g, '$1');
      return JSON.parse(sanitized);
    } catch {
      throw new Error(`Failed to parse AI extraction JSON: ${firstErr?.message || 'Invalid JSON format'}`);
    }
  }
};

/**
 * Helper to extract number safely from raw AI response payloads,
 * handling plain numbers, formatted numeric strings, or nested { value, confidence } objects.
 */
const extractNumber = (val: any): number | null => {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const parsedNum = parseFloat(val.replace(/[^0-9.-]/g, ''));
    return isNaN(parsedNum) ? null : parsedNum;
  }
  if (val && typeof val === 'object') {
    return extractNumber(val.value);
  }
  return null;
};

/**
 * Helper to extract string safely from raw AI response payloads,
 * handling plain strings or nested { value, confidence } objects.
 */
const extractString = (val: any): string | null => {
  if (typeof val === 'string' && val.trim() !== '') return val.trim();
  if (val && typeof val === 'object' && typeof val.value === 'string' && val.value.trim() !== '') {
    return val.value.trim();
  }
  return null;
};

class AIExtractionService {
  /**
   * Extract invoice fields using Gemini/Groq multimodal capabilities.
   */
  public async extractInvoiceDocument(
    fileBuffer: Buffer,
    mimeType: string,
    context?: { companyId?: string; userId?: string }
  ): Promise<{ data: ExtractedInvoiceData; rawJson: string; model: string }> {
    const { jsonText, model } = await aiService.extractDocumentMedia(
      fileBuffer,
      mimeType,
      {
        ...context,
        systemInstruction: PROMPTS.INVOICE_EXTRACTION_SYSTEM_INSTRUCTION,
        userPrompt: 'Perform anti-hallucination OCR extraction on this invoice document. Return valid JSON matching the invoice schema.',
      }
    );

    let parsed: any = {};
    try {
      parsed = cleanAndParseJson(jsonText);
    } catch (err: any) {
      throw new Error(`Failed to parse AI invoice extraction JSON: ${err?.message || 'Invalid JSON format'}`);
    }

    const subtotal = extractNumber(parsed.subtotal);
    const tax = extractNumber(parsed.tax);
    const amount = extractNumber(parsed.amount) ?? extractNumber(parsed.total);

    const rawInvNum = extractString(parsed.invoiceNumber);
    const invoiceNumber = rawInvNum ? NormalizationHelper.normalizeInvoiceNumber(rawInvNum) : null;

    const rawSupName = extractString(parsed.supplierName);
    const supplierName = (rawSupName && !/^(?:unknown|null|n\/a|supplier|vendor)$/i.test(rawSupName))
      ? rawSupName.trim()
      : null;

    const rawInvDate = extractString(parsed.invoiceDate);
    const invoiceDate = rawInvDate ? NormalizationHelper.normalizeDate(rawInvDate) : null;

    const rawDueDate = extractString(parsed.dueDate);
    const dueDate = rawDueDate ? NormalizationHelper.normalizeDate(rawDueDate) : null;

    const rawPoNum = extractString(parsed.poNumber);
    const poNumber = rawPoNum ? NormalizationHelper.normalizePONumber(rawPoNum) : null;

    const data: ExtractedInvoiceData = {
      documentType: 'invoice',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      invoiceNumber,
      supplierName,
      supplierGstin: extractString(parsed.supplierGstin) || extractString(parsed.supplierGSTIN),
      supplierEmail: extractString(parsed.supplierEmail),
      supplierPhone: extractString(parsed.supplierPhone),
      invoiceDate,
      dueDate,
      poNumber,
      currency: extractString(parsed.currency) || 'INR',
      subtotal,
      tax,
      discount: extractNumber(parsed.discount) || 0,
      amount,
      paymentTerms: extractString(parsed.paymentTerms) || null,
      bankDetails: {
        accountNumber: extractString(parsed.bankDetails?.accountNumber),
        ifsc: extractString(parsed.bankDetails?.ifsc),
        bankName: extractString(parsed.bankDetails?.bankName),
      },
      lineItems: Array.isArray(parsed.lineItems)
        ? parsed.lineItems.map((item: any) => ({
            description: String(extractString(item.description) || 'Item').trim(),
            quantity: extractNumber(item.quantity),
            unitPrice: extractNumber(item.unitPrice),
            taxRate: extractNumber(item.taxRate),
            taxAmount: extractNumber(item.taxAmount),
            total: extractNumber(item.total) ?? extractNumber(item.amount),
          }))
        : [],
    };

    return { data, rawJson: JSON.stringify(parsed), model };
  }

  /**
   * Extract Purchase Order fields using Gemini/Groq multimodal capabilities.
   */
  public async extractPODocument(
    fileBuffer: Buffer,
    mimeType: string,
    context?: { companyId?: string; userId?: string }
  ): Promise<{ data: ExtractedPOData; rawJson: string; model: string }> {
    const { jsonText, model } = await aiService.extractDocumentMedia(
      fileBuffer,
      mimeType,
      {
        ...context,
        systemInstruction: PROMPTS.PO_EXTRACTION_SYSTEM_INSTRUCTION,
        userPrompt: 'Perform anti-hallucination OCR extraction on this purchase order document. Return valid JSON matching the purchase order schema.',
      }
    );

    let parsed: any = {};
    try {
      parsed = cleanAndParseJson(jsonText);
    } catch (err: any) {
      throw new Error(`Failed to parse AI PO extraction JSON: ${err?.message || 'Invalid JSON format'}`);
    }

    const subtotal = extractNumber(parsed.subtotal);
    const tax = extractNumber(parsed.tax);
    const total = extractNumber(parsed.total) ?? extractNumber(parsed.amount);

    const rawPoNum = extractString(parsed.poNumber);
    const poNumber = rawPoNum ? NormalizationHelper.normalizePONumber(rawPoNum) : null;

    const rawPoDate = extractString(parsed.poDate);
    const poDate = rawPoDate ? NormalizationHelper.normalizeDate(rawPoDate) : null;

    const rawSupName = extractString(parsed.supplierName);
    const supplierName = (rawSupName && !/^(?:unknown|null|n\/a|supplier|vendor)$/i.test(rawSupName))
      ? rawSupName.trim()
      : null;

    const data: ExtractedPOData = {
      documentType: 'purchase_order',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      poNumber,
      poDate,
      buyerName: extractString(parsed.buyerName) || extractString(parsed.companyName),
      buyerGstin: extractString(parsed.buyerGstin) || extractString(parsed.buyerGSTIN),
      supplierName,
      supplierGstin: extractString(parsed.supplierGstin) || extractString(parsed.supplierGSTIN),
      supplierEmail: extractString(parsed.supplierEmail),
      deliveryAddress: extractString(parsed.deliveryAddress) || extractString(parsed.shippingAddress),
      paymentTerms: extractString(parsed.paymentTerms),
      expectedDeliveryDate: extractString(parsed.expectedDeliveryDate),
      currency: extractString(parsed.currency) || 'INR',
      subtotal,
      tax,
      total,
      lineItems: Array.isArray(parsed.lineItems)
        ? parsed.lineItems.map((item: any) => ({
            itemCode: extractString(item.itemCode) || extractString(item.sku) || extractString(item.code),
            description: String(extractString(item.description) || 'Item').trim(),
            quantity: extractNumber(item.quantity),
            unitPrice: extractNumber(item.unitPrice),
            taxRate: extractNumber(item.taxRate),
            taxAmount: extractNumber(item.taxAmount),
            total: extractNumber(item.total) ?? extractNumber(item.amount),
          }))
        : [],
    };

    return { data, rawJson: JSON.stringify(parsed), model };
  }

  /**
   * Fallback classification for unknown documents using Gemini/Groq AI.
   */
  public async classifyUnknownDocument(
    fileBuffer: Buffer,
    mimeType: string,
    context?: { companyId?: string; userId?: string }
  ): Promise<{ documentType: 'invoice' | 'purchase_order' | 'unknown'; confidence: number }> {
    try {
      const { jsonText } = await aiService.extractDocumentMedia(fileBuffer, mimeType, {
        ...context,
        systemInstruction: PROMPTS.CLASSIFICATION_SYSTEM_INSTRUCTION,
        userPrompt: 'Classify document as invoice, purchase_order, or unknown. Return valid JSON matching schema.',
      });
      const parsed = cleanAndParseJson(jsonText);

      const documentType = ['invoice', 'purchase_order', 'unknown'].includes(parsed.documentType)
        ? parsed.documentType
        : (parsed.isInvoice ? 'invoice' : 'unknown');

      return {
        documentType,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
      };
    } catch {
      return { documentType: 'unknown', confidence: 0 };
    }
  }
}

export const aiExtractionService = new AIExtractionService();
