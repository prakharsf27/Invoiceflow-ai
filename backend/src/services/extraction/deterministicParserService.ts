import { ExtractedInvoiceData, ExtractedPOData } from '../ai/aiExtractionService.js';
import { NormalizationHelper } from './normalizationHelper.js';
import { DocumentType } from '../../models/Document.js';
import { ExtractionQualityEvaluator, ExtractionQualityResult } from './extractionQualityEvaluator.js';

export interface DeterministicResult<T> {
  data: T;
  extractionMethod: 'pdf_text' | 'ocr';
  confidence: number;
  quality: 'high' | 'incomplete' | 'ambiguous';
  needsAI: boolean;
  missingOrAmbiguousFields: string[];
  warnings: string[];
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

    // 1. Invoice Number Extraction (Strictly labeled)
    let invoiceNumber: string | null = null;
    const invNumPatterns = [
      /\b(?:tax\s*)?invoice\s*(?:number|no\.?|#|id)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
      /\b(?:inv|bill)\s*(?:number|no\.?|#)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
      /\binv[-_][a-zA-Z0-9\-_]{3,25}\b/i,
      /(?:^|\n)\s*invoice[\s:#]+([a-zA-Z0-9\-_/]{3,30})/i,
    ];
    for (const pat of invNumPatterns) {
      const match = text.match(pat);
      if (match) {
        invoiceNumber = NormalizationHelper.normalizeInvoiceNumber(match[1] || match[0]);
        if (invoiceNumber && !/^(?:invoice|tax|bill|date|number|no)$/i.test(invoiceNumber)) {
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
      /\bdate\s*(?:of\s*issue)?[\s:]*(?:[\r\n]+\s*)?([^\n\r,]+)/i,
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

    // 3. Payment Terms Extraction
    let paymentTerms: string | null = null;
    const termsMatch = text.match(/\b(?:payment\s*terms?|terms)[\s:]*(?:[\r\n]+\s*)?([^\n\r]+)/i);
    if (termsMatch) {
      const rawTerms = termsMatch[1].trim();
      if (!/^(?:tax|invoice|subtotal|total|bank|date)/i.test(rawTerms)) {
        paymentTerms = rawTerms;
      }
    }

    // 4. Due Date Extraction (Semantic rule: explicit due date > calculated terms > null. Never invoiceDate.)
    let dueDate: string | null = null;
    const explicitDueDateMatch = text.match(/\b(?:due\s*date|payment\s*due\s*date|payment\s*due|due\s*on)[\s:]*(?:[\r\n]+\s*)?([^\n\r,]+)/i);
    if (explicitDueDateMatch) {
      dueDate = NormalizationHelper.normalizeDate(explicitDueDateMatch[1]);
    }

    // If explicit due date was not in document, derive from invoiceDate + paymentTerms
    if (!dueDate && invoiceDate && paymentTerms) {
      dueDate = NormalizationHelper.calculateDueDateFromTerms(invoiceDate, paymentTerms);
    }

    // 5. PO Number / Reference Extraction (Optional for invoice)
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

    // 6. Supplier / Seller Name & GSTIN Extraction
    let supplierName: string | null = null;
    let supplierGstin: string | null = null;

    const sellerMatch = text.match(/\b(?:seller|supplier|vendor|from|billed\s*by)[\s:]*(?:[\r\n]+\s*)?([^\n\r]+)/i);
    if (sellerMatch) {
      supplierName = NormalizationHelper.cleanCompanyName(sellerMatch[1]);
    }

    // Check for explicit Seller GSTIN first
    const sellerGstinMatch = text.match(/\b(?:seller|supplier|vendor)\s*gstin[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9]{15})/i)
      || text.match(/\bgstin[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9]{15})/i);
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
          !/(?:tax|invoice|bill|date|number|gstin|buyer|seller|po\s*reference|shipping|delivery|item|code)/i.test(line) &&
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

    // 7. Contact Information (Email / Phone) with Contextual Guards
    let supplierEmail: string | null = null;
    const emailMatch = text.match(/\b(?:email|supplier\s*email|billing\s*email|contact\s*email)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) {
      supplierEmail = NormalizationHelper.normalizeEmail(emailMatch[1]);
    }

    let supplierPhone: string | null = null;
    const phoneMatch = text.match(/\b(?:phone|tel|telephone|mobile|contact)[\s#.:\-_]*(?:[\r\n]+\s*)?(?:\+91[\s-]?)?([6-9]\d{9})\b/i);
    if (phoneMatch) {
      supplierPhone = `+91 ${phoneMatch[1]}`;
    }

    // 8. Currency Extraction
    const currency = NormalizationHelper.normalizeCurrency(text);

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

    // Check for combined tax or split CGST + SGST
    const taxMatch = text.match(/(?:grand\s*tax|total\s*tax|\btax\b|\bgst\b|\bigst\b)[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i);
    if (taxMatch) {
      tax = NormalizationHelper.normalizeAmount(taxMatch[1]);
    } else {
      // Check if CGST and SGST are on separate summary lines
      const cgstMatch = text.match(/\bcgst[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i);
      const sgstMatch = text.match(/\bsgst[\s:]*(?:[\r\n]+\s*)?[^\d\s]*([\d,]+(?:\.\d+)?)/i);
      if (cgstMatch && sgstMatch) {
        const cgstAmt = NormalizationHelper.normalizeAmount(cgstMatch[1]) || 0;
        const sgstAmt = NormalizationHelper.normalizeAmount(sgstMatch[1]) || 0;
        tax = Math.round((cgstAmt + sgstAmt) * 100) / 100;
      }
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
    const accMatch = text.match(/(?:account\s*(?:number|no\.?)|a\/c\s*(?:no\.?)?|bank\s*a\/c)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9]{9,20})/i);
    const ifscMatch = text.match(/\bifsc(?:\s*code)?[\s:]*(?:[\r\n]+\s*)?([a-zA-Z]{4}0[a-zA-Z0-9]{6})\b/i);
    const bankNameMatch = text.match(/(?:bank\s*name)[\s:]*(?:[\r\n]+\s*)?([^\n\r,]+)/i);

    if (accMatch || ifscMatch || bankNameMatch) {
      const cleanName = bankNameMatch ? NormalizationHelper.cleanBankName(bankNameMatch[1]) : null;
      bankDetails = {
        accountNumber: accMatch ? accMatch[1].trim() : null,
        ifsc: ifscMatch ? ifscMatch[1].trim().toUpperCase() : null,
        bankName: cleanName,
      };
    }

    // 11. Line Items Parsing
    const lineItems = this.extractLineItems(text);

    // Initial preliminary data structure
    const data: ExtractedInvoiceData = {
      documentType: 'invoice',
      confidence: 0.50,
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

    // 12. Robust Extraction Quality Assessment
    const qualityResult = ExtractionQualityEvaluator.evaluateInvoiceQuality(text, data);
    data.confidence = qualityResult.confidence;

    return {
      data,
      extractionMethod: sourceMethod,
      confidence: qualityResult.confidence,
      quality: qualityResult.quality,
      needsAI: qualityResult.needsAiFallback,
      missingOrAmbiguousFields: qualityResult.missingFields,
      warnings: qualityResult.warnings,
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
      /\b(?:purchase\s*order|po)\s*(?:number|no\.?|#|id)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
      /\bpo[-_][a-zA-Z0-9\-_]{3,25}\b/i,
      /(?:^|\n)\s*(?:purchase\s*order|po)[\s:#]+([a-zA-Z0-9\-_/]{3,30})/i,
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

    let supplierEmail: string | null = null;
    const emailMatch = text.match(/\b(?:email|supplier\s*email|sales\s*email)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) {
      supplierEmail = NormalizationHelper.normalizeEmail(emailMatch[1]);
    }

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

    const data: ExtractedPOData = {
      documentType: 'purchase_order',
      confidence: 0.50,
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

    // 7. Robust PO Extraction Quality Assessment
    const qualityResult = ExtractionQualityEvaluator.evaluatePOQuality(text, data);
    data.confidence = qualityResult.confidence;

    return {
      data,
      extractionMethod: sourceMethod,
      confidence: qualityResult.confidence,
      quality: qualityResult.quality,
      needsAI: qualityResult.needsAiFallback,
      missingOrAmbiguousFields: qualityResult.missingFields,
      warnings: qualityResult.warnings,
      rawTextSample: text.slice(0, 300),
    };
  }

  /**
   * Helper to clean item code and description.
   * If code is just a capitalized English word, preserves it as part of description.
   */
  private cleanCodeAndDesc(rawCode: string | null | undefined, rawDesc: string): { itemCode: string | null; description: string } {
    let itemCode = rawCode ? rawCode.replace(/[.)]/g, '').trim() : null;
    let description = rawDesc.trim().replace(/^\d+[.)]\s*/, '');

    // If itemCode is an ordinary word without digits/hyphens, treat it as part of description
    if (itemCode && /^[A-Za-z]{3,}$/.test(itemCode) && !/^(?:SKU|ITEM|CODE|NO|ITM|HSN|SAC)$/i.test(itemCode)) {
      description = `${itemCode} ${description}`;
      itemCode = null;
    }

    return { itemCode, description };
  }

  /**
   * Helper to parse line item rows from text layouts.
   * Supports:
   * - Pipe and tab delimited tables
   * - Split CGST + SGST columns: [Code/Num] [Description] [Qty] [UnitPrice] [CGST%] [SGST%] [Total]
   * - 6-value tail with HSN/SAC code
   * - 5-value tail: [Code/Num] [Description] [Qty] [UnitPrice] [TaxRate%] [TaxAmount] [Total]
   * - 4-value tail: [Code/Num] [Description] [Qty] [UnitPrice] [TaxRate%] [Total]
   * - 3-value tail: [Code/Num] [Description] [Qty] [UnitPrice] [Total]
   * - Wrapped multi-line descriptions
   * - Key-value block layouts
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
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine || rawLine.length < 5) continue;

      // Skip table headers or invoice summary lines
      if (/^(?:item|code|description|particulars|qty|quantity|units|unit\s*price|rate|subtotal|sub\s*total|tax\b|gst\b|cgst\b|sgst\b|igst\b|grand\s*total|total\s*amount|net\s*amount|notes\b|payment\s*terms|terms\b|bank\b|seller|buyer|supplier|line\s*items)/i.test(rawLine)) {
        continue;
      }

      // Pre-clean pipes, currency glyphs and artifacts
      const cleaned = rawLine
        .replace(/\|/g, ' ')
        .replace(/[\u25A0\u25AA\uFFFD■▪●₹$€£]/g, ' ')
        .replace(/\b[nN](?=\d)/g, '')
        .replace(/\bRs\.?\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // 1A. Split CGST + SGST: [Code/Num] [Description] [Qty] [UnitPrice] [CGST%] [SGST%] [Total]
      let m = cleaned.match(/^(?:(\d+[.)]|[A-Za-z0-9\-_]{2,12})\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d+(?:\.\d+)?%?)\s+(\d+(?:\.\d+)?%?)\s+([\d,]+(?:\.\d+)?)$/i);
      if (m) {
        const { itemCode, description } = this.cleanCodeAndDesc(m[1], m[2]);
        const qty = parseFloat(m[3]) || 1;
        const unitPrice = NormalizationHelper.normalizeAmount(m[4]) || 0;
        const cgst = parseFloat(m[5].replace('%', '')) || 9;
        const sgst = parseFloat(m[6].replace('%', '')) || 9;
        const taxRate = cgst + sgst;
        const total = NormalizationHelper.normalizeAmount(m[7]) || (qty * unitPrice * (1 + taxRate / 100));
        const taxAmount = Math.max(0, Math.round((total - (qty * unitPrice)) * 100) / 100);

        items.push({ itemCode, description, quantity: qty, unitPrice, taxRate, taxAmount, total });
        continue;
      }

      // 1B. 5-value numeric tail: [Code/Num] [Description] [Qty] [UnitPrice] [TaxRate%] [TaxAmount] [Total]
      m = cleaned.match(/^(?:(\d+[.)]|[A-Za-z0-9\-_]{2,12})\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d+(?:\.\d+)?%?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$/i);
      if (m) {
        const { itemCode, description } = this.cleanCodeAndDesc(m[1], m[2]);
        const qty = parseFloat(m[3]) || 1;
        const unitPrice = NormalizationHelper.normalizeAmount(m[4]) || 0;
        const taxRate = m[5] ? parseFloat(m[5].replace('%', '')) || 18 : 18;
        const taxAmount = NormalizationHelper.normalizeAmount(m[6]) || 0;
        const total = NormalizationHelper.normalizeAmount(m[7]) || (qty * unitPrice);

        items.push({ itemCode, description, quantity: qty, unitPrice, taxRate, taxAmount, total });
        continue;
      }

      // 1C. 4-value numeric tail: [Code/Num] [Description] [Qty] [UnitPrice] [TaxRate%] [Total]
      m = cleaned.match(/^(?:(\d+[.)]|[A-Za-z0-9\-_]{2,12})\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d+(?:\.\d+)?%?)\s+([\d,]+(?:\.\d+)?)$/i);
      if (m) {
        const { itemCode, description } = this.cleanCodeAndDesc(m[1], m[2]);
        const qty = parseFloat(m[3]) || 1;
        const unitPrice = NormalizationHelper.normalizeAmount(m[4]) || 0;
        const taxRate = m[5] ? parseFloat(m[5].replace('%', '')) || 18 : 18;
        const total = NormalizationHelper.normalizeAmount(m[6]) || (qty * unitPrice);
        const taxAmount = Math.max(0, Math.round((total - (qty * unitPrice)) * 100) / 100);

        items.push({ itemCode, description, quantity: qty, unitPrice, taxRate, taxAmount, total });
        continue;
      }

      // 1D. 3-value numeric tail: [Code/Num] [Description] [Qty] [UnitPrice] [Total]
      m = cleaned.match(/^(?:(\d+[.)]|[A-Za-z0-9\-_]{2,12})\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)$/i);
      if (m) {
        const { itemCode, description } = this.cleanCodeAndDesc(m[1], m[2]);
        const qty = parseFloat(m[3]) || 1;
        const unitPrice = NormalizationHelper.normalizeAmount(m[4]) || 0;
        const total = NormalizationHelper.normalizeAmount(m[5]) || (qty * unitPrice);
        const taxAmount = Math.max(0, Math.round((total - (qty * unitPrice)) * 100) / 100);

        items.push({ itemCode, description, quantity: qty, unitPrice, taxRate: 18, taxAmount, total });
        continue;
      }

      // 1E. Wrapped multi-line parsing: Line i is description, Line i+1 is numbers
      if (i + 1 < lines.length) {
        const nextCleaned = lines[i + 1].trim()
          .replace(/\|/g, ' ')
          .replace(/[\u25A0\u25AA\uFFFD■▪●₹$€£]/g, ' ')
          .replace(/\b[nN](?=\d)/g, '')
          .replace(/\bRs\.?\s*/gi, '')
          .replace(/\s+/g, ' ');

        const numOnlyMatch = nextCleaned.match(/^(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d+(?:\.\d+)?%?)\s+([\d,]+(?:\.\d+)?)$/i);
        if (numOnlyMatch && !/^(?:total|subtotal|grand|due|notes|bank)/i.test(cleaned)) {
          const desc = cleaned.replace(/^\d+[.)]\s*/, '');
          const qty = parseFloat(numOnlyMatch[1]) || 1;
          const unitPrice = NormalizationHelper.normalizeAmount(numOnlyMatch[2]) || 0;
          const taxRate = parseFloat(numOnlyMatch[3].replace('%', '')) || 18;
          const total = NormalizationHelper.normalizeAmount(numOnlyMatch[4]) || (qty * unitPrice);
          const taxAmount = Math.max(0, Math.round((total - (qty * unitPrice)) * 100) / 100);

          items.push({ itemCode: null, description: desc, quantity: qty, unitPrice, taxRate, taxAmount, total });
          i++; // skip the numeric line
          continue;
        }
      }
    }

    // Strategy 2: Multi-line / Block parsing (if Strategy 1 found 0 items)
    if (items.length === 0) {
      const blockRegex = /(?:(\d+)[.)]\s+)?([A-Za-z0-9\s\-_.&/]{3,60}?)\s*(?:[\r\n]+|\s+)Qty:\s*(\d+(?:\.\d+)?)\s*(?:[\r\n]+|\s+)Unit\s*Price:\s*[^\d\s]*([\d,]+(?:\.\d+)?)\s*(?:[\r\n]+|\s+)Tax\s*Rate:\s*(\d+(?:\.\d+)?%?)\s*(?:[\r\n]+|\s+)Tax\s*Amount:\s*[^\d\s]*([\d,]+(?:\.\d+)?)\s*(?:[\r\n]+|\s+)Total:\s*[^\d\s]*([\d,]+(?:\.\d+)?)/gi;
      let bMatch;
      while ((bMatch = blockRegex.exec(text)) !== null) {
        const itemCode = bMatch[1] ? bMatch[1].trim() : null;
        let desc = bMatch[2].trim().replace(/^\d+[.)]\s*/, '');
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
