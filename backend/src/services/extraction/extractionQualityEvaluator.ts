import { ExtractedInvoiceData, ExtractedPOData } from '../ai/aiExtractionService.js';

export interface FinancialReconciliation {
  isReconciled: boolean;
  subtotalPlusTaxEqualsTotal: boolean;
  lineItemsSumMatchesSubtotal: boolean | null;
  variance: number;
  discrepancyDetails: string[];
}

export interface ExtractionQualityResult {
  quality: 'high' | 'incomplete' | 'ambiguous';
  confidence: number;
  needsAiFallback: boolean;
  missingFields: string[];
  missingCriticalFields: string[];
  warnings: string[];
  tableEvidenceFound: boolean;
  financialReconciliation: FinancialReconciliation;
}

export class ExtractionQualityEvaluator {
  /**
   * Validates whether a previously cached document extraction is demonstrably complete
   * and high-quality. A cached result is REJECTED if any critical fields are missing,
   * null, zero, placeholder values, or if the extraction was marked incomplete.
   */
  public static isReusableCachedExtraction(doc: any): boolean {
    if (!doc || typeof doc !== 'object') return false;

    // 1. Must be fully processed without errors
    if (doc.extractionStatus !== 'extracted' || doc.processingStatus !== 'processed') {
      return false;
    }
    if (doc.extractionError && String(doc.extractionError).trim().length > 0) {
      return false;
    }

    const data = doc.extractedData;
    if (!data || typeof data !== 'object') {
      return false;
    }

    // 2. Reject explicit placeholder / garbage strings
    const isInvalidString = (val: any, minLen = 2): boolean => {
      if (!val || typeof val !== 'string') return true;
      const clean = val.trim();
      if (clean.length < minLen) return true;
      const lower = clean.toLowerCase();
      const placeholders = [
        '—', '-', '–', 'null', 'undefined', 'n/a', 'none', 'unknown',
        'supplier', 'supplier name', 'vendor', 'vendor name', 'seller',
        'invoice', 'tax invoice', 'bill', 'purchase order', 'po',
      ];
      return placeholders.includes(lower);
    };

    const docType = doc.documentType || data.documentType || 'unknown';

    // 3. Evaluate Critical Fields by Document Type
    if (docType === 'invoice') {
      const invNum = data.invoiceNumber;
      const supplier = data.supplierName;
      const invDate = data.invoiceDate;
      const amount = typeof data.amount === 'number'
        ? data.amount
        : (typeof data.total === 'number' ? data.total : null);

      // Critical fields for invoice: invoiceNumber, supplierName, invoiceDate, amount > 0
      if (isInvalidString(invNum, 2)) return false;
      if (isInvalidString(supplier, 3)) return false;
      if (isInvalidString(invDate, 6)) return false;
      if (amount === null || isNaN(amount) || amount <= 0) return false;

      // Check quality metadata if present
      if (doc.extractionQuality === 'incomplete' || doc.extractionQuality === 'ambiguous') {
        return false;
      }
      if (typeof doc.confidence === 'number' && doc.confidence < 0.75) {
        return false;
      }

      return true;
    } else if (docType === 'purchase_order') {
      const poNum = data.poNumber;
      const supplier = data.supplierName;
      const poDate = data.poDate;
      const total = typeof data.total === 'number'
        ? data.total
        : (typeof data.amount === 'number' ? data.amount : null);

      // Critical fields for PO: poNumber, supplierName, poDate, total > 0
      if (isInvalidString(poNum, 2)) return false;
      if (isInvalidString(supplier, 3)) return false;
      if (isInvalidString(poDate, 6)) return false;
      if (total === null || isNaN(total) || total <= 0) return false;

      if (doc.extractionQuality === 'incomplete' || doc.extractionQuality === 'ambiguous') {
        return false;
      }
      if (typeof doc.confidence === 'number' && doc.confidence < 0.75) {
        return false;
      }

      return true;
    }

    return false;
  }

  /**
   * Detects whether the source document text contains visible evidence of an itemized table.
   */
  public static detectItemTableEvidence(text: string): {
    hasTableEvidence: boolean;
    signals: string[];
    confidence: number;
  } {
    if (!text || text.length < 20) {
      return { hasTableEvidence: false, signals: [], confidence: 0 };
    }

    const lower = text.toLowerCase();
    const signals: string[] = [];

    // 1. Direct section markers
    if (/(?:line\s*items?|item\s*details?|particulars|itemized\s*charges|order\s*items?)[\s:]/i.test(lower)) {
      signals.push('section_marker:line_items');
    }

    // 2. Table Column Header Keywords
    const headerKeywords = [
      { name: 'qty', pattern: /\b(?:qty|quantity|units|nos|qnty)\b/i },
      { name: 'unit_price', pattern: /\b(?:unit\s*price|rate|unit\s*rate|price\/unit|mrp)\b/i },
      { name: 'description', pattern: /\b(?:description|particulars|item\s*name|product|service)\b/i },
      { name: 'item_code', pattern: /\b(?:item\s*code|hsn|sac|sku|code|sl\s*no|sr\s*no)\b/i },
      { name: 'tax_rate', pattern: /\b(?:tax\s*rate|tax\s*%|gst\s*%|cgst\s*%|sgst\s*%|igst\s*%)\b/i },
      { name: 'tax_amount', pattern: /\b(?:tax\s*amount|tax\s*val|cgst\s*amt|sgst\s*amt|igst\s*amt)\b/i },
      { name: 'line_total', pattern: /\b(?:line\s*total|item\s*total|net\s*amount|taxable\s*amount|taxable\s*val)\b/i },
    ];

    let headerMatches = 0;
    for (const kw of headerKeywords) {
      if (kw.pattern.test(lower)) {
        signals.push(`header:${kw.name}`);
        headerMatches++;
      }
    }

    // 3. Tabular row detection
    const lines = text.split('\n');
    let tabularRowsCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 10) continue;
      if (/^(?:subtotal|total|tax|grand|balance|due|notes|bank)/i.test(trimmed)) continue;

      const numTokens = trimmed.match(/[\d,]+(?:\.\d+)?%?/g) || [];
      if (numTokens.length >= 3 && /[a-zA-Z]{3,}/.test(trimmed)) {
        tabularRowsCount++;
      }
    }

    if (tabularRowsCount >= 1) {
      signals.push(`tabular_rows_detected:${tabularRowsCount}`);
    }

    const hasTableEvidence =
      signals.includes('section_marker:line_items') ||
      headerMatches >= 2 ||
      tabularRowsCount >= 2 ||
      (headerMatches >= 1 && tabularRowsCount >= 1);

    const confidence = Math.min(
      1.0,
      headerMatches * 0.25 + tabularRowsCount * 0.25 + (signals.includes('section_marker:line_items') ? 0.3 : 0)
    );

    return {
      hasTableEvidence,
      signals,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * Evaluates the extraction quality of an extracted Invoice.
   * STRICT SEPARATION OF CRITICAL VS OPTIONAL FIELDS:
   * CRITICAL: invoiceNumber, supplierName, invoiceDate, amount (> 0).
   * OPTIONAL: GSTIN, dueDate, poNumber, bankDetails, lineItems, tax breakdown.
   * If all critical fields are present and valid -> HIGH QUALITY, NO AI REQUIRED.
   */
  public static evaluateInvoiceQuality(
    rawText: string,
    data: ExtractedInvoiceData
  ): ExtractionQualityResult {
    const missingCriticalFields: string[] = [];
    const missingFields: string[] = [];
    const warnings: string[] = [];

    // 1. CRITICAL Header Fields Evaluation
    if (!data.invoiceNumber || data.invoiceNumber.trim().length < 2 || /^(?:unknown|null|n\/a|invoice|bill)$/i.test(data.invoiceNumber.trim())) {
      missingCriticalFields.push('invoiceNumber');
      missingFields.push('invoiceNumber');
    }
    if (!data.supplierName || data.supplierName.trim().length < 3 || /^(?:unknown|null|n\/a|supplier|vendor|seller)$/i.test(data.supplierName.trim())) {
      missingCriticalFields.push('supplierName');
      missingFields.push('supplierName');
    }
    if (!data.invoiceDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.invoiceDate)) {
      missingCriticalFields.push('invoiceDate');
      missingFields.push('invoiceDate');
    }
    if (data.amount === null || data.amount === undefined || typeof data.amount !== 'number' || isNaN(data.amount) || data.amount <= 0) {
      missingCriticalFields.push('amount');
      missingFields.push('amount');
    }

    // 2. OPTIONAL Fields Tracking (Does NOT trigger AI fallback if missing)
    if (!data.supplierGstin) missingFields.push('supplierGstin');
    if (!data.dueDate) missingFields.push('dueDate');
    if (!data.bankDetails?.accountNumber) missingFields.push('bankDetails');

    const tableEvidence = this.detectItemTableEvidence(rawText);
    const lineItemsCount = data.lineItems ? data.lineItems.length : 0;
    if (tableEvidence.hasTableEvidence && lineItemsCount === 0) {
      missingFields.push('lineItems');
      warnings.push(`Document contains tabular rows, but 0 line items were parsed.`);
    }

    // 3. Financial Reconciliation Check
    const subtotal = data.subtotal ?? null;
    const tax = data.tax ?? null;
    const discount = data.discount ?? 0;
    const total = data.amount ?? 0;

    let subtotalPlusTaxEqualsTotal = true;
    let discrepancyVariance = 0;
    const discrepancyDetails: string[] = [];

    if (subtotal !== null && tax !== null && total > 0) {
      const expectedTotal = Math.round((subtotal + tax - discount) * 100) / 100;
      discrepancyVariance = Math.abs(expectedTotal - total);
      if (discrepancyVariance > 5.0) {
        subtotalPlusTaxEqualsTotal = false;
        discrepancyDetails.push(
          `Financial mismatch: Subtotal (${subtotal}) + Tax (${tax}) - Discount (${discount}) = ${expectedTotal}, but Total is ${total} (variance: ${discrepancyVariance}).`
        );
        warnings.push(`Financial calculation discrepancy: variance of ₹${discrepancyVariance}`);
      }
    }

    // 4. Determine Quality & AI Fallback Requirement
    // AI is triggered ONLY when CRITICAL fields are missing
    let quality: 'high' | 'incomplete' | 'ambiguous' = 'high';
    let needsAiFallback = false;

    if (missingCriticalFields.length > 0) {
      quality = 'incomplete';
      needsAiFallback = true;
    } else if (!subtotalPlusTaxEqualsTotal && discrepancyVariance > 50) {
      quality = 'ambiguous';
      needsAiFallback = true;
    } else {
      quality = 'high';
      needsAiFallback = false;
    }

    let confidence = needsAiFallback ? 0.60 : 0.95;
    if (lineItemsCount > 0) confidence = Math.min(0.99, confidence + 0.03);
    if (data.supplierGstin) confidence = Math.min(0.99, confidence + 0.02);

    return {
      quality,
      confidence,
      needsAiFallback,
      missingFields,
      missingCriticalFields,
      warnings,
      tableEvidenceFound: tableEvidence.hasTableEvidence,
      financialReconciliation: {
        isReconciled: subtotalPlusTaxEqualsTotal,
        subtotalPlusTaxEqualsTotal,
        lineItemsSumMatchesSubtotal: null,
        variance: discrepancyVariance,
        discrepancyDetails,
      },
    };
  }

  /**
   * Evaluates the extraction quality of an extracted Purchase Order.
   * STRICT SEPARATION OF CRITICAL VS OPTIONAL FIELDS:
   * CRITICAL: poNumber, supplierName, poDate, total (> 0).
   * OPTIONAL: buyerGstin, supplierGstin, lineItems, tax breakdown, deliveryAddress.
   */
  public static evaluatePOQuality(
    rawText: string,
    data: ExtractedPOData
  ): ExtractionQualityResult {
    const missingCriticalFields: string[] = [];
    const missingFields: string[] = [];
    const warnings: string[] = [];

    // 1. CRITICAL Header Fields Evaluation for PO
    // Primary Critical: supplierName, total (> 0)
    if (!data.supplierName || data.supplierName.trim().length < 3 || /^(?:unknown|null|n\/a|supplier|vendor|seller)$/i.test(data.supplierName.trim())) {
      missingCriticalFields.push('supplierName');
      missingFields.push('supplierName');
    }
    if (data.total === null || data.total === undefined || typeof data.total !== 'number' || isNaN(data.total) || data.total <= 0) {
      missingCriticalFields.push('total');
      missingFields.push('total');
    }

    // 2. Track PO Number, Date, Buyer & Optional Fields
    if (!data.poNumber || data.poNumber.trim().length < 2 || /^(?:unknown|null|n\/a|po|purchase\s*order)$/i.test(data.poNumber.trim())) {
      missingFields.push('poNumber');
    }
    if (!data.poDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.poDate)) {
      missingFields.push('poDate');
    }
    if (!data.buyerName) missingFields.push('buyerName');
    if (!data.supplierGstin) missingFields.push('supplierGstin');

    const tableEvidence = this.detectItemTableEvidence(rawText);
    const lineItemsCount = data.lineItems ? data.lineItems.length : 0;
    if (tableEvidence.hasTableEvidence && lineItemsCount === 0) {
      missingFields.push('lineItems');
      warnings.push(`PO contains tabular items, but 0 line items were parsed.`);
    }

    // 3. Financial Reconciliation
    const subtotal = data.subtotal ?? null;
    const tax = data.tax ?? null;
    const total = data.total ?? 0;

    let subtotalPlusTaxEqualsTotal = true;
    let discrepancyVariance = 0;
    const discrepancyDetails: string[] = [];

    if (subtotal !== null && tax !== null && total > 0) {
      const expectedTotal = Math.round((subtotal + tax) * 100) / 100;
      discrepancyVariance = Math.abs(expectedTotal - total);
      if (discrepancyVariance > 5.0) {
        subtotalPlusTaxEqualsTotal = false;
        discrepancyDetails.push(
          `PO Total mismatch: Subtotal (${subtotal}) + Tax (${tax}) = ${expectedTotal}, but Total is ${total}.`
        );
        warnings.push(`PO total financial discrepancy of ₹${discrepancyVariance}`);
      }
    }

    // 4. Quality & AI Fallback Requirement
    let quality: 'high' | 'incomplete' | 'ambiguous' = 'high';
    let needsAiFallback = false;

    if (missingCriticalFields.length > 0) {
      quality = 'incomplete';
      needsAiFallback = true;
    } else if (!subtotalPlusTaxEqualsTotal && discrepancyVariance > 50) {
      quality = 'ambiguous';
      needsAiFallback = true;
    } else if (missingFields.includes('poNumber')) {
      quality = 'incomplete';
      needsAiFallback = false;
    } else {
      quality = 'high';
      needsAiFallback = false;
    }

    let confidence = needsAiFallback ? 0.60 : 0.95;
    if (lineItemsCount > 0) confidence = Math.min(0.99, confidence + 0.03);

    return {
      quality,
      confidence,
      needsAiFallback,
      missingFields,
      missingCriticalFields,
      warnings,
      tableEvidenceFound: tableEvidence.hasTableEvidence,
      financialReconciliation: {
        isReconciled: subtotalPlusTaxEqualsTotal,
        subtotalPlusTaxEqualsTotal,
        lineItemsSumMatchesSubtotal: null,
        variance: discrepancyVariance,
        discrepancyDetails,
      },
    };
  }
}
