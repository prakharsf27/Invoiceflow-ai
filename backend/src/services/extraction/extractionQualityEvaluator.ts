import { ExtractedInvoiceData, ExtractedPOData } from '../ai/aiExtractionService.js';
import { NormalizationHelper } from './normalizationHelper.js';

export interface FinancialReconciliation {
  isReconciled: boolean;
  subtotalPlusTaxEqualsTotal: boolean;
  lineItemsSumMatchesSubtotal: boolean | null;
  variance: number;
  discrepancyDetails: string[];
}

export interface FieldValidationDetail {
  status: 'valid' | 'missing' | 'invalid' | 'suspicious';
  detail?: string;
}

export interface ExtractionQualityResult {
  quality: 'high' | 'incomplete' | 'ambiguous';
  confidence: number;
  needsAiFallback: boolean;
  missingFields: string[];
  missingCriticalFields: string[];
  failedFields: string[];
  fieldValidationStatus: Record<string, FieldValidationDetail>;
  validationErrors: string[];
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

    const docType = doc.documentType || data.documentType || 'unknown';

    // 2. Evaluate Critical Fields by Document Type
    if (docType === 'invoice') {
      const invNum = data.invoiceNumber;
      const supplier = data.supplierName;
      const invDate = data.invoiceDate;
      const amount = typeof data.amount === 'number'
        ? data.amount
        : (typeof data.total === 'number' ? data.total : null);

      // Critical fields for invoice: invoiceNumber, supplierName, invoiceDate, amount > 0
      if (!NormalizationHelper.isValidInvoiceNumber(invNum)) return false;
      if (!NormalizationHelper.isValidSupplierName(supplier)) return false;
      if (!NormalizationHelper.normalizeDate(invDate)) return false;
      if (amount === null || isNaN(amount) || amount <= 0 || !isFinite(amount)) return false;

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

      // Critical fields for PO: poNumber, supplierName, total > 0
      if (!poNum || !NormalizationHelper.isValidPONumber(poNum)) return false;
      if (!NormalizationHelper.isValidSupplierName(supplier)) return false;
      if (total === null || isNaN(total) || total <= 0 || !isFinite(total)) return false;
      if (poDate && !NormalizationHelper.normalizeDate(poDate)) return false;

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
   * Evaluates the extraction quality of an extracted Invoice with independent field validation.
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
    const failedFields: string[] = [];
    const validationErrors: string[] = [];
    const warnings: string[] = [];
    const fieldValidationStatus: Record<string, FieldValidationDetail> = {};

    // 1. Independent Validation: Supplier Name
    if (!data.supplierName || !NormalizationHelper.isValidSupplierName(data.supplierName)) {
      missingCriticalFields.push('supplierName');
      missingFields.push('supplierName');
      failedFields.push('supplierName');
      fieldValidationStatus.supplierName = {
        status: data.supplierName ? 'invalid' : 'missing',
        detail: data.supplierName
          ? 'Supplier name is invalid (matches address fragment, filename, generic keyword, or corrupted text).'
          : 'Supplier name is missing from document.',
      };
      validationErrors.push(fieldValidationStatus.supplierName.detail!);
    } else {
      fieldValidationStatus.supplierName = { status: 'valid' };
    }

    // 2. Independent Validation: Invoice Number
    if (!data.invoiceNumber || !NormalizationHelper.isValidInvoiceNumber(data.invoiceNumber)) {
      missingCriticalFields.push('invoiceNumber');
      missingFields.push('invoiceNumber');
      failedFields.push('invoiceNumber');
      fieldValidationStatus.invoiceNumber = {
        status: data.invoiceNumber ? 'invalid' : 'missing',
        detail: data.invoiceNumber
          ? 'Invoice number is invalid (matches generic word, date, or symbol fragment).'
          : 'Invoice number is missing from document.',
      };
      validationErrors.push(fieldValidationStatus.invoiceNumber.detail!);
    } else {
      fieldValidationStatus.invoiceNumber = { status: 'valid' };
    }

    // 3. Independent Validation: Invoice Date
    const normDate = data.invoiceDate ? NormalizationHelper.normalizeDate(data.invoiceDate) : null;
    if (!normDate) {
      missingCriticalFields.push('invoiceDate');
      missingFields.push('invoiceDate');
      failedFields.push('invoiceDate');
      fieldValidationStatus.invoiceDate = {
        status: data.invoiceDate ? 'invalid' : 'missing',
        detail: data.invoiceDate ? 'Invoice date is in an unrecognizable date format.' : 'Invoice date is missing.',
      };
      validationErrors.push(fieldValidationStatus.invoiceDate.detail!);
    } else {
      fieldValidationStatus.invoiceDate = { status: 'valid' };
    }

    // 4. Independent Validation: Amount
    if (data.amount === null || data.amount === undefined || typeof data.amount !== 'number' || isNaN(data.amount) || data.amount <= 0 || !isFinite(data.amount)) {
      missingCriticalFields.push('amount');
      missingFields.push('amount');
      failedFields.push('amount');
      fieldValidationStatus.amount = {
        status: data.amount !== null && data.amount !== undefined ? 'invalid' : 'missing',
        detail: 'Total amount is zero, negative, missing, or not a valid number.',
      };
      validationErrors.push(fieldValidationStatus.amount.detail!);
    } else {
      fieldValidationStatus.amount = { status: 'valid' };
    }

    // 5. Independent Validation: Supplier GSTIN (Optional field)
    if (data.supplierGstin) {
      if (NormalizationHelper.isValidGSTIN(data.supplierGstin)) {
        fieldValidationStatus.supplierGstin = { status: 'valid' };
      } else {
        failedFields.push('supplierGstin');
        fieldValidationStatus.supplierGstin = {
          status: 'suspicious',
          detail: 'Extracted GSTIN does not conform to valid 15-character Indian format.',
        };
        warnings.push(`Extracted GSTIN "${data.supplierGstin}" failed format validation.`);
      }
    } else {
      missingFields.push('supplierGstin');
      fieldValidationStatus.supplierGstin = { status: 'missing' };
    }

    // 6. Independent Validation: PO Number (Optional field)
    if (data.poNumber) {
      if (NormalizationHelper.isValidPONumber(data.poNumber)) {
        fieldValidationStatus.poNumber = { status: 'valid' };
      } else {
        failedFields.push('poNumber');
        fieldValidationStatus.poNumber = {
          status: 'suspicious',
          detail: 'Extracted PO number appears malformed or ambiguous.',
        };
        warnings.push(`Extracted PO number "${data.poNumber}" failed format validation.`);
      }
    } else {
      fieldValidationStatus.poNumber = { status: 'missing' };
    }

    // 7. Optional Dates & Banking
    if (!data.dueDate) missingFields.push('dueDate');
    if (!data.bankDetails?.accountNumber) missingFields.push('bankDetails');

    // 8. Line Items Validation
    const tableEvidence = this.detectItemTableEvidence(rawText);
    const rawItems = Array.isArray(data.lineItems) ? data.lineItems : [];
    if (rawItems.length > 0) {
      let validItemsCount = 0;
      for (const item of rawItems) {
        const qty = item.quantity;
        const price = item.unitPrice;
        if (
          item.description &&
          item.description.trim().length >= 2 &&
          typeof qty === 'number' &&
          qty > 0 &&
          typeof price === 'number' &&
          price >= 0
        ) {
          validItemsCount++;
        }
      }
      if (validItemsCount === rawItems.length) {
        fieldValidationStatus.lineItems = { status: 'valid' };
      } else {
        fieldValidationStatus.lineItems = {
          status: 'suspicious',
          detail: `${rawItems.length - validItemsCount} line items have missing or incomplete descriptions/prices.`,
        };
        warnings.push(fieldValidationStatus.lineItems.detail!);
      }
    } else {
      if (tableEvidence.hasTableEvidence) {
        missingFields.push('lineItems');
        fieldValidationStatus.lineItems = {
          status: 'missing',
          detail: 'Document contains tabular rows, but 0 line items were parsed.',
        };
        warnings.push('Document contains tabular rows, but 0 line items were parsed.');
      } else {
        fieldValidationStatus.lineItems = { status: 'missing' };
      }
    }

    // 9. Financial Reconciliation Check
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
        validationErrors.push(`Financial calculation discrepancy: variance of ₹${discrepancyVariance}`);
      }
    }

    // 10. Determine Quality & AI Fallback Requirement
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

    let confidence = needsAiFallback ? 0.50 : 0.95;
    if (rawItems.length > 0 && fieldValidationStatus.lineItems?.status === 'valid') {
      confidence = Math.min(0.99, confidence + 0.03);
    }
    if (data.supplierGstin && fieldValidationStatus.supplierGstin?.status === 'valid') {
      confidence = Math.min(0.99, confidence + 0.02);
    }

    return {
      quality,
      confidence: Math.round(confidence * 100) / 100,
      needsAiFallback,
      missingFields,
      missingCriticalFields,
      failedFields,
      fieldValidationStatus,
      validationErrors,
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
   * Evaluates the extraction quality of an extracted Purchase Order with independent field validation.
   */
  public static evaluatePOQuality(
    rawText: string,
    data: ExtractedPOData
  ): ExtractionQualityResult {
    const missingCriticalFields: string[] = [];
    const missingFields: string[] = [];
    const failedFields: string[] = [];
    const validationErrors: string[] = [];
    const warnings: string[] = [];
    const fieldValidationStatus: Record<string, FieldValidationDetail> = {};

    // 1. Independent Validation: Supplier Name
    if (!data.supplierName || !NormalizationHelper.isValidSupplierName(data.supplierName)) {
      missingCriticalFields.push('supplierName');
      missingFields.push('supplierName');
      failedFields.push('supplierName');
      fieldValidationStatus.supplierName = {
        status: data.supplierName ? 'invalid' : 'missing',
        detail: data.supplierName
          ? 'Supplier name is invalid (matches address fragment, filename, generic keyword, or corrupted text).'
          : 'Supplier name is missing from document.',
      };
      validationErrors.push(fieldValidationStatus.supplierName.detail!);
    } else {
      fieldValidationStatus.supplierName = { status: 'valid' };
    }

    // 2. Independent Validation: Total Amount
    if (data.total === null || data.total === undefined || typeof data.total !== 'number' || isNaN(data.total) || data.total <= 0 || !isFinite(data.total)) {
      missingCriticalFields.push('total');
      missingFields.push('total');
      failedFields.push('total');
      fieldValidationStatus.total = {
        status: data.total !== null && data.total !== undefined ? 'invalid' : 'missing',
        detail: 'PO total amount is zero, negative, missing, or not a valid number.',
      };
      validationErrors.push(fieldValidationStatus.total.detail!);
    } else {
      fieldValidationStatus.total = { status: 'valid' };
    }

    // 3. Track PO Number (Critical for formal PO, missing causes incomplete quality)
    if (!data.poNumber || !NormalizationHelper.isValidPONumber(data.poNumber)) {
      missingFields.push('poNumber');
      failedFields.push('poNumber');
      fieldValidationStatus.poNumber = {
        status: data.poNumber ? 'invalid' : 'missing',
        detail: data.poNumber ? 'PO number format is invalid.' : 'PO number is missing.',
      };
    } else {
      fieldValidationStatus.poNumber = { status: 'valid' };
    }

    // 4. Date & Buyer
    if (!data.poDate || !NormalizationHelper.normalizeDate(data.poDate)) {
      missingFields.push('poDate');
    }
    if (!data.buyerName) missingFields.push('buyerName');

    // 5. Line Items
    const tableEvidence = this.detectItemTableEvidence(rawText);
    const lineItemsCount = data.lineItems ? data.lineItems.length : 0;
    if (tableEvidence.hasTableEvidence && lineItemsCount === 0) {
      missingFields.push('lineItems');
      warnings.push(`PO contains tabular items, but 0 line items were parsed.`);
    }

    // 6. Financial Reconciliation
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
        validationErrors.push(`PO total financial discrepancy of ₹${discrepancyVariance}`);
      }
    }

    // 7. Quality & AI Fallback Requirement
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

    let confidence = needsAiFallback ? 0.50 : 0.95;
    if (lineItemsCount > 0) confidence = Math.min(0.99, confidence + 0.03);

    return {
      quality,
      confidence: Math.round(confidence * 100) / 100,
      needsAiFallback,
      missingFields,
      missingCriticalFields,
      failedFields,
      fieldValidationStatus,
      validationErrors,
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
