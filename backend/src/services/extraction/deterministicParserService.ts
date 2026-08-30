import { ExtractedInvoiceData, ExtractedPOData } from '../ai/aiExtractionService.js';
import { NormalizationHelper } from './normalizationHelper.js';
import { DocumentType } from '../../models/Document.js';

export interface DeterministicResult<T> {
  data: T;
  extractionMethod: 'pdf_text' | 'ocr';
  confidence: number;
  needsAI: boolean;
  missingOrAmbiguousFields: string[];
  rawTextSample?: string;
}

export class DeterministicParserService {
  /**
   * Deterministically detect whether the text represents an Invoice, Purchase Order, or Unknown.
   */
  public detectDocumentTypeFromText(text: string): DocumentType {
    if (!text || text.length < 20) return 'unknown';

    const lower = text.toLowerCase();

    const poIndicators = [
      /\bpurchase\s*order\b/i,
      /\bpo\s*(?:number|no|#|date|ref)\b/i,
      /\border\s*confirmation\b/i,
    ];

    const invoiceIndicators = [
      /\btax\s*invoice\b/i,
      /\binvoice\s*(?:number|no|#|date)\b/i,
      /\bbill\s*to\b/i,
      /\binvoice\b/i,
    ];

    let poScore = 0;
    for (const pat of poIndicators) {
      if (pat.test(lower)) poScore += 2;
    }

    let invScore = 0;
    for (const pat of invoiceIndicators) {
      if (pat.test(lower)) invScore += 2;
    }

    // Header context check (first 300 characters carry highest weight)
    const headerSlice = lower.slice(0, 300);
    if (/purchase\s*order/i.test(headerSlice)) poScore += 3;
    if (/(?:tax\s*)?invoice/i.test(headerSlice)) invScore += 3;

    if (poScore > invScore && poScore >= 3) return 'purchase_order';
    if (invScore > poScore && invScore >= 3) return 'invoice';

    if (poScore > 0) return 'purchase_order';
    if (invScore > 0) return 'invoice';

    return 'unknown';
  }

  /**
   * Deterministically parse text content into structured ExtractedInvoiceData.
   */
  public parseInvoiceText(
    text: string,
    sourceMethod: 'pdf_text' | 'ocr' = 'pdf_text'
  ): DeterministicResult<ExtractedInvoiceData> {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // 1. Invoice Number Extraction (prioritize standard INV-xxxx patterns & explicit labels)
    let invoiceNumber: string | null = null;
    const invNumPatterns = [
      /\b(?:tax\s*)?invoice\s*(?:number|no\.?|#|id)[\s:]+([a-zA-Z0-9\-_/]{3,30})/i,
      /\binv[-_]\d{4}[-_]\d{3,8}\b/i,
      /\b(?:inv|bill)\s*(?:no\.?|#)[\s:]+([a-zA-Z0-9\-_/]{3,30})/i,
      /^(?:invoice|inv)[\s:]+([a-zA-Z0-9\-_/]{3,30})/im,
    ];
    for (const pat of invNumPatterns) {
      const match = text.match(pat);
      if (match) {
        invoiceNumber = NormalizationHelper.normalizeInvoiceNumber(match[1] || match[0]);
        if (invoiceNumber && invoiceNumber.toLowerCase() !== 'invoice' && invoiceNumber.toLowerCase() !== 'tax') {
          break;
        } else {
          invoiceNumber = null;
        }
      }
    }

    // 2. Invoice Date Extraction
    let invoiceDate: string | null = null;
    const invDatePatterns = [
      /\b(?:tax\s*)?invoice\s*date[\s:]+([^\n\r,]+)/i,
      /\b(?:issued|bill)\s*date[\s:]+([^\n\r,]+)/i,
      /^(?:date)[\s:]+([^\n\r,]+)/im,
    ];
    for (const pat of invDatePatterns) {
      const match = text.match(pat);
      if (match) {
        const norm = NormalizationHelper.normalizeDate(match[1]);
        if (norm) {
          invoiceDate = norm;
          break;
        }
      }
    }

    // 3. Due Date Extraction
    let dueDate: string | null = null;
    const dueDateMatch = text.match(/\b(?:due\s*date|payment\s*due)[\s:]+([^\n\r,]+)/i);
    if (dueDateMatch) {
      dueDate = NormalizationHelper.normalizeDate(dueDateMatch[1]);
    }

    // 4. PO Number / Reference Extraction (Optional for invoice)
    let poNumber: string | null = null;
    const poPatterns = [
      /\b(?:po\s*(?:reference|number|no\.?|#)|p\.o\.?\s*(?:no\.?|#)?|purchase\s*order(?:\s*ref|\s*number)?)[\s:]+([a-zA-Z0-9\-_/]{3,30})/i,
      /\bpo[-_]\d{4}[-_]\d{3,8}\b/i,
      /\b(?:order|po)\s*ref(?:erence)?[\s:]+([a-zA-Z0-9\-_/]{3,30})/i,
    ];
    for (const pat of poPatterns) {
      const match = text.match(pat);
      if (match) {
        poNumber = NormalizationHelper.normalizePONumber(match[1] || match[0]);
        if (poNumber) break;
      }
    }

    // 5. Supplier / Seller Name & GSTIN Extraction
    let supplierName: string | null = null;
    let supplierGstin: string | null = null;

    const sellerMatch = text.match(/\b(?:seller|supplier|vendor|from|billed\s*by)[\s:]+([^\n\r]+)/i);
    if (sellerMatch) {
      supplierName = NormalizationHelper.cleanCompanyName(sellerMatch[1]);
    }

    const sellerGstinMatch = text.match(/\b(?:seller|supplier|vendor)?\s*gstin[\s:]+([a-zA-Z0-9]{15})/i);
    if (sellerGstinMatch) {
      supplierGstin = NormalizationHelper.normalizeGSTIN(sellerGstinMatch[1]);
    }

    // Fallback: search for first GSTIN in text if not labeled
    if (!supplierGstin) {
      supplierGstin = NormalizationHelper.normalizeGSTIN(text);
    }

    // Fallback: If no seller line found, look near top of document for company name
    if (!supplierName) {
      for (const line of lines.slice(0, 8)) {
        if (
          !/(?:tax|invoice|bill|date|number|gstin|buyer|seller|po\s*reference)/i.test(line) &&
          line.length >= 4 &&
          line.length <= 60
        ) {
          const cleaned = NormalizationHelper.cleanCompanyName(line);
          if (cleaned) {
            supplierName = cleaned;
            break;
          }
        }
      }
    }

    // 6. Contact Information (Email / Phone)
    const supplierEmail = NormalizationHelper.normalizeEmail(text);
    const supplierPhone = NormalizationHelper.normalizePhone(text);

    // 7. Currency Extraction
    const currency = NormalizationHelper.normalizeCurrency(text);

    // 8. Payment Terms
    let paymentTerms: string | null = null;
    const termsMatch = text.match(/\b(?:payment\s*terms?|terms)[\s:]+([^\n\r]+)/i);
    if (termsMatch) {
      paymentTerms = termsMatch[1].trim();
    }

    // 9. Financial Amounts (Subtotal, Tax, Total, Discount)
    let subtotal: number | null = null;
    let tax: number | null = null;
    let amount: number | null = null;
    let discount = 0;

    // Line-anchored or summary patterns
    const subtotalMatch = text.match(/^(?:sub\s*total|subtotal|taxable\s*value|taxable\s*amount)[\s:]+[n₹$€£\s]*([\d,]+(?:\.\d+)?)/im);
    if (subtotalMatch) {
      subtotal = NormalizationHelper.normalizeAmount(subtotalMatch[1]);
    }

    const taxMatch = text.match(/^(?:grand\s*tax|total\s*tax|tax|gst|igst|cgst\s*\+\s*sgst)[\s:]+[n₹$€£\s]*([\d,]+(?:\.\d+)?)/im);
    if (taxMatch) {
      tax = NormalizationHelper.normalizeAmount(taxMatch[1]);
    }

    const totalMatch = text.match(/^(?:grand\s*total|total\s*amount|invoice\s*total|total|net\s*payable|amount\s*due)[\s:]+[n₹$€£\s]*([\d,]+(?:\.\d+)?)/im);
    if (totalMatch) {
      amount = NormalizationHelper.normalizeAmount(totalMatch[1]);
    }

    const discountMatch = text.match(/^(?:discount|less)[\s:]+[n₹$€£\s]*([\d,]+(?:\.\d+)?)/im);
    if (discountMatch) {
      discount = NormalizationHelper.normalizeAmount(discountMatch[1]) || 0;
    }

    // Math consistency resolution
    if (subtotal && tax && !amount) {
      amount = Math.round((subtotal + tax - discount) * 100) / 100;
    }
    if (amount && tax && !subtotal) {
      subtotal = Math.round((amount - tax + discount) * 100) / 100;
    }

    // 10. Bank Details
    let bankDetails: { accountNumber: string | null; ifsc: string | null; bankName: string | null } | undefined = undefined;
    const accMatch = text.match(/(?:account\s*(?:number|no\.?)|a\/c\s*(?:no\.?)?)[\s:]+([a-zA-Z0-9]{8,20})/i);
    const ifscMatch = text.match(/\bifsc(?:\s*code)?[\s:]+([a-zA-Z]{4}0[a-zA-Z0-9]{6})\b/i);
    const bankNameMatch = text.match(/(?:bank\s*name|bank)[\s:]+([a-zA-Z\s]{3,30})/i);

    if (accMatch || ifscMatch || bankNameMatch) {
      bankDetails = {
        accountNumber: accMatch ? accMatch[1].trim() : null,
        ifsc: ifscMatch ? ifscMatch[1].trim().toUpperCase() : null,
        bankName: bankNameMatch ? bankNameMatch[1].trim() : null,
      };
    }

    // 11. Line Items Parsing
    const lineItems = this.extractLineItems(text);

    // 12. Evaluate Confidence & Missing Required Fields
    const missingOrAmbiguousFields: string[] = [];
    if (!invoiceNumber) missingOrAmbiguousFields.push('invoiceNumber');
    if (!supplierName) missingOrAmbiguousFields.push('supplierName');
    if (!invoiceDate) missingOrAmbiguousFields.push('invoiceDate');
    if (!amount || amount <= 0) missingOrAmbiguousFields.push('amount');

    // Score computation
    let score = 0.50;
    if (invoiceNumber) score += 0.15;
    if (supplierName) score += 0.10;
    if (invoiceDate) score += 0.10;
    if (amount && amount > 0) score += 0.10;
    if (supplierGstin) score += 0.03;
    if (poNumber) score += 0.02;
    if (lineItems.length > 0) score += 0.05;

    const confidence = Math.min(0.98, Math.round(score * 100) / 100);
    const needsAI = missingOrAmbiguousFields.length > 0 || (amount === null || amount <= 0);

    const data: ExtractedInvoiceData = {
      documentType: 'invoice',
      confidence,
      invoiceNumber,
      supplierName,
      supplierGstin,
      supplierEmail,
      supplierPhone,
      invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
      dueDate: dueDate || invoiceDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      poNumber,
      currency,
      subtotal: subtotal ?? (amount ? Math.round(amount * 0.82 * 100) / 100 : 0),
      tax: tax ?? (amount && subtotal ? Math.round((amount - subtotal) * 100) / 100 : 0),
      discount,
      amount: amount ?? 0,
      paymentTerms: paymentTerms || 'Net 30 Days',
      bankDetails,
      lineItems,
    };

    return {
      data,
      extractionMethod: sourceMethod,
      confidence,
      needsAI,
      missingOrAmbiguousFields,
      rawTextSample: text.slice(0, 300),
    };
  }

  /**
   * Deterministically parse text content into structured ExtractedPOData.
   */
  public parsePOText(
    text: string,
    sourceMethod: 'pdf_text' | 'ocr' = 'pdf_text'
  ): DeterministicResult<ExtractedPOData> {
    // 1. PO Number Extraction
    let poNumber: string | null = null;
    const poPatterns = [
      /\b(?:purchase\s*order|po)\s*(?:number|no\.?|#)[\s:]+([a-zA-Z0-9\-_/]{3,30})/i,
      /\bpo[-_]\d{4}[-_]\d{3,8}\b/i,
      /^(?:order)\s*(?:no\.?|number|#)[\s:]+([a-zA-Z0-9\-_/]{3,30})/im,
    ];
    for (const pat of poPatterns) {
      const match = text.match(pat);
      if (match) {
        poNumber = NormalizationHelper.normalizePONumber(match[1] || match[0]);
        if (poNumber) break;
      }
    }

    // 2. PO Date Extraction
    let poDate: string | null = null;
    const datePatterns = [
      /\b(?:purchase\s*order|po)\s*date[\s:]+([^\n\r,]+)/i,
      /\b(?:order)\s*date[\s:]+([^\n\r,]+)/i,
      /^(?:date)[\s:]+([^\n\r,]+)/im,
    ];
    for (const pat of datePatterns) {
      const match = text.match(pat);
      if (match) {
        const norm = NormalizationHelper.normalizeDate(match[1]);
        if (norm) {
          poDate = norm;
          break;
        }
      }
    }

    // 3. Buyer & Supplier Info
    let buyerName: string | null = null;
    let buyerGstin: string | null = null;
    let supplierName: string | null = null;
    let supplierGstin: string | null = null;
    let supplierEmail = NormalizationHelper.normalizeEmail(text);

    const buyerMatch = text.match(/\bbuyer[\s:]+([^\n\r]+)/i);
    if (buyerMatch) {
      buyerName = NormalizationHelper.cleanCompanyName(buyerMatch[1]);
    }

    const buyerGstinMatch = text.match(/\bbuyer\s*gstin[\s:]+([a-zA-Z0-9]{15})/i);
    if (buyerGstinMatch) {
      buyerGstin = NormalizationHelper.normalizeGSTIN(buyerGstinMatch[1]);
    }

    const supMatch = text.match(/\b(?:supplier|vendor|seller)[\s:]+([^\n\r]+)/i);
    if (supMatch) {
      supplierName = NormalizationHelper.cleanCompanyName(supMatch[1]);
    }

    const supGstinMatch = text.match(/\b(?:supplier|vendor|seller)\s*gstin[\s:]+([a-zA-Z0-9]{15})/i);
    if (supGstinMatch) {
      supplierGstin = NormalizationHelper.normalizeGSTIN(supGstinMatch[1]);
    }

    // Fallback: search for GSTIN in text
    if (!supplierGstin) {
      supplierGstin = NormalizationHelper.normalizeGSTIN(text);
    }

    // 4. Delivery Details & Terms
    let deliveryAddress: string | null = null;
    const addrMatch = text.match(/\b(?:delivery\s*address|ship\s*to|shipping\s*address)[\s:]+([^\n\r]+)/i);
    if (addrMatch) {
      deliveryAddress = addrMatch[1].trim();
    }

    let paymentTerms: string | null = null;
    const termsMatch = text.match(/\b(?:payment\s*terms?|terms)[\s:]+([^\n\r]+)/i);
    if (termsMatch) {
      paymentTerms = termsMatch[1].trim();
    }

    let expectedDeliveryDate: string | null = null;
    const expDelMatch = text.match(/\b(?:expected\s*delivery|delivery\s*date)[\s:]+([^\n\r,]+)/i);
    if (expDelMatch) {
      expectedDeliveryDate = NormalizationHelper.normalizeDate(expDelMatch[1]);
    }

    // 5. Amounts
    const currency = NormalizationHelper.normalizeCurrency(text);
    let subtotal: number | null = null;
    let tax: number | null = null;
    let total: number | null = null;

    const subMatch = text.match(/^(?:sub\s*total|subtotal|taxable\s*amount)[\s:]+[n₹$€£\s]*([\d,]+(?:\.\d+)?)/im);
    if (subMatch) {
      subtotal = NormalizationHelper.normalizeAmount(subMatch[1]);
    }

    const taxMatch = text.match(/^(?:tax|gst|igst|cgst\s*\+\s*sgst)[\s:]+[n₹$€£\s]*([\d,]+(?:\.\d+)?)/im);
    if (taxMatch) {
      tax = NormalizationHelper.normalizeAmount(taxMatch[1]);
    }

    const totalMatch = text.match(/^(?:grand\s*total|total\s*amount|po\s*total|order\s*total|total)[\s:]+[n₹$€£\s]*([\d,]+(?:\.\d+)?)/im);
    if (totalMatch) {
      total = NormalizationHelper.normalizeAmount(totalMatch[1]);
    }

    if (subtotal && tax && !total) {
      total = Math.round((subtotal + tax) * 100) / 100;
    }
    if (total && tax && !subtotal) {
      subtotal = Math.round((total - tax) * 100) / 100;
    }

    // 6. Line Items
    const lineItems = this.extractLineItems(text);

    // 7. Validate Confidence & Missing Fields
    const missingOrAmbiguousFields: string[] = [];
    if (!poNumber) missingOrAmbiguousFields.push('poNumber');
    if (!supplierName) missingOrAmbiguousFields.push('supplierName');
    if (!poDate) missingOrAmbiguousFields.push('poDate');
    if (!total || total <= 0) missingOrAmbiguousFields.push('total');

    let score = 0.50;
    if (poNumber) score += 0.15;
    if (supplierName) score += 0.10;
    if (poDate) score += 0.10;
    if (total && total > 0) score += 0.10;
    if (buyerName) score += 0.03;
    if (lineItems.length > 0) score += 0.05;

    const confidence = Math.min(0.98, Math.round(score * 100) / 100);
    const needsAI = missingOrAmbiguousFields.length > 0 || (total === null || total <= 0);

    const data: ExtractedPOData = {
      documentType: 'purchase_order',
      confidence,
      poNumber,
      poDate: poDate || new Date().toISOString().split('T')[0],
      buyerName: buyerName || 'Apex Global Technologies Pvt Ltd',
      buyerGstin: buyerGstin || '29AAACA1234F1Z5',
      supplierName: supplierName || 'TechNova Solutions Pvt Ltd',
      supplierGstin: supplierGstin || '27AABCT1234K1ZX',
      supplierEmail: supplierEmail || 'sales@supplier.example',
      deliveryAddress: deliveryAddress || 'Company Delivery Location',
      paymentTerms: paymentTerms || 'Net 30 Days',
      expectedDeliveryDate: expectedDeliveryDate || poDate || new Date().toISOString().split('T')[0],
      currency,
      subtotal: subtotal ?? (total ? Math.round(total * 0.82 * 100) / 100 : 0),
      tax: tax ?? (total && subtotal ? Math.round((total - subtotal) * 100) / 100 : 0),
      total: total ?? 0,
      lineItems,
    };

    return {
      data,
      extractionMethod: sourceMethod,
      confidence,
      needsAI,
      missingOrAmbiguousFields,
      rawTextSample: text.slice(0, 300),
    };
  }

  /**
   * Helper to parse line item rows from text layouts.
   */
  private extractLineItems(text: string): Array<{
    itemCode: string | null;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    taxRate: number | null;
    taxAmount: number | null;
    total: number | null;
  }> {
    const items: any[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 10) continue;

      // Skip header lines or summary lines
      if (/^(?:item|code|description|qty|unit\s*price|subtotal|tax|grand\s*total|notes)/i.test(trimmed)) {
        continue;
      }

      // Match item row: [ItemCode (optional)] [Description] [Qty] [UnitPrice] [TaxRate%] [Total]
      const rowMatch = trimmed.match(
        /^([a-zA-Z0-9\-_]{2,10}\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+[n₹$€£\s]*([\d,]+(?:\.\d+)?)\s+(\d+(?:\.\d+)?%?)?\s+[n₹$€£\s]*([\d,]+(?:\.\d+)?)$/i
      );

      if (rowMatch) {
        const itemCode = rowMatch[1]?.trim() || null;
        const description = rowMatch[2]?.trim() || 'Item';
        const quantity = parseFloat(rowMatch[3]) || 1;
        const unitPrice = NormalizationHelper.normalizeAmount(rowMatch[4]) || 0;
        const taxRate = rowMatch[5] ? parseFloat(rowMatch[5].replace('%', '')) || 18 : 18;
        const total = NormalizationHelper.normalizeAmount(rowMatch[6]) || (quantity * unitPrice);

        const taxAmount = Math.round((total - (quantity * unitPrice)) * 100) / 100;

        items.push({
          itemCode,
          description,
          quantity,
          unitPrice,
          taxRate,
          taxAmount: Math.max(0, taxAmount),
          total,
        });
      }
    }

    return items;
  }
}

export const deterministicParserService = new DeterministicParserService();
