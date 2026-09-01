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

  public classifyDocumentType(text: string, filename?: string): DocumentType {
    const type = this.detectDocumentTypeFromText(text);
    if (type !== 'unknown') return type;
    if (filename && /(?:purchase\s*order|\bpo[-_]?\b|order)/i.test(filename)) return 'purchase_order';
    return 'invoice';
  }

  /**
   * Deterministically parse text content into structured ExtractedInvoiceData.
   */
  public parseInvoiceText(
    text: string,
    sourceMethod: 'pdf_text' | 'ocr' = 'pdf_text'
  ): DeterministicResult<ExtractedInvoiceData> {
    const normalizedText = NormalizationHelper.normalizeOCRText(text);
    const lines = normalizedText.split('\n').map((l) => l.trim()).filter(Boolean);

    // 1. Invoice Number Extraction (Strictly labeled)
    let invoiceNumber: string | null = null;
    const invNumPatterns = [
      /\b(?:tax\s*)?invoice\s*(?:number\b|no\.?\b|#|\bid\b)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
      /\b(?:inv|bill)\s*(?:number\b|no\.?\b|#|\bid\b)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
      /\binv[-_][a-zA-Z0-9\-_]{3,25}\b/i,
      /(?:^|\n)\s*invoice[\s:#]+([a-zA-Z0-9\-_/]{3,30})/i,
    ];
    for (const pat of invNumPatterns) {
      const match = normalizedText.match(pat);
      if (match) {
        invoiceNumber = NormalizationHelper.normalizeInvoiceNumber(match[1] || match[0]);
        if (invoiceNumber && !/^(?:invoice|tax|bill|date|number|no)$/i.test(invoiceNumber)) {
          break;
        } else {
          invoiceNumber = null;
        }
      }
    }

    // Multiline fallback: Label on line i, Value on line i+1 (or next non-empty line)
    if (!invoiceNumber) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:tax\s*)?invoice\s*(?:number|no\.?|#|id|num)?[:\s]*$/i.test(l) || /^(?:inv|bill)\s*(?:number|no\.?|#)[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            if (next && /^[a-zA-Z0-9\-_/]{2,30}$/.test(next) && !/^(?:date|tax|bill|supplier|buyer|due|amount|total|subtotal)/i.test(next)) {
              invoiceNumber = NormalizationHelper.normalizeInvoiceNumber(next);
              if (invoiceNumber) break;
            }
          }
          if (invoiceNumber) break;
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
      const match = normalizedText.match(pat);
      if (match) {
        const norm = NormalizationHelper.normalizeDate(match[1]);
        if (norm) {
          invoiceDate = norm;
          break;
        }
      }
    }

    // Multiline fallback for invoice date
    if (!invoiceDate) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:tax\s*)?invoice\s*date[:\s]*$/i.test(l) || /^(?:bill|issued|issue)\s*date[:\s]*$/i.test(l) || /^date[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            if (next) {
              const norm = NormalizationHelper.normalizeDate(next);
              if (norm) {
                invoiceDate = norm;
                break;
              }
            }
          }
          if (invoiceDate) break;
        }
      }
    }

    // 3. Payment Terms Extraction
    let paymentTerms: string | null = null;
    const termsMatch = normalizedText.match(/\b(?:payment\s*terms?|terms)[\s:]*(?:[\r\n]+\s*)?([^\n\r]+)/i);
    if (termsMatch) {
      const rawTerms = termsMatch[1].trim();
      if (!/^(?:tax|invoice|subtotal|total|bank|date)/i.test(rawTerms)) {
        paymentTerms = rawTerms;
      }
    }

    // 4. Due Date Extraction (Semantic rule: explicit due date > calculated terms > null. Never invoiceDate.)
    let dueDate: string | null = null;
    const explicitDueDateMatch = normalizedText.match(/\b(?:due\s*date|payment\s*due\s*date|payment\s*due|due\s*on)[\s:]*(?:[\r\n]+\s*)?([^\n\r,]+)/i);
    if (explicitDueDateMatch) {
      dueDate = NormalizationHelper.normalizeDate(explicitDueDateMatch[1]);
    }

    // Multiline fallback for explicit due date
    if (!dueDate) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:due\s*date|payment\s*due\s*date|payment\s*due|due\s*on)[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            if (next) {
              const norm = NormalizationHelper.normalizeDate(next);
              if (norm) {
                dueDate = norm;
                break;
              }
            }
          }
          if (dueDate) break;
        }
      }
    }

    // If explicit due date was not in document, derive from invoiceDate + paymentTerms
    if (!dueDate && invoiceDate && paymentTerms) {
      dueDate = NormalizationHelper.calculateDueDateFromTerms(invoiceDate, paymentTerms);
    }

    // 5. PO Number / Reference Extraction (Optional for invoice)
    let poNumber: string | null = null;
    const poPatterns = [
      /\b(?:purchase\s*order(?:\s*ref(?:erence)?|\s*number|\s*no\.?|\s*#)?|p\.?o\.?\s*(?:ref(?:erence)?|number|no\.?|#)?|order\s*ref(?:erence)?|po\s*(?:ref(?:erence)?|number|no\.?|#)|po(?!\s*(?:box|reference|number|no|ref)))\b[\s:：]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
      /\bpo[-_]\d{4}[-_][a-zA-Z0-9\-_]{3,20}\b/i,
      /\bpo[-_\s][a-zA-Z0-9\-_]{3,20}\b/i,
      /\b(?:order|po)\s*ref(?:erence)?[\s:：]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
    ];
    for (const pat of poPatterns) {
      const match = normalizedText.match(pat);
      if (match) {
        const candidate = NormalizationHelper.normalizePONumber(match[1] || match[0]);
        if (candidate && NormalizationHelper.isValidPONumber(candidate)) {
          poNumber = candidate;
          break;
        }
      }
    }

    // Multiline fallback for PO reference: "PO:", "PO Number", "Purchase Order", etc.
    if (!poNumber) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:purchase\s*order(?:\s*ref|\s*number|\s*no\.?|\s*#)?|po\s*(?:reference|number|no\.?|#)?|p\.o\.?\s*(?:no\.?|#)?|order\s*ref(?:erence)?|po|p\.o\.)[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            if (next && !/^(?:date|tax|bill|supplier|buyer|due|amount|total|subtotal|invoice)/i.test(next)) {
              poNumber = NormalizationHelper.normalizePONumber(next);
              if (poNumber) break;
            }
          }
          if (poNumber) break;
        }
      }
    }

    // 6. Supplier / Seller Name & GSTIN Extraction
    let supplierName: string | null = null;
    let supplierGstin: string | null = null;

    const sellerMatch = normalizedText.match(/\b(?:seller(?:\s*name)?|supplier(?:\s*name)?|vendor(?:\s*name)?|from|billed\s*by)[\s:]*(?:[\r\n]+\s*)?([^\n\r]+)/i);
    if (sellerMatch) {
      supplierName = NormalizationHelper.cleanCompanyName(sellerMatch[1]);
    }

    // Multiline fallback: "Supplier" on line i, "ABC Pvt Ltd" on line i+1
    if (!supplierName) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:seller(?:\s*name)?|supplier(?:\s*name)?|vendor(?:\s*name)?|billed\s*by|from)[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            if (next && !/^(?:tax\b|invoice\b|bill\b|date\b|number\b|gstin\b|buyer\b|seller\b|shipping\b|delivery\b|item\b|code\b|po\b)/i.test(next)) {
              const cleaned = NormalizationHelper.cleanCompanyName(next);
              if (cleaned && cleaned.length >= 3) {
                supplierName = cleaned;
                break;
              }
            }
          }
          if (supplierName) break;
        }
      }
    }

    // Score-based candidate fallback from top of document if label was not explicit
    if (!supplierName) {
      let bestScore = 15;
      for (let i = 0; i < Math.min(8, lines.length); i++) {
        const candidate = lines[i].trim();
        const score = NormalizationHelper.scoreSupplierCandidate(candidate);
        if (score > bestScore) {
          bestScore = score;
          supplierName = NormalizationHelper.cleanCompanyName(candidate);
        }
      }
    }

    // Check for explicit Seller GSTIN first (supporting same-line or next-line)
    const sellerGstinMatch = normalizedText.match(/\b(?:seller|supplier|vendor)?\s*gstin[:\s]*[^\S\r\n]*([a-zA-Z0-9][a-zA-Z0-9\t \-]{13,20})/i);
    if (sellerGstinMatch) {
      supplierGstin = NormalizationHelper.normalizeGSTIN(sellerGstinMatch[1]);
    }

    // Multiline fallback for GSTIN
    if (!supplierGstin) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:seller\s*|supplier\s*)?gstin[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            const norm = NormalizationHelper.normalizeGSTIN(next);
            if (norm) {
              supplierGstin = norm;
              break;
            }
          }
          if (supplierGstin) break;
        }
      }
    }

    // Fallback: search for first GSTIN in text if not labeled
    if (!supplierGstin) {
      supplierGstin = NormalizationHelper.normalizeGSTIN(normalizedText);
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

    // 9. Financial Amounts (Subtotal, Tax, TaxRate, Total, Discount)
    let subtotal: number | null = null;
    let tax: number | null = null;
    let taxRate: number | null = null;
    let amount: number | null = null;
    let discount = 0;

    // 9a. Subtotal extraction
    const subtotalMatch = text.match(/(?:sub\s*total|subtotal|taxable\s*value|taxable\s*amount)[\s:]*(?:[\r\n]+\s*)*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/i);
    if (subtotalMatch) {
      subtotal = NormalizationHelper.normalizeAmount(subtotalMatch[1]);
    }

    // Multiline fallback for subtotal
    if (!subtotal) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:sub\s*total|subtotal|taxable\s*value|taxable\s*amount)[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            const numMatch = next.match(/[\d,]+(?:\.\d+)?/);
            if (numMatch) {
              const parsedSub = NormalizationHelper.normalizeAmount(numMatch[0]);
              if (parsedSub && parsedSub > 0) {
                subtotal = parsedSub;
                break;
              }
            }
          }
          if (subtotal) break;
        }
      }
    }

    // 9b. Total / Amount extraction
    const totalMatch = text.match(/(?:grand\s*total|invoice\s*total|total\s*amount|total\s*payable|net\s*payable|payable\s*amount|amount\s*due|total\s*due|balance\s*due|final\s*amount)[\s:]*(?:[\r\n]+\s*)*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/i)
      || text.match(/(?:^|\n)\s*(?:invoice\s*|total\s*)?(?:total|payable|amount)[\s:]*(?:[\r\n]+\s*)*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/i);
    if (totalMatch) {
      amount = NormalizationHelper.normalizeAmount(totalMatch[1]);
    }

    // Multiline fallback for total
    if (!amount) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:grand\s*total|invoice\s*total|total\s*amount|total\s*payable|payable\s*amount|amount\s*due|net\s*payable|total)[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            const numMatch = next.match(/[\d,]+(?:\.\d+)?/);
            if (numMatch) {
              const parsedAmt = NormalizationHelper.normalizeAmount(numMatch[0]);
              if (parsedAmt && parsedAmt > 0) {
                amount = parsedAmt;
                break;
              }
            }
          }
          if (amount) break;
        }
      }
    }

    // 9c. Discount extraction
    const discountMatch = text.match(/(?:discount|less)[\s:]*(?:[\r\n]+\s*)*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/i);
    if (discountMatch) {
      discount = NormalizationHelper.normalizeAmount(discountMatch[1]) || 0;
    }

    // 9d. Line Items Parsing (parsed early to provide corroborating evidence)
    const lineItems = this.extractLineItems(text);

    // Calculate line-item tax sum and line-item tax rate candidate
    let lineItemTaxSum = 0;
    let lineItemTaxRateCandidate: number | null = null;
    if (lineItems.length > 0) {
      for (const it of lineItems) {
        if (typeof it.taxAmount === 'number' && it.taxAmount > 0) {
          lineItemTaxSum += it.taxAmount;
        } else if (typeof it.taxRate === 'number' && it.taxRate > 0 && typeof it.quantity === 'number' && typeof it.unitPrice === 'number') {
          lineItemTaxSum += (it.quantity * it.unitPrice * it.taxRate) / 100;
        }
        if (typeof it.taxRate === 'number' && it.taxRate > 0 && lineItemTaxRateCandidate === null) {
          lineItemTaxRateCandidate = it.taxRate;
        }
      }
      lineItemTaxSum = Math.round(lineItemTaxSum * 100) / 100;
    }

    // 9e. Header Tax and Tax Rate Extraction (Strictly separating percentage rate vs monetary currency amount)

    // Pattern 1: Explicit CGST and SGST summary lines
    const cgstMatch = text.match(/\bcgst(?:\s*[@(@]?\s*(\d+(?:\.\d+)?)\s*%\)?)?[\s:]*(?:[\r\n]+\s*)*(?:(?:rs\.?|inr|₹)\s*)?([\d,]+(?:\.\d+)?)/i);
    const sgstMatch = text.match(/\bsgst(?:\s*[@(@]?\s*(\d+(?:\.\d+)?)\s*%\)?)?[\s:]*(?:[\r\n]+\s*)*(?:(?:rs\.?|inr|₹)\s*)?([\d,]+(?:\.\d+)?)/i);
    if (cgstMatch && sgstMatch) {
      const cgstRate = cgstMatch[1] ? parseFloat(cgstMatch[1]) : null;
      const sgstRate = sgstMatch[1] ? parseFloat(sgstMatch[1]) : null;
      if (cgstRate !== null && sgstRate !== null) {
        taxRate = cgstRate + sgstRate;
      }
      const cgstAmt = NormalizationHelper.normalizeAmount(cgstMatch[2]) || 0;
      const sgstAmt = NormalizationHelper.normalizeAmount(sgstMatch[2]) || 0;
      if (cgstAmt > 0 || sgstAmt > 0) {
        tax = Math.round((cgstAmt + sgstAmt) * 100) / 100;
      }
    }

    // Pattern 2: Combined Rate + Amount near each other (e.g. "GST @ 18%: Rs. 18,000.00", "GST (18%): ₹18,000", "Tax: 18% ₹18,000")
    if (tax === null) {
      const combinedTaxRateAndAmountRegexes = [
        /\b(?:gst|igst|tax)\b\s*[@(@]?\s*(\d+(?:\.\d+)?)\s*%\)?[\s:]+(?:(?:rs\.?|inr|₹)\s*)?([\d,]+(?:\.\d+)?)/i,
        /\b(?:gst|igst|tax)\b[\s:]+\s*(\d+(?:\.\d+)?)\s*%\s*(?:(?:rs\.?|inr|₹)\s*)?([\d,]+(?:\.\d+)?)/i,
        /\b(?:gst|igst|tax)\b\s*\((\d+(?:\.\d+)?)\s*%\)[\s:]*(?:(?:rs\.?|inr|₹)\s*)?([\d,]+(?:\.\d+)?)/i,
      ];

      for (const pat of combinedTaxRateAndAmountRegexes) {
        const m = text.match(pat);
        if (m) {
          const rateVal = parseFloat(m[1]);
          const amtVal = NormalizationHelper.normalizeAmount(m[2]);
          if (!isNaN(rateVal) && rateVal > 0) {
            taxRate = rateVal;
          }
          if (amtVal !== null && amtVal > 0) {
            tax = amtVal;
            break;
          }
        }
      }
    }

    // Pattern 3: Explicit Monetary Tax Amount labels (e.g. "Tax Amount: 18,000", "Total GST: 18,000", "Grand Tax: 18,000")
    if (tax === null) {
      const explicitAmtMatch = text.match(/(?:grand\s*tax|total\s*tax|tax\s*amount|total\s*gst|total\s*igst)[\s:]*(?:[\r\n]+\s*)*(?:(?:rs\.?|inr|₹)\s*)?([\d,]+(?:\.\d+)?)/i);
      if (explicitAmtMatch) {
        const parsed = NormalizationHelper.normalizeAmount(explicitAmtMatch[1]);
        if (parsed !== null && parsed > 0) {
          tax = parsed;
        }
      }
    }

    // Pattern 4: Standard summary "GST: ₹18,000" or "Tax: 18,000" (Rejecting percentage tokens!)
    if (tax === null) {
      const standardSummaryMatch = text.match(/(?:^|\n)[^\S\r\n]*(?:gst|igst|\btax\b)(?!\s*(?:invoice|rate|id|number|no|code|amount|breakdown))[:\s]*(?:(?:rs\.?|inr|₹)\s*)?([\d,]+(?:\.\d+)?)(%?)/i);
      if (standardSummaryMatch) {
        const hasPercent = standardSummaryMatch[2] === '%' || standardSummaryMatch[0].includes('%');
        const numVal = NormalizationHelper.normalizeAmount(standardSummaryMatch[1]);
        if (hasPercent) {
          // It is a percentage rate, NEVER a monetary currency amount!
          if (numVal !== null && numVal > 0) {
            taxRate = numVal;
          }
        } else if (numVal !== null) {
          // If subtotal is known and large, but numVal is <= 50 (e.g. 18, 12, 5, 28) and matches a standard rate:
          if (subtotal && subtotal >= 500 && numVal <= 50 && [5, 9, 12, 18, 20, 21, 28].includes(numVal)) {
            taxRate = numVal;
          } else {
            tax = numVal;
          }
        }
      }
    }

    // Pattern 5: Multi-line scanning for tax header
    if (!tax) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:grand\s*tax|total\s*tax|tax\s*amount|total\s*gst|tax|gst|igst|cgst\s*\+\s*sgst)(?:\s*[@(@]?\s*\d+(?:\.\d+)?\s*%\)?)?[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            const hasPct = next.includes('%');
            const numMatch = next.match(/[\d,]+(?:\.\d+)?/);
            if (numMatch) {
              const parsedVal = NormalizationHelper.normalizeAmount(numMatch[0]);
              if (parsedVal && parsedVal > 0) {
                if (hasPct || (subtotal && subtotal >= 500 && parsedVal <= 50 && [5, 9, 12, 18, 20, 21, 28].includes(parsedVal))) {
                  taxRate = parsedVal;
                } else {
                  tax = parsedVal;
                  break;
                }
              }
            }
          }
          if (tax) break;
        }
      }
    }

    // Pattern 6: Standalone Tax Rate pattern if taxRate is still missing (e.g. "Tax Rate: 18%", "GST Rate: 18%")
    if (taxRate === null) {
      const standaloneRateMatch = text.match(/(?:tax\s*rate|gst\s*rate|gst\s*%)[\s:]*(\d+(?:\.\d+)?)\s*%?/i);
      if (standaloneRateMatch) {
        taxRate = parseFloat(standaloneRateMatch[1]);
      } else if (lineItemTaxRateCandidate !== null) {
        taxRate = lineItemTaxRateCandidate;
      }
    }

    // 9f. Line-Item Corroboration & Tax Reconciliation
    if (tax !== null && lineItemTaxSum > 0) {
      const taxVarianceWithLineItems = Math.abs(tax - lineItemTaxSum);
      if (taxVarianceWithLineItems > 5.0) {
        // Header tax conflicts with line-item tax sum!
        // Check if lineItemTaxSum reconciles with subtotal + tax = total
        if (subtotal !== null && amount !== null) {
          const expectedTaxFromTotal = Math.round((amount - subtotal + discount) * 100) / 100;
          if (Math.abs(lineItemTaxSum - expectedTaxFromTotal) <= 2.0) {
            // Line items corroborate the exact expected tax from total!
            tax = lineItemTaxSum;
          }
        }
      }
    } else if (tax === null && lineItemTaxSum > 0) {
      // Header tax was absent or only given as a rate; corroborate directly from line items!
      tax = lineItemTaxSum;
    }

    // 9g. Subtotal + Tax = Total Mathematical Consistency
    if (subtotal !== null && amount !== null) {
      const expectedTax = Math.round((amount - subtotal + discount) * 100) / 100;
      if (tax === null && expectedTax >= 0) {
        tax = expectedTax;
      } else if (tax !== null) {
        // If tax was wrongly parsed as rate (e.g. 18 on a 100,000 subtotal):
        if (tax < 100 && subtotal > 500 && Math.abs(expectedTax - tax) > 5) {
          if (Math.abs(Math.round((subtotal * (tax / 100)) * 100) / 100 - expectedTax) <= 5) {
            if (taxRate === null) taxRate = tax;
            tax = expectedTax;
          }
        }
      }
    }

    if (subtotal !== null && tax !== null && !amount) {
      amount = Math.round((subtotal + tax - discount) * 100) / 100;
    }
    if (amount !== null && tax !== null && !subtotal) {
      subtotal = Math.round((amount - tax + discount) * 100) / 100;
    }

    // 9h. Inferred Tax Rate
    if (taxRate === null && subtotal && tax && subtotal > 0 && tax > 0) {
      const inferred = Math.round((tax / subtotal) * 100 * 100) / 100;
      for (const stdRate of [0, 5, 9, 12, 18, 20, 21, 28]) {
        if (Math.abs(inferred - stdRate) <= 0.5) {
          taxRate = stdRate;
          break;
        }
      }
      if (taxRate === null) {
        taxRate = inferred;
      }
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
      taxRate: taxRate ?? null,
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
    const normalizedText = NormalizationHelper.normalizeOCRText(text);
    const lines = normalizedText.split('\n').map((l) => l.trim()).filter(Boolean);

    // 1. PO Number Extraction
    let poNumber: string | null = null;
    const poNumPatterns = [
      /\b(?:purchase\s*order|po)\s*(?:number|no\.?|#|id)[\s:]*(?:[\r\n]+\s*)?([a-zA-Z0-9\-_/]{3,30})/i,
      /\bpo[-_][a-zA-Z0-9\-_]{3,25}\b/i,
      /(?:^|\n)\s*(?:purchase\s*order|po)[\s:#]+([a-zA-Z0-9\-_/]{3,30})/i,
    ];
    for (const pat of poNumPatterns) {
      const match = normalizedText.match(pat);
      if (match) {
        poNumber = NormalizationHelper.normalizePONumber(match[1] || match[0]);
        if (poNumber) break;
      }
    }

    // Multiline fallback: "PO Number" on line i, "PO-2026-00421" on line i+1 (or next non-empty line)
    if (!poNumber) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:purchase\s*order(?:\s*number|\s*no\.?|\s*#|\s*id)?|po\s*(?:number|no\.?|#|id)?|order\s*ref(?:erence)?|po|p\.o\.)[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            if (next && !/^(?:date|tax|bill|supplier|buyer|due|amount|total|subtotal|item)/i.test(next)) {
              poNumber = NormalizationHelper.normalizePONumber(next);
              if (poNumber) break;
            }
          }
          if (poNumber) break;
        }
      }
    }

    // 2. PO Date Extraction
    let poDate: string | null = null;
    const dateMatch = text.match(/\b(?:order|po|issued|purchase\s*order)?\s*date[\s:]*(?:[\r\n]+\s*)?([^\n\r,]+)/i);
    if (dateMatch) {
      poDate = NormalizationHelper.normalizeDate(dateMatch[1]);
    }

    // Multiline fallback for PO date
    if (!poDate) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:order|po|issued|purchase\s*order)?\s*date[:\s]*$/i.test(l) || /^date[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            if (next) {
              const norm = NormalizationHelper.normalizeDate(next);
              if (norm) {
                poDate = norm;
                break;
              }
            }
          }
          if (poDate) break;
        }
      }
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

    const sellerMatch = text.match(/\b(?:supplier(?:\s*name)?|vendor(?:\s*name)?|seller|to)[\s:]*(?:[\r\n]+\s*)?([^\n\r]+)/i);
    if (sellerMatch) {
      supplierName = NormalizationHelper.cleanCompanyName(sellerMatch[1]);
    }

    // Multiline fallback for supplier name
    if (!supplierName) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:supplier(?:\s*name)?|vendor(?:\s*name)?|seller|to)[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            if (next && !/^(?:date\b|buyer\b|gstin\b|item\b|delivery\b|tax\b|total\b)/i.test(next)) {
              const cleaned = NormalizationHelper.cleanCompanyName(next);
              if (cleaned && cleaned.length >= 3) {
                supplierName = cleaned;
                break;
              }
            }
          }
          if (supplierName) break;
        }
      }
    }

    // Fallback: If no explicit supplier label, check headers with score-based candidate selection
    if (!supplierName) {
      let bestScore = 15;
      for (const line of lines.slice(0, 8)) {
        const score = NormalizationHelper.scoreSupplierCandidate(line);
        if (score > bestScore) {
          bestScore = score;
          supplierName = NormalizationHelper.cleanCompanyName(line);
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

    const subMatch = text.match(/(?:sub\s*total|subtotal|taxable\s*amount)[\s:]*(?:[\r\n]+\s*)*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/i);
    if (subMatch) {
      subtotal = NormalizationHelper.normalizeAmount(subMatch[1]);
    }

    // Tax amount: skip any percentage rate notation like '@18%' or '(18%)' before capturing the amount
    const taxMatch = text.match(/(?:tax|gst|igst|cgst\s*\+\s*sgst)(?:\s*[@(@]?\s*\d+(?:\.\d+)?\s*%\)?)?[\s:]*(?:[\r\n]+\s*)*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/i);
    if (taxMatch) {
      const candidate = NormalizationHelper.normalizeAmount(taxMatch[1]);
      // Reject if the captured value looks like a percentage rate (< 100 and looks like a rate)
      if (candidate !== null && candidate >= 100) {
        tax = candidate;
      } else if (candidate !== null && candidate < 100) {
        // Could be a rate — try to find the actual tax amount on the same line
        const sameLineMatch = taxMatch[0].match(/([\d,]{4,}(?:\.\d+)?)/);
        if (sameLineMatch) {
          const altVal = NormalizationHelper.normalizeAmount(sameLineMatch[1]);
          if (altVal !== null && altVal >= 100) {
            tax = altVal;
          }
        }
      }
    }

    const totalMatch = text.match(/(?:grand\s*total|po\s*total|order\s*total|total\s*amount)[\s:]*(?:[\r\n]+\s*)*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/i)
      || text.match(/(?:^|\n)\s*(?:po\s*|order\s*)?total[\s:]*(?:[\r\n]+\s*)*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/i);
    if (totalMatch) {
      total = NormalizationHelper.normalizeAmount(totalMatch[1]);
    }

    // Multiline fallback for subtotal
    if (!subtotal) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:sub\s*total|subtotal|taxable\s*amount)[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            const numMatch = next.match(/[\d,]+(?:\.\d+)?/);
            if (numMatch) {
              const parsedSub = NormalizationHelper.normalizeAmount(numMatch[0]);
              if (parsedSub && parsedSub > 0) {
                subtotal = parsedSub;
                break;
              }
            }
          }
          if (subtotal) break;
        }
      }
    }

    // Multiline fallback for tax
    if (!tax) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:grand\s*tax|total\s*tax|tax\s*amount|total\s*gst|tax|gst|igst|cgst\s*\+\s*sgst)(?:\s*[@(@]?\s*\d+(?:\.\d+)?\s*%\)?)?[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            const numMatch = next.match(/[\d,]+(?:\.\d+)?/);
            if (numMatch) {
              const parsedTax = NormalizationHelper.normalizeAmount(numMatch[0]);
              if (parsedTax && parsedTax > 0) {
                tax = parsedTax;
                break;
              }
            }
          }
          if (tax) break;
        }
      }
    }

    // Multiline fallback for total
    if (!total) {
      for (let i = 0; i < lines.length - 1; i++) {
        const l = lines[i];
        if (/^(?:grand\s*total|po\s*total|order\s*total|total\s*amount|total)[:\s]*$/i.test(l)) {
          for (let j = i + 1; j < lines.length && j < i + 4; j++) {
            const next = lines[j].trim();
            const numMatch = next.match(/[\d,]+(?:\.\d+)?/);
            if (numMatch) {
              const parsedTotal = NormalizationHelper.normalizeAmount(numMatch[0]);
              if (parsedTotal && parsedTotal > 0) {
                total = parsedTotal;
                break;
              }
            }
          }
          if (total) break;
        }
      }
    }

    if (subtotal && tax && !total) {
      total = Math.round((subtotal + tax) * 100) / 100;
    }
    if (total && tax && !subtotal) {
      subtotal = Math.round((total - tax) * 100) / 100;
    }
    // Derive tax from subtotal and total when tax was not extractable directly
    if (subtotal && total && tax === null) {
      const derivedTax = Math.round((total - subtotal) * 100) / 100;
      if (derivedTax > 0 && derivedTax < total) {
        tax = derivedTax;
      }
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
      if (
        /^(?:item|code|description|particulars|qty|quantity|units|unit\s*price|rate|subtotal|sub\s*total|grand\s*total|total\s*amount|net\s*amount|notes\b|payment\s*terms|terms\b|bank\b|seller|buyer|supplier)\s*[:：]?$/i.test(rawLine) ||
        (/\b(?:description|particulars|item\s*name)\b/i.test(rawLine) && /\b(?:qty|quantity|units|rate|price|amount|total)\b/i.test(rawLine))
      ) {
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

      // 1Z. Single-line key-value format (e.g. "1. Enterprise Cloud Server Qty: 10 Unit Price: 50,000.00 Tax: 18% Total: 590,000.00")
      const kvMatch = cleaned.match(/^(?:(?:line\s*item|item)[:\s]*)?(?:(\d+[.)]|[A-Za-z0-9\-_]{2,12})\s+)?(.+?)\s+Qty:\s*(\d+(?:\.\d+)?)\s+(?:Unit\s*Price|Rate|Price):\s*([\d,]+(?:\.\d+)?)\s*(?:(?:Tax\s*(?:Rate|Amount)?|GST|Tax):\s*(\d+(?:\.\d+)?%?))?\s*(?:(?:Tax\s*Amount):\s*([\d,]+(?:\.\d+)?))?\s*(?:Total|Amount):\s*([\d,]+(?:\.\d+)?)$/i);
      if (kvMatch) {
        const { itemCode, description } = this.cleanCodeAndDesc(kvMatch[1], kvMatch[2]);
        const qty = parseFloat(kvMatch[3]) || 1;
        const unitPrice = NormalizationHelper.normalizeAmount(kvMatch[4]) || 0;
        const taxRate = kvMatch[5] ? parseFloat(kvMatch[5].replace('%', '')) || 18 : 18;
        const taxAmount = NormalizationHelper.normalizeAmount(kvMatch[6]) || 0;
        const total = NormalizationHelper.normalizeAmount(kvMatch[7]) || (qty * unitPrice);

        items.push({ itemCode, description, quantity: qty, unitPrice, taxRate, taxAmount, total });
        continue;
      }

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
      // 2A. Block with Tax Rate / Amount (allowing "Line item:" on previous line or inline):
      const blockRegexWithTax = /(?:^|\n)[^\S\r\n]*(?:(?:line\s*item|item)[:\s]*(?:\r?\n)?)?(?:(\d+)[.)]\s+)?([^\r\n]{3,80}?)[^\S\r\n]*(?:\r?\n)+[^\S\r\n]*(?:Qty|Quantity)[\s:]*(\d+(?:\.\d+)?)[^\S\r\n]*(?:\r?\n)+[^\S\r\n]*(?:Unit\s*Price|Rate|Price)[\s:]*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)[^\S\r\n]*(?:\r?\n)+[^\S\r\n]*(?:Tax\s*(?:Rate|Amount)?|GST|Tax)[\s:]*(\d+(?:\.\d+)?%?)(?:[^\S\r\n]*(?:\r?\n)+[^\S\r\n]*(?:Tax\s*Amount)[\s:]*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?))?[^\S\r\n]*(?:\r?\n)+[^\S\r\n]*(?:Total|Amount)[\s:]*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/gi;
      let bMatch;
      while ((bMatch = blockRegexWithTax.exec(text)) !== null) {
        const itemCode = bMatch[1] ? bMatch[1].trim() : null;
        let desc = bMatch[2].trim().replace(/^(?:line\s*item|item)[:\s]*/i, '').replace(/^\d+[.)]\s*/, '');
        const qty = parseFloat(bMatch[3]) || 1;
        const unitPrice = NormalizationHelper.normalizeAmount(bMatch[4]) || 0;
        const taxRate = bMatch[5] ? parseFloat(bMatch[5].replace('%', '')) : null;
        const taxAmount = bMatch[6] ? NormalizationHelper.normalizeAmount(bMatch[6]) : null;
        const declaredTotal = NormalizationHelper.normalizeAmount(bMatch[7]);

        const lineSubtotal = Math.round(qty * unitPrice * 100) / 100;
        const finalTaxAmount = taxAmount !== null
          ? taxAmount
          : (taxRate !== null ? Math.round((lineSubtotal * taxRate / 100) * 100) / 100 : (declaredTotal !== null && declaredTotal > lineSubtotal ? Math.round((declaredTotal - lineSubtotal) * 100) / 100 : 0));
        const finalTotal = declaredTotal !== null ? declaredTotal : Math.round((lineSubtotal + finalTaxAmount) * 100) / 100;

        items.push({
          itemCode,
          description: desc,
          quantity: qty,
          unitPrice,
          taxRate,
          taxAmount: finalTaxAmount,
          total: finalTotal,
        });
      }

      // 2B. Block without Tax (if 2A found 0 items)
      if (items.length === 0) {
        const blockRegexNoTax = /(?:^|\n)[^\S\r\n]*(?:(?:line\s*item|item)[:\s]*(?:\r?\n)?)?(?:(\d+)[.)]\s+)?([^\r\n]{3,80}?)[^\S\r\n]*(?:\r?\n)+[^\S\r\n]*(?:Qty|Quantity)[\s:]*(\d+(?:\.\d+)?)[^\S\r\n]*(?:\r?\n)+[^\S\r\n]*(?:Unit\s*Price|Rate|Price)[\s:]*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)[^\S\r\n]*(?:\r?\n)+[^\S\r\n]*(?:Total|Amount)[\s:]*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/gi;
        let bMatchNoTax;
        while ((bMatchNoTax = blockRegexNoTax.exec(text)) !== null) {
          const itemCode = bMatchNoTax[1] ? bMatchNoTax[1].trim() : null;
          let desc = bMatchNoTax[2].trim().replace(/^(?:line\s*item|item)[:\s]*/i, '').replace(/^\d+[.)]\s*/, '');
          const qty = parseFloat(bMatchNoTax[3]) || 1;
          const unitPrice = NormalizationHelper.normalizeAmount(bMatchNoTax[4]) || 0;
          const total = NormalizationHelper.normalizeAmount(bMatchNoTax[5]) || (qty * unitPrice);

          items.push({
            itemCode,
            description: desc,
            quantity: qty,
            unitPrice,
            taxRate: null,
            taxAmount: 0,
            total,
          });
        }
      }
    }

    // Strategy 3: Sequential window parser for OCR blocks (e.g. Line item labeled or itemized description blocks)
    if (items.length === 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^(?:line\s*items?|particulars|item\s*details?)[:\s]*$/i.test(line)) {
          // Look at lines immediately following
          let currentDesc: string | null = null;
          let currentQty: number | null = null;
          let currentPrice: number | null = null;
          let currentTaxRate: number | null = null;
          let currentTotal: number | null = null;

          for (let j = i + 1; j < lines.length && j < i + 12; j++) {
            const nextL = lines[j].trim();
            if (/^(?:subtotal|sub\s*total|tax\b|gst\b|grand\s*total|total\b|notes|bank)/i.test(nextL)) {
              break;
            }

            const qtyMatch = nextL.match(/^(?:qty|quantity)[\s:]*(\d+(?:\.\d+)?)/i);
            if (qtyMatch) {
              currentQty = parseFloat(qtyMatch[1]);
              continue;
            }

            const priceMatch = nextL.match(/^(?:unit\s*price|rate|price)[\s:]*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/i);
            if (priceMatch) {
              currentPrice = NormalizationHelper.normalizeAmount(priceMatch[1]);
              continue;
            }

            const taxMatch = nextL.match(/^(?:tax\s*(?:rate|amount)?|gst|tax)[\s:]*(\d+(?:\.\d+)?%?)/i);
            if (taxMatch) {
              currentTaxRate = parseFloat(taxMatch[1].replace('%', ''));
              continue;
            }

            const totalMatch = nextL.match(/^(?:total|amount|line\s*total)[\s:]*(?:[^\d\r\n]*?)?([\d,]+(?:\.\d+)?)/i);
            if (totalMatch) {
              currentTotal = NormalizationHelper.normalizeAmount(totalMatch[1]);
              continue;
            }

            // If it is a plausible description line
            if (!currentDesc && nextL.length >= 3 && !/[:=]/.test(nextL) && !/^(?:tax|invoice|date|po|gstin|subtotal)/i.test(nextL)) {
              currentDesc = nextL.replace(/^\d+[.)]\s*/, '');
            }
          }

          if (currentDesc && (currentQty || currentPrice || currentTotal)) {
            const finalQty = currentQty || 1;
            const finalPrice = currentPrice || 0;
            const finalTotal = currentTotal || (finalQty * finalPrice);
            items.push({
              itemCode: null,
              description: currentDesc,
              quantity: finalQty,
              unitPrice: finalPrice,
              taxRate: currentTaxRate,
              taxAmount: currentTaxRate ? Math.round((finalQty * finalPrice * currentTaxRate / 100) * 100) / 100 : 0,
              total: finalTotal,
            });
          }
        }
      }
    }

    return items;
  }
}

export const deterministicParserService = new DeterministicParserService();
