import { aiService } from './aiService.js';
import { PROMPTS } from './prompts.js';

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
  supplierName: string | null;
  supplierGstin: string | null;
  supplierEmail: string | null;
  poDate: string | null;
  expectedDeliveryDate: string | null;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  lineItems: Array<{
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    taxRate: number | null;
    taxAmount: number | null;
    total: number | null;
  }>;
}

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
      }
    );

    const cleaned = jsonText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: any = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch (err: any) {
      throw new Error(`Failed to parse AI extraction JSON: ${err?.message || 'Invalid JSON format'}`);
    }

    const subtotal = extractNumber(parsed.subtotal);
    const tax = extractNumber(parsed.tax);
    const amount = extractNumber(parsed.amount) ?? extractNumber(parsed.total);

    const data: ExtractedInvoiceData = {
      documentType: 'invoice',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      invoiceNumber: extractString(parsed.invoiceNumber),
      supplierName: extractString(parsed.supplierName),
      supplierGstin: extractString(parsed.supplierGstin) || extractString(parsed.supplierGSTIN),
      supplierEmail: extractString(parsed.supplierEmail),
      supplierPhone: extractString(parsed.supplierPhone),
      invoiceDate: extractString(parsed.invoiceDate),
      dueDate: extractString(parsed.dueDate),
      poNumber: extractString(parsed.poNumber),
      currency: extractString(parsed.currency) || 'INR',
      subtotal,
      tax,
      discount: extractNumber(parsed.discount) || 0,
      amount,
      paymentTerms: extractString(parsed.paymentTerms) || 'Net 15 Days',
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

    return { data, rawJson: cleaned, model };
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
      }
    );

    const cleaned = jsonText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: any = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch (err: any) {
      throw new Error(`Failed to parse AI PO extraction JSON: ${err?.message || 'Invalid JSON'}`);
    }

    const subtotal = extractNumber(parsed.subtotal);
    const tax = extractNumber(parsed.tax);
    const total = extractNumber(parsed.total) ?? extractNumber(parsed.amount);

    const data: ExtractedPOData = {
      documentType: 'purchase_order',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      poNumber: extractString(parsed.poNumber),
      supplierName: extractString(parsed.supplierName),
      supplierGstin: extractString(parsed.supplierGstin),
      supplierEmail: extractString(parsed.supplierEmail),
      poDate: extractString(parsed.poDate),
      expectedDeliveryDate: extractString(parsed.expectedDeliveryDate),
      currency: extractString(parsed.currency) || 'INR',
      subtotal,
      tax,
      total,
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

    return { data, rawJson: cleaned, model };
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
      const { jsonText } = await aiService.extractDocumentMedia(fileBuffer, mimeType, context);
      const cleaned = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(cleaned);

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
