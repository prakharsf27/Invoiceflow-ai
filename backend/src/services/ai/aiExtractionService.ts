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

class AIExtractionService {
  /**
   * Extract invoice fields using Gemini multimodal capabilities.
   */
  public async extractInvoiceDocument(
    fileBuffer: Buffer,
    mimeType: string,
    context?: { companyId?: string; userId?: string }
  ): Promise<{ data: ExtractedInvoiceData; rawJson: string; model: string }> {
    const { jsonText, model } = await aiService.extractDocumentMedia(
      fileBuffer,
      mimeType,
      context
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

    const data: ExtractedInvoiceData = {
      documentType: 'invoice',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      invoiceNumber: typeof parsed.invoiceNumber === 'string' && parsed.invoiceNumber.trim() ? parsed.invoiceNumber.trim() : (parsed.invoiceNumber?.value || null),
      supplierName: typeof parsed.supplierName === 'string' && parsed.supplierName.trim() ? parsed.supplierName.trim() : (parsed.supplierName?.value || null),
      supplierGstin: typeof parsed.supplierGstin === 'string' && parsed.supplierGstin.trim() ? parsed.supplierGstin.trim() : (parsed.supplierGSTIN?.value || null),
      supplierEmail: typeof parsed.supplierEmail === 'string' ? parsed.supplierEmail.trim() : null,
      supplierPhone: typeof parsed.supplierPhone === 'string' ? parsed.supplierPhone.trim() : null,
      invoiceDate: typeof parsed.invoiceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.invoiceDate) ? parsed.invoiceDate : (parsed.invoiceDate?.value || null),
      dueDate: typeof parsed.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate) ? parsed.dueDate : (parsed.dueDate?.value || null),
      poNumber: typeof parsed.poNumber === 'string' && parsed.poNumber.trim() ? parsed.poNumber.trim() : (parsed.poNumber?.value || null),
      currency: typeof parsed.currency === 'string' ? parsed.currency : (parsed.currency?.value || 'INR'),
      subtotal: typeof parsed.subtotal === 'number' ? parsed.subtotal : (parsed.subtotal?.value || null),
      tax: typeof parsed.tax === 'number' ? parsed.tax : (parsed.tax?.value || null),
      discount: typeof parsed.discount === 'number' ? parsed.discount : 0,
      amount: typeof parsed.amount === 'number' ? parsed.amount : (parsed.total?.value || parsed.total || null),
      paymentTerms: typeof parsed.paymentTerms === 'string' ? parsed.paymentTerms : (parsed.paymentTerms?.value || 'Net 15 Days'),
      bankDetails: {
        accountNumber: parsed.bankDetails?.accountNumber || null,
        ifsc: parsed.bankDetails?.ifsc || null,
        bankName: parsed.bankDetails?.bankName || null,
      },
      lineItems: Array.isArray(parsed.lineItems)
        ? parsed.lineItems.map((item: any) => ({
            description: String(item.description || 'Item').trim(),
            quantity: typeof item.quantity === 'number' ? item.quantity : null,
            unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : null,
            taxRate: typeof item.taxRate === 'number' ? item.taxRate : null,
            taxAmount: typeof item.taxAmount === 'number' ? item.taxAmount : null,
            total: typeof item.total === 'number' ? item.total : (typeof item.amount === 'number' ? item.amount : null),
          }))
        : [],
    };

    return { data, rawJson: cleaned, model };
  }

  /**
   * Extract Purchase Order fields using Gemini multimodal capabilities.
   */
  public async extractPODocument(
    fileBuffer: Buffer,
    mimeType: string,
    context?: { companyId?: string; userId?: string }
  ): Promise<{ data: ExtractedPOData; rawJson: string; model: string }> {
    const { jsonText, model } = await aiService.extractDocumentMedia(
      fileBuffer,
      mimeType,
      context
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

    const data: ExtractedPOData = {
      documentType: 'purchase_order',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      poNumber: typeof parsed.poNumber === 'string' && parsed.poNumber.trim() ? parsed.poNumber.trim() : null,
      supplierName: typeof parsed.supplierName === 'string' && parsed.supplierName.trim() ? parsed.supplierName.trim() : null,
      supplierGstin: typeof parsed.supplierGstin === 'string' ? parsed.supplierGstin.trim() : null,
      supplierEmail: typeof parsed.supplierEmail === 'string' ? parsed.supplierEmail.trim() : null,
      poDate: typeof parsed.poDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.poDate) ? parsed.poDate : null,
      expectedDeliveryDate: typeof parsed.expectedDeliveryDate === 'string' ? parsed.expectedDeliveryDate : null,
      currency: typeof parsed.currency === 'string' ? parsed.currency : 'INR',
      subtotal: typeof parsed.subtotal === 'number' ? parsed.subtotal : null,
      tax: typeof parsed.tax === 'number' ? parsed.tax : null,
      total: typeof parsed.total === 'number' ? parsed.total : (typeof parsed.amount === 'number' ? parsed.amount : null),
      lineItems: Array.isArray(parsed.lineItems)
        ? parsed.lineItems.map((item: any) => ({
            description: String(item.description || 'Item').trim(),
            quantity: typeof item.quantity === 'number' ? item.quantity : null,
            unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : null,
            taxRate: typeof item.taxRate === 'number' ? item.taxRate : null,
            taxAmount: typeof item.taxAmount === 'number' ? item.taxAmount : null,
            total: typeof item.total === 'number' ? item.total : (typeof item.amount === 'number' ? item.amount : null),
          }))
        : [],
    };

    return { data, rawJson: cleaned, model };
  }

  /**
   * Fallback classification for unknown documents using Gemini AI.
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
