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
  warnings: string[];
  tableEvidenceFound: boolean;
  financialReconciliation: FinancialReconciliation;
}

export class ExtractionQualityEvaluator {
  /**
   * Detects whether the source document text contains visible evidence of an itemized table.
   * Looks for column headers, tabular structure markers, and repeating line patterns.
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

    // 3. Tabular row detection (e.g. "1. Widget Name 5 1000 18% 5900" or lines ending in 3+ numbers)
    const lines = text.split('\n');
    let tabularRowsCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 10) continue;
      // Skip summary totals
      if (/^(?:subtotal|total|tax|grand|balance|due|notes|bank)/i.test(trimmed)) continue;

      // Check if line contains a description followed by 2 or more numeric tokens
      const numTokens = trimmed.match(/[\d,]+(?:\.\d+)?%?/g) || [];
      if (numTokens.length >= 3 && /[a-zA-Z]{3,}/.test(trimmed)) {
        tabularRowsCount++;
      }
    }

    if (tabularRowsCount >= 1) {
      signals.push(`tabular_rows_detected:${tabularRowsCount}`);
    }

    // A table is considered present if:
    // - Section marker + at least 1 header/row
    // - OR 2 or more column headers
    // - OR at least 2 tabular data rows
    const hasTableEvidence =
      signals.includes('section_marker:line_items') ||
      headerMatches >= 2 ||
      tabularRowsCount >= 2 ||
      (headerMatches >= 1 && tabularRowsCount >= 1);

    const confidence = Math.min(1.0, (headerMatches * 0.25) + (tabularRowsCount * 0.25) + (signals.includes('section_marker:line_items') ? 0.3 : 0));

    return {
      hasTableEvidence,
      signals,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * Evaluates the extraction quality of an extracted Invoice.
   */
  public static evaluateInvoiceQuality(
    rawText: string,
    data: ExtractedInvoiceData
  ): ExtractionQualityResult {
    const missingFields: string[] = [];
    const warnings: string[] = [];

    // 1. Critical Header Fields Evaluation
    if (!data.invoiceNumber || data.invoiceNumber.trim().length < 2) {
      missingFields.push('invoiceNumber');
    }
    if (!data.supplierName || data.supplierName.trim().length < 3) {
      missingFields.push('supplierName');
    }
    if (!data.invoiceDate) {
      missingFields.push('invoiceDate');
    }
    if (data.amount === null || data.amount === undefined || data.amount <= 0) {
      missingFields.push('amount');
    }

    // 2. Table Evidence vs Extracted Line Items
    const tableEvidence = this.detectItemTableEvidence(rawText);
    const lineItemsCount = data.lineItems ? data.lineItems.length : 0;

    let lineItemQualityOk = true;
    if (tableEvidence.hasTableEvidence && lineItemsCount === 0) {
      missingFields.push('lineItems');
      warnings.push(`Document contains clear evidence of an item table (signals: ${tableEvidence.signals.join(', ')}), but 0 line items were parsed.`);
      lineItemQualityOk = false;
    }

    // 3. Financial Reconciliation
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
      if (discrepancyVariance > 2.0) {
        subtotalPlusTaxEqualsTotal = false;
        discrepancyDetails.push(`Financial mismatch: Subtotal (${subtotal}) + Tax (${tax}) - Discount (${discount}) = ${expectedTotal}, but Total is ${total} (variance: ${discrepancyVariance}).`);
        warnings.push(`Financial calculation discrepancy: variance of ₹${discrepancyVariance}`);
      }
    }

    // Line items sum check
    let lineItemsSumMatchesSubtotal: boolean | null = null;
    if (lineItemsCount > 0 && subtotal !== null && subtotal > 0) {
      const itemsSum = data.lineItems.reduce((acc, item) => {
        const itemVal = item.quantity && item.unitPrice ? (item.quantity * item.unitPrice) : (item.total || 0);
        return acc + itemVal;
      }, 0);

      const itemsTotalSum = data.lineItems.reduce((acc, item) => acc + (item.total || 0), 0);
      const subtotalDiff = Math.abs(itemsSum - subtotal);
      const totalDiff = Math.abs(itemsTotalSum - total);

      if (subtotalDiff <= 5.0 || totalDiff <= 5.0) {
        lineItemsSumMatchesSubtotal = true;
      } else if (lineItemsCount > 1 && subtotalDiff > (subtotal * 0.15)) {
        // Significant partial line-item extraction
        lineItemsSumMatchesSubtotal = false;
        discrepancyDetails.push(`Line items sum (₹${itemsSum}) does not match invoice subtotal (₹${subtotal}).`);
        warnings.push(`Extracted line items sum (₹${itemsSum}) deviates from invoice subtotal (₹${subtotal}).`);
      }
    }

    const isReconciled = subtotalPlusTaxEqualsTotal && (lineItemsSumMatchesSubtotal !== false);

    // 4. Calculate Holistic Quality Score
    let score = 0.20;
    if (!missingFields.includes('invoiceNumber')) score += 0.20;
    if (!missingFields.includes('supplierName')) score += 0.15;
    if (!missingFields.includes('invoiceDate')) score += 0.15;
    if (!missingFields.includes('amount')) score += 0.15;
    if (data.supplierGstin) score += 0.05;
    if (subtotalPlusTaxEqualsTotal && subtotal !== null && tax !== null) score += 0.05;

    if (lineItemQualityOk) {
      score += 0.05;
    } else {
      // Deduct heavily for missing table items when table evidence exists
      score -= 0.35;
    }

    let confidence = Math.min(0.98, Math.max(0.10, Math.round(score * 100) / 100));

    // 5. Determine Final Quality Classification & AI Fallback Requirement
    let quality: 'high' | 'incomplete' | 'ambiguous' = 'high';
    let needsAiFallback = false;

    if (missingFields.length > 0) {
      quality = 'incomplete';
      needsAiFallback = true;
    } else if (!isReconciled || (lineItemsSumMatchesSubtotal === false)) {
      quality = 'ambiguous';
      needsAiFallback = true;
    } else if (confidence < 0.85) {
      quality = 'incomplete';
      needsAiFallback = true;
    }

    if (needsAiFallback) {
      confidence = Math.min(confidence, 0.70);
    }

    return {
      quality,
      confidence,
      needsAiFallback,
      missingFields,
      warnings,
      tableEvidenceFound: tableEvidence.hasTableEvidence,
      financialReconciliation: {
        isReconciled,
        subtotalPlusTaxEqualsTotal,
        lineItemsSumMatchesSubtotal,
        variance: discrepancyVariance,
        discrepancyDetails,
      },
    };
  }

  /**
   * Evaluates the extraction quality of an extracted Purchase Order.
   */
  public static evaluatePOQuality(
    rawText: string,
    data: ExtractedPOData
  ): ExtractionQualityResult {
    const missingFields: string[] = [];
    const warnings: string[] = [];

    if (!data.poNumber || data.poNumber.trim().length < 2) {
      missingFields.push('poNumber');
    }
    if (!data.supplierName || data.supplierName.trim().length < 3) {
      missingFields.push('supplierName');
    }
    if (!data.poDate) {
      missingFields.push('poDate');
    }
    if (data.total === null || data.total === undefined || data.total <= 0) {
      missingFields.push('total');
    }

    const tableEvidence = this.detectItemTableEvidence(rawText);
    const lineItemsCount = data.lineItems ? data.lineItems.length : 0;

    let lineItemQualityOk = true;
    if (tableEvidence.hasTableEvidence && lineItemsCount === 0) {
      missingFields.push('lineItems');
      warnings.push(`PO contains evidence of an item table, but 0 line items were parsed.`);
      lineItemQualityOk = false;
    }

    const subtotal = data.subtotal ?? null;
    const tax = data.tax ?? null;
    const total = data.total ?? 0;

    let subtotalPlusTaxEqualsTotal = true;
    let discrepancyVariance = 0;
    const discrepancyDetails: string[] = [];

    if (subtotal !== null && tax !== null && total > 0) {
      const expectedTotal = Math.round((subtotal + tax) * 100) / 100;
      discrepancyVariance = Math.abs(expectedTotal - total);
      if (discrepancyVariance > 2.0) {
        subtotalPlusTaxEqualsTotal = false;
        discrepancyDetails.push(`PO Total mismatch: Subtotal (${subtotal}) + Tax (${tax}) = ${expectedTotal}, but Total is ${total}.`);
        warnings.push(`PO total financial discrepancy of ₹${discrepancyVariance}`);
      }
    }

    let score = 0.20;
    if (!missingFields.includes('poNumber')) score += 0.25;
    if (!missingFields.includes('supplierName')) score += 0.15;
    if (!missingFields.includes('poDate')) score += 0.15;
    if (!missingFields.includes('total')) score += 0.15;
    if (data.buyerName) score += 0.05;

    if (lineItemQualityOk) {
      score += 0.05;
    } else {
      score -= 0.35;
    }

    let confidence = Math.min(0.98, Math.max(0.10, Math.round(score * 100) / 100));

    let quality: 'high' | 'incomplete' | 'ambiguous' = 'high';
    let needsAiFallback = false;

    if (missingFields.length > 0) {
      quality = 'incomplete';
      needsAiFallback = true;
    } else if (!subtotalPlusTaxEqualsTotal) {
      quality = 'ambiguous';
      needsAiFallback = true;
    } else if (confidence < 0.85) {
      quality = 'incomplete';
      needsAiFallback = true;
    }

    if (needsAiFallback) {
      confidence = Math.min(confidence, 0.70);
    }

    return {
      quality,
      confidence,
      needsAiFallback,
      missingFields,
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
