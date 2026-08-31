/**
 * Field Normalization Utilities for Invoices and Purchase Orders.
 * Ensures consistent data formatting across different vendor layouts
 * without destroying meaningful business identifiers.
 */

export class NormalizationHelper {
  /**
   * Normalize PO reference / PO number strings.
   * Examples:
   *   "PO-2026-00421" -> "PO-2026-00421"
   *   "PO 2026 00421"  -> "PO-2026-00421"
   *   "P.O. 2026-00421"-> "PO-2026-00421"
   *   "PO# 00421"     -> "PO-00421"
   */
  public static normalizePONumber(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    let val = raw.trim();
    if (!val) return null;

    // Remove leading descriptive words: "PO No:", "PO Number:", "Order Ref:", etc.
    val = val.replace(/^(?:p\.?o\.?\s*(?:no\.?|number|ref|#)?|purchase\s*order(?:\s*no\.?|\s*number|\s*ref)?|order\s*ref(?:erence)?)[\s#.:\-_]*/i, '');
    val = val.replace(/^#\s*/, '');

    // Standardize P.O. to PO
    val = val.replace(/^p\.o\./i, 'PO');

    // Replace internal consecutive spaces with single hyphen if numeric/alphanumeric pattern
    val = val.replace(/\s+/g, '-').replace(/--+/g, '-');

    // Clean leading/trailing punctuation except alphanumeric
    val = val.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');

    if (val.length < 3) return null;

    // If it was originally prefixed with PO or is a standard pattern, ensure PO-
    if (!/^po[-_]?/i.test(val) && /^po/i.test(raw.trim())) {
      val = `PO-${val}`;
    }

    return val.toUpperCase();
  }

  /**
   * Normalize Invoice Number.
   * Preserves standard "INV-2026-00987" format while stripping "Invoice Number:" label.
   */
  public static normalizeInvoiceNumber(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    let val = raw.trim();
    if (!val) return null;

    // Strip labels like "Invoice Number:", "Tax Invoice No:", "Invoice #:"
    val = val.replace(/^(?:tax\s*)?invoice\s*(?:number|no\.?|#|id)?[\s:.]+/i, '');
    val = val.replace(/^(?:inv|bill)\s*(?:number|no\.?|#)[\s:.]+/i, '');
    val = val.replace(/^#\s*/, '');
    val = val.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');

    if (val.length < 2) return null;
    return val;
  }

  /**
   * Normalize date strings into standard YYYY-MM-DD ISO format.
   */
  public static normalizeDate(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const str = raw.trim();
    if (!str) return null;

    const monthMap: Record<string, string> = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', sept: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12',
    };

    // 1. Check ISO format: YYYY-MM-DD
    const isoMatch = str.match(/\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    // 2. Check text month: "28 Aug 2026" or "28 August 2026" or "28-Aug-2026"
    const textMonthMatch = str.match(/\b(0?[1-9]|[12]\d|3[01])[\s\-_]+([a-zA-Z]{3,9})[\s\-_,]+(20\d{2})\b/);
    if (textMonthMatch) {
      const day = textMonthMatch[1].padStart(2, '0');
      const monthStr = textMonthMatch[2].toLowerCase();
      const year = textMonthMatch[3];
      const monthNum = monthMap[monthStr];
      if (monthNum) {
        return `${year}-${monthNum}-${day}`;
      }
    }

    // 3. Check "Aug 28, 2026"
    const textMonthFirstMatch = str.match(/\b([a-zA-Z]{3,9})[\s\-_]+(0?[1-9]|[12]\d|3[01])[\s\-_,]+(20\d{2})\b/);
    if (textMonthFirstMatch) {
      const monthStr = textMonthFirstMatch[1].toLowerCase();
      const day = textMonthFirstMatch[2].padStart(2, '0');
      const year = textMonthFirstMatch[3];
      const monthNum = monthMap[monthStr];
      if (monthNum) {
        return `${year}-${monthNum}-${day}`;
      }
    }

    // 4. Check DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = str.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    return null;
  }

  /**
   * Normalize numeric monetary amounts.
   * Strips currency symbols (₹, n, Rs., $, €, etc.), PDF artifact glyphs (■, ▪, ●, \uFFFD, \u25A0), and comma separators.
   */
  public static normalizeAmount(raw: string | number | null | undefined): number | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') {
      return isNaN(raw) ? null : Math.round(raw * 100) / 100;
    }

    if (typeof raw !== 'string') return null;
    let str = raw.trim();
    if (!str) return null;

    // Remove PDF artifact glyphs and currency symbols: ■, ▪, ●, \uFFFD, \u25A0, \u25AA, ₹, $, €, £
    str = str.replace(/[\u25A0\u25AA\uFFFD■▪●₹$€£]/g, ' ');
    str = str.replace(/\b[nN](?=\d)/g, '');
    str = str.replace(/^(?:inr|rs\.?|usd|eur|gbp)\s*/i, '');
    // Remove all commas and extra whitespace
    str = str.replace(/,/g, '').trim();

    // Extract first valid numeric string with optional decimals
    const numMatch = str.match(/-?\d+(?:\.\d+)?/);
    if (!numMatch) return null;

    const parsed = parseFloat(numMatch[0]);
    if (isNaN(parsed) || !isFinite(parsed)) return null;

    return Math.round(parsed * 100) / 100;
  }

  /**
   * Calculate derived due date from invoice date and payment terms (e.g. "Net 30 Days").
   * Stored separately as calculatedDueDate to avoid fabricating extracted dueDate.
   */
  public static calculateDueDateFromTerms(invoiceDate: string | null | undefined, terms: string | null | undefined): string | null {
    if (!invoiceDate || !terms) return null;
    const normDate = this.normalizeDate(invoiceDate);
    if (!normDate) return null;

    const daysMatch = terms.match(/net\s*(\d+)/i);
    if (daysMatch) {
      const days = parseInt(daysMatch[1], 10);
      const d = new Date(normDate);
      if (isNaN(d.getTime())) return null;
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    }
    return null;
  }

  /**
   * Normalize currency symbol or code to standard ISO 4217 code.
   */
  public static normalizeCurrency(raw: string | null | undefined): string {
    if (!raw || typeof raw !== 'string') return 'INR';
    const clean = raw.trim().toUpperCase();

    if (clean.includes('INR') || clean.includes('₹') || clean.includes('RS')) return 'INR';
    if (clean.includes('USD') || clean.includes('$')) return 'USD';
    if (clean.includes('EUR') || clean.includes('€')) return 'EUR';
    if (clean.includes('GBP') || clean.includes('£')) return 'GBP';

    return 'INR';
  }

  /**
   * Extract and validate Indian GSTIN (15 characters).
   */
  public static normalizeGSTIN(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const match = clean.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/);
    if (match) {
      return match[0];
    }

    if (clean.length === 15 && /^\d{2}[A-Z]{5}/.test(clean)) {
      return clean;
    }

    return null;
  }

  /**
   * Normalize email address.
   */
  public static normalizeEmail(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const match = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0].toLowerCase() : null;
  }

  /**
   * Normalize phone number.
   */
  public static normalizePhone(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const match = raw.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
    return match ? match[0] : null;
  }

  /**
   * Clean and normalize company/supplier names (stripping labels like "Seller:", "Supplier:").
   */
  public static cleanCompanyName(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    let name = raw.trim();
    if (!name) return null;

    // Remove prefixes
    name = name.replace(/^(?:seller|supplier|vendor|from|company|biller|issued\s*by|sold\s*by)[\s#.:\-_]*/i, '');
    name = name.replace(/\s+/g, ' ').trim();

    if (name.length < 3 || /^[0-9\W]+$/.test(name)) return null;

    return name;
  }
}
