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

    // 1. Invoice Number Extraction
    let invoiceNumber: string | null = null;
    const invNumPatterns = [
      /\b(?:tax\s*)?invoice\s*(?:number|no\.?|#|id)?[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
      /\binv[-_]\d{4}[-_]\d{3,8}\b/i,
      /\b(?:inv|bill)\s*(?:no\.?|#)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
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
      /\b(?:tax\s*)?invoice\s*date[\s:]*(?:[\r\n]+\s*)?([^\n\r,]+)/i,
      /\b(?:issued|bill)\s*date[\s:]*(?:[\r\n]+\s*)?([^\n\r,]+)/i,
      /\bdate[\s:]*(?:[\r\n]+\s*)?([^\n\r,]+)/i,
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

    // 3. Due Date Extraction (MUST be strictly from explicit labels; NEVER default to invoiceDate)
    let dueDate: string | null = null;
    const dueDateMatch = text.match(/\b(?:due\s*date|payment\s*due\s*date|payment\s*due)[\s:]*(?:[\r\n]+\s*)?([^\n\r,]+)/i);
    if (dueDateMatch) {
      dueDate = NormalizationHelper.normalizeDate(dueDateMatch[1]);
    }

    // 4. PO Number / Reference Extraction (Optional for invoice)
    let poNumber: string | null = null;
    const poPatterns = [
      /\b(?:po\s*(?:reference|number|no\.?|#)|p\.o\.?\s*(?:no\.?|#)?|purchase\s*order(?:\s*ref|\s*number)?)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
      /\bpo[-_]\d{4}[-_]\d{3,8}\b/i,
      /\b(?:order|po)\s*ref(?:erence)?[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
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

    const sellerMatch = text.match(/\b(?:seller|supplier|vendor|from|billed\s*by)[\s:]*(?:[\r\n]+\s*)?([^\n\r]+)/i);
    if (sellerMatch) {
      supplierName = NormalizationHelper.cleanCompanyName(sellerMatch[1]);
    }

    const sellerGstinMatch = text.match(/\b(?:seller|supplier|vendor)?\s*gstin[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9]{15})/i);
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
    const termsMatch = text.match(/\b(?:payment\s*terms?|terms)[\s:]*(?:[\r\n]+\s*)?([^\n\r]+)/i);
    if (termsMatch) {
      paymentTerms = termsMatch[1].trim();
    }

    // 9. Financial Amounts (Subtotal, Tax, Total, Discount)
    let subtotal: number | null = null;
    let tax: number | null = null;
    let amount: number | null = null;
    let discount = 0;

    // Line-anchored or summary patterns
    const subtotalMatch = text.match(/(?:sub\s*total|subtotal|taxable\s*value|taxable\s*amount)[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i);
    if (subtotalMatch) {
      subtotal = NormalizationHelper.normalizeAmount(subtotalMatch[1]);
    }

    const taxMatch = text.match(/(?:grand\s*tax|total\s*tax|tax|gst|igst|cgst\s*\+\s*sgst)[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i);
    if (taxMatch) {
      tax = NormalizationHelper.normalizeAmount(taxMatch[1]);
    }

    const totalMatch = text.match(/(?:grand\s*total|invoice\s*total|total\s*amount|net\s*payable|amount\s*due)[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i)
      || text.match(/(?:^|\n)\s*(?:invoice\s*)?total[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i);
    if (totalMatch) {
      amount = NormalizationHelper.normalizeAmount(totalMatch[1]);
    }

    const discountMatch = text.match(/(?:discount|less)[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i);
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

    // 10. Bank Details (Strictly null if absent — never invent or use defaults)
    let bankDetails: { accountNumber: string | null; ifsc: string | null; bankName: string | null } = {
      accountNumber: null,
      ifsc: null,
      bankName: null,
    };
    const accMatch = text.match(/(?:account\s*(?:number|no\.?)|a\/c\s*(?:no\.?)?)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9]{8,20})/i);
    const ifscMatch = text.match(/\bifsc(?:\s*code)?[\s:]*(?:[\r\n]+\s*)?([a-zA-Z]{4}0[a-zA-Z0-9]{6})\b/i);
    const bankNameMatch = text.match(/(?:bank\s*name|bank)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z\s]{3,30})/i);

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
    if (lineItems.length > 0) score += 0.08;

    const confidence = Math.min(0.98, Math.round(score * 100) / 100);
    const needsAI = missingOrAmbiguousFields.length > 0 || (amount === null || amount <= 0);

    const data: ExtractedInvoiceData = {
      documentType: 'invoice',
      confidence,
      invoiceNumber,
      supplierName,
      supplierGstin: supplierGstin || null,
      supplierEmail: supplierEmail || null,
      supplierPhone: supplierPhone || null,
      invoiceDate: invoiceDate || null,
      dueDate: dueDate || null,
      poNumber: poNumber || null,
      currency,
      subtotal: subtotal ?? null,
      tax: tax ?? null,
      discount,
      amount: amount ?? 0,
      paymentTerms: paymentTerms || null,
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
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // 1. PO Number Extraction
    let poNumber: string | null = null;
    const poNumPatterns = [
      /\b(?:purchase\s*order|po)\s*(?:number|no\.?|#|id)?[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
      /\bpo[-_]\d{4}[-_]\d{3,8}\b/i,
      /^(?:po|purchase\s*order)[\s:]+([a-zA-Z0-9\-_/]{3,30})/im,
    ];
    for (const pat of poNumPatterns) {
      const match = text.match(pat);
      if (match) {
        poNumber = NormalizationHelper.normalizePONumber(match[1] || match[0]);
        if (poNumber) break;
      }
    }

    // 2. PO Date Extraction
    let poDate: string | null = null;
    const dateMatch = text.match(/\b(?:order|po|issued)?\s*date[\s:]*(?:[\r\n]+\s*)?([^\n\r,]+)/i);
    if (dateMatch) {
      poDate = NormalizationHelper.normalizeDate(dateMatch[1]);
    }

    // 3. Buyer & Supplier Info
    let buyerName: string | null = null;
    let buyerGstin: string | null = null;
    let supplierName: string | null = null;
    let supplierGstin: string | null = null;

    const buyerMatch = text.match(/\b(?:buyer|bill\s*to|ship\s*to)[\s:]*(?:[\r\n]+\s*)?([^\n\r]+)/i);
    if (buyerMatch) {
      buyerName = NormalizationHelper.cleanCompanyName(buyerMatch[1]);
    }

    const sellerMatch = text.match(/\b(?:supplier|vendor|seller|to)[\s:]*(?:[\r\n]+\s*)?([^\n\r]+)/i);
    if (sellerMatch) {
      supplierName = NormalizationHelper.cleanCompanyName(sellerMatch[1]);
    }

    // Fallback: If no explicit supplier label, check headers
    if (!supplierName) {
      for (const line of lines.slice(0, 6)) {
        if (!/(?:purchase|order|po|date|buyer|gstin)/i.test(line) && line.length >= 4 && line.length <= 60) {
          const cleaned = NormalizationHelper.cleanCompanyName(line);
          if (cleaned) {
            supplierName = cleaned;
            break;
          }
        }
      }
    }

    const allGstins = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/g) || [];
    if (allGstins.length >= 2) {
      buyerGstin = allGstins[0] || null;
      supplierGstin = allGstins[1] || null;
    } else if (allGstins.length === 1) {
      supplierGstin = allGstins[0] || null;
    }

    const supplierEmail = NormalizationHelper.normalizeEmail(text);
    const currency = NormalizationHelper.normalizeCurrency(text);

    // 4. Terms & Delivery Info
    let paymentTerms: string | null = null;
    const termsMatch = text.match(/\b(?:payment\s*terms?|terms)[\s:]*(?:[\r\n]+\s*)?([^\n\r]+)/i);
    if (termsMatch) {
      paymentTerms = termsMatch[1].trim();
    }

    let expectedDeliveryDate: string | null = null;
    const delMatch = text.match(/\b(?:expected\s*delivery|delivery\s*date)[\s:]*(?:[\r\n]+\s*)?([^\n\r,]+)/i);
    if (delMatch) {
      expectedDeliveryDate = NormalizationHelper.normalizeDate(delMatch[1]);
    }

    let deliveryAddress: string | null = null;
    const addrMatch = text.match(/\b(?:delivery\s*address|ship\s*to\s*address)[\s:]*(?:[\r\n]+\s*)?([^\n\r]+)/i);
    if (addrMatch) {
      deliveryAddress = addrMatch[1].trim();
    }

    // 5. Financial Totals
    let subtotal: number | null = null;
    let tax: number | null = null;
    let total: number | null = null;

    const subMatch = text.match(/(?:sub\s*total|subtotal|taxable\s*amount)[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i);
    if (subMatch) {
      subtotal = NormalizationHelper.normalizeAmount(subMatch[1]);
    }

    const taxMatch = text.match(/(?:tax|gst|igst|cgst\s*\+\s*sgst)[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i);
    if (taxMatch) {
      tax = NormalizationHelper.normalizeAmount(taxMatch[1]);
    }

    const totalMatch = text.match(/(?:grand\s*total|po\s*total|order\s*total|total\s*amount)[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i)
      || text.match(/(?:^|\n)\s*(?:po\s*|order\s*)?total[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i);
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
    if (lineItems.length > 0) score += 0.08;

    const confidence = Math.min(0.98, Math.round(score * 100) / 100);
    const needsAI = missingOrAmbiguousFields.length > 0 || (total === null || total <= 0);

    const data: ExtractedPOData = {
      documentType: 'purchase_order',
      confidence,
      poNumber,
      poDate: poDate || null,
      buyerName: buyerName || null,
      buyerGstin: buyerGstin || null,
      supplierName: supplierName || null,
      supplierGstin: supplierGstin || null,
      supplierEmail: supplierEmail || null,
      deliveryAddress: deliveryAddress || null,
      paymentTerms: paymentTerms || null,
      expectedDeliveryDate: expectedDeliveryDate || null,
      currency,
      subtotal: subtotal ?? null,
      tax: tax ?? null,
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
   * Supports:
   * - 5-value tail: [Item Code/Num] [Description] [Qty] [UnitPrice] [TaxRate%] [TaxAmount] [Total]
   * - 4-value tail: [Item Code/Num] [Description] [Qty] [UnitPrice] [TaxRate%] [Total]
   * - 3-value tail: [Item Code/Num] [Description] [Qty] [UnitPrice] [Total]
   * - Multi-line block layouts
   * - Normalizes all PDF artifact glyphs (■, ▪, ●, \uFFFD, \u25A0, \u25AA, ₹, $, €, £)
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
    const items: Array<{
      itemCode: string | null;
      description: string;
      quantity: number | null;
      unitPrice: number | null;
      taxRate: number | null;
      taxAmount: number | null;
      total: number | null;
    }> = [];

    const lines = text.split('\n');

    // Strategy 1: Tabular row-by-row parsing
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.length < 6) continue;

      // Skip header or summary lines
      if (/^(?:item|code|description|qty|unit\s*price|subtotal|sub\s*total|tax\b|gst\b|grand\s*total|total\b|notes\b|payment\s*terms|terms\b|bank\b|seller|buyer|supplier)/i.test(trimmed)) {
        continue;
      }

      // Pre-clean currency glyphs and artifacts
      const cleaned = trimmed
        .replace(/[\u25A0\u25AA\uFFFD■▪●₹$€£]/g, ' ')
        .replace(/\b[nN](?=\d)/g, '')
        .replace(/\bRs\.?\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // 1A. 5-value numeric tail: [Code/Num] [Description] [Qty] [UnitPrice] [TaxRate%] [TaxAmount] [Total]
      let m = cleaned.match(/^(?:(\d+[.)]|[A-Za-z0-9\-_]{2,12})\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d+(?:\.\d+)?%?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$/i);
      if (m) {
        const itemCode = m[1] ? m[1].replace(/[.)]/g, '').trim() : null;
        let desc = m[2].trim();
        desc = desc.replace(/^\d+[.)]\s*/, '');
        const qty = parseFloat(m[3]) || 1;
        const unitPrice = NormalizationHelper.normalizeAmount(m[4]) || 0;
        const taxRate = m[5] ? parseFloat(m[5].replace('%', '')) || 18 : 18;
        const taxAmount = NormalizationHelper.normalizeAmount(m[6]) || 0;
        const total = NormalizationHelper.normalizeAmount(m[7]) || (qty * unitPrice);

        items.push({
          itemCode,
          description: desc,
          quantity: qty,
          unitPrice,
          taxRate,
          taxAmount,
          total,
        });
        continue;
      }

      // 1B. 4-value numeric tail: [Code/Num] [Description] [Qty] [UnitPrice] [TaxRate%] [Total]
      m = cleaned.match(/^(?:(\d+[.)]|[A-Za-z0-9\-_]{2,12})\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d+(?:\.\d+)?%?)\s+([\d,]+(?:\.\d+)?)$/i);
      if (m) {
        const itemCode = m[1] ? m[1].replace(/[.)]/g, '').trim() : null;
        let desc = m[2].trim();
        desc = desc.replace(/^\d+[.)]\s*/, '');
        const qty = parseFloat(m[3]) || 1;
        const unitPrice = NormalizationHelper.normalizeAmount(m[4]) || 0;
        const taxRate = m[5] ? parseFloat(m[5].replace('%', '')) || 18 : 18;
        const total = NormalizationHelper.normalizeAmount(m[6]) || (qty * unitPrice);
        const taxAmount = Math.max(0, Math.round((total - (qty * unitPrice)) * 100) / 100);

        items.push({
          itemCode,
          description: desc,
          quantity: qty,
          unitPrice,
          taxRate,
          taxAmount,
          total,
        });
        continue;
      }

      // 1C. 3-value numeric tail: [Code/Num] [Description] [Qty] [UnitPrice] [Total]
      m = cleaned.match(/^(?:(\d+[.)]|[A-Za-z0-9\-_]{2,12})\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$/i);
      if (m) {
        const itemCode = m[1] ? m[1].replace(/[.)]/g, '').trim() : null;
        let desc = m[2].trim();
        desc = desc.replace(/^\d+[.)]\s*/, '');
        const qty = parseFloat(m[3]) || 1;
        const unitPrice = NormalizationHelper.normalizeAmount(m[4]) || 0;
        const total = NormalizationHelper.normalizeAmount(m[5]) || (qty * unitPrice);
        const taxAmount = Math.max(0, Math.round((total - (qty * unitPrice)) * 100) / 100);

        items.push({
          itemCode,
          description: desc,
          quantity: qty,
          unitPrice,
          taxRate: 18,
          taxAmount,
          total,
        });
        continue;
      }
    }

    // Strategy 2: Multi-line / Block parsing (if Strategy 1 found 0 items)
    if (items.length === 0) {
      const blockRegex = /(?:(\d+)[.)]\s+)?([A-Za-z0-9\s\-_.&/]{3,60}?)\s*(?:[\r\n]+|\s+)Qty:\s*(\d+(?:\.\d+)?)\s*(?:[\r\n]+|\s+)Unit\s*Price:\s*[^\d\s]*([\d,]+(?:\.\d+)?)\s*(?:[\r\n]+|\s+)Tax\s*Rate:\s*(\d+(?:\.\d+)?%?)\s*(?:[\r\n]+|\s+)Tax\s*Amount:\s*[^\d\s]*([\d,]+(?:\.\d+)?)\s*(?:[\r\n]+|\s+)Total:\s*[^\d\s]*([\d,]+(?:\.\d+)?)/gi;
      let bMatch;
      while ((bMatch = blockRegex.exec(text)) !== null) {
        const itemCode = bMatch[1] ? bMatch[1].trim() : null;
        let desc = bMatch[2].trim();
        desc = desc.replace(/^\d+[.)]\s*/, '');
        const qty = parseFloat(bMatch[3]) || 1;
        const unitPrice = NormalizationHelper.normalizeAmount(bMatch[4]) || 0;
        const taxRate = bMatch[5] ? parseFloat(bMatch[5].replace('%', '')) || 18 : 18;
        const taxAmount = NormalizationHelper.normalizeAmount(bMatch[6]) || 0;
        const total = NormalizationHelper.normalizeAmount(bMatch[7]) || (qty * unitPrice);

        items.push({
          itemCode,
          description: desc,
          quantity: qty,
          unitPrice,
          taxRate,
          taxAmount,
          total,
        });
      }
    }

    return items;
  }
}

export const deterministicParserService = new DeterministicParserService();
