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

    // Remove leading descriptive words: "PO No:", "PO Number:", "Order Ref:", "PO:", "PO -", etc.
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
   * Pre-normalize OCR text before passing to the deterministic parser.
   * Cleans OCR confidence artifacts, normalizes line breaks, and standardizes common field labels.
   */
  public static normalizeOCRText(raw: string | null | undefined): string {
    if (!raw || typeof raw !== 'string') return '';
    let text = raw;

    // 1. Normalize line endings and whitespace artifacts
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    text = text.replace(/[\u00A0\u1680\u180e\u2000-\u200a\u202f\u205f\u3000\u200B\uFEFF]/g, ' ');

    // 2. Normalize currency glyphs and OCR noise
    text = text.replace(/[\u25A0\u25AA\uFFFD■▪●]/g, ' ');
    text = text.replace(/(?:^|\s)(?:₹|INR|Rs\.?|Rs)(?=\s*[\d,])/gi, ' ₹');

    // 3. Normalize spaced GSTIN tokens (e.g. "27 AAECA 1234 F 1 Z 5" -> "27AAECA1234F1Z5")
    text = text.replace(/\b(\d{2})\s+([A-Z]{5})\s+(\d{4})\s+([A-Z]{1})\s*([A-Z\d]{1})\s*([Zz]{1})\s*([A-Z\d]{1})\b/g, '$1$2$3$4$5$6$7');

    // 4. Normalize common label colons safely (preserving newlines and hyphens inside identifiers)
    text = text.replace(/\b(GSTIN|GST|PO|INV|INVOICE|DATE|DUE|TOTAL|SUBTOTAL)[^\S\r\n]*[:：][^\S\r\n]*/gi, '$1: ');

    // 5. Clean trailing spaces per line
    text = text.split('\n').map((l) => l.trimEnd()).join('\n');

    return text.trim();
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
   * Stored as dueDate or calculatedDueDate according to business requirements.
   */
  public static calculateDueDateFromTerms(invoiceDate: string | null | undefined, terms: string | null | undefined): string | null {
    if (!invoiceDate || !terms) return null;
    const normDate = this.normalizeDate(invoiceDate);
    if (!normDate) return null;

    const lower = terms.toLowerCase().trim();
    if (lower.includes('immediate') || lower.includes('receipt') || lower.includes('due on receipt')) {
      return normDate;
    }

    const daysMatch = lower.match(/(?:net\s*)?(\d{1,3})\s*(?:days?)?/);
    if (daysMatch) {
      const days = parseInt(daysMatch[1], 10);
      if (!isNaN(days) && days >= 0 && days <= 365) {
        const d = new Date(normDate);
        if (isNaN(d.getTime())) return null;
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
      }
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
   * Validate whether a string is a valid, authentic supplier/vendor name.
   * Strictly rejects:
   * - Address fragments (e.g. "Plot 4, Sector 62, Noida", "Suite 400", "123 Main Street")
   * - Filenames & paths (e.g. "invoice.pdf", "20_SCANNED_CLEAN_INV-TEST-020.png")
   * - Generic document labels (e.g. "TAX INVOICE", "BILLED TO", "SHIP TO")
   * - GSTIN / Phone numbers / Bank strings
   * - Punctuation/garbage/symbol sequences
   */
  public static isValidSupplierName(name: string | null | undefined): boolean {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim();
    if (clean.length < 3 || clean.length > 100) return false;

    // Must contain at least 3 alphabetic letters
    if (!/[a-zA-Z].*[a-zA-Z].*[a-zA-Z]/.test(clean)) return false;

    // 1. Disqualify Filenames & paths
    if (/\.(?:pdf|png|jpg|jpeg|tiff|bmp|csv|xlsx|txt)$/i.test(clean)) return false;
    if (/(?:^|[\/\\])(?:[a-zA-Z0-9_\-]+\.(?:pdf|png|jpg|jpeg))\b/i.test(clean)) return false;
    if (/^(?:IMG_|SCAN_|DOC_|SCREENSHOT)/i.test(clean)) return false;

    // 2. Disqualify Address fragments & location indicators
    const addressKeywords = /\b(?:suite|floor|flat|plot|door|room|shop|block|sector|phase|cross|main\s*road|street|st\.|road|rd\.|avenue|ave\.|lane|highway|expressway|nagar|marg|industrial\s*area|tech\s*park|pincode|pin\s*code|pin[\s:]*\d{6}|zip[\s:]*\d{5,6})\b/i;
    if (addressKeywords.test(clean)) return false;

    // Disqualify starting with door/flat/plot number patterns
    if (/^(?:#|plot\s*(?:no\.?|#)?|flat\s*(?:no\.?|#)?|door\s*(?:no\.?|#)?|suite\s*(?:no\.?|#)?|shop\s*(?:no\.?|#)?|building\s*(?:no\.?|#)?)\s*\d+/i.test(clean)) return false;

    // Disqualify bare city or state names
    if (/^(?:bangalore|bengaluru|mumbai|delhi|new\s*delhi|hyderabad|chennai|kolkata|noida|greater\s*noida|gurgaon|gurugram|pune|ahmedabad|karnataka|maharashtra|tamil\s*nadu|telangana|uttar\s*pradesh|haryana|gujarat|india|usa|united\s*states)$/i.test(clean)) return false;

    // 3. Disqualify Generic headers and section keywords
    const genericHeaders = /^(?:tax\s*invoice|invoice|tax|bill\s*of\s*supply|bill|purchase\s*order|po|original\s*for\s*recipient|duplicate\s*for\s*transporter|triplicate|billed\s*to|bill\s*to|ship\s*to|shipped\s*to|sold\s*to|buyer|consignee|client|customer|vendor|supplier|seller|details|particulars|line\s*items?|description|subtotal|total|amount|grand\s*total|tax\s*amount|gst|gstin|pan|cin|date|invoice\s*date|due\s*date|po\s*number|order\s*number|bank\s*details|account\s*number|ifsc|terms|payment\s*terms|authorized\s*signatory|thank\s*you|signature)$/i;
    if (genericHeaders.test(clean)) return false;

    // 4. Disqualify if it matches a GSTIN or phone number directly
    if (/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/.test(clean)) return false;
    if (/^\+?91[\s-]?\d{10}$/.test(clean)) return false;

    // 5. Symbol density check: reject if non-alphanumeric ratio exceeds 30%
    const symbolCount = (clean.match(/[^a-zA-Z0-9\s.&,\-]/g) || []).length;
    if (symbolCount / clean.length > 0.3) return false;

    return true;
  }

  /**
   * Scores how likely a candidate text line represents a genuine supplier name.
   * Higher score = stronger match.
   */
  public static scoreSupplierCandidate(line: string): number {
    if (!this.isValidSupplierName(line)) return -100;
    let score = 10;
    const clean = line.trim();

    // Bonus for standard corporate suffixes
    if (/\b(?:pvt\s*ltd|private\s*limited|ltd|limited|llc|inc|llp|corp|corporation)\b/i.test(clean)) {
      score += 40;
    }

    // Bonus for industry terms
    if (/\b(?:technologies|solutions|systems|services|infra|industries|enterprises|labs|traders|consulting|logistics|hardware|software|cloud)\b/i.test(clean)) {
      score += 25;
    }

    // Title Case bonus
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/.test(clean)) {
      score += 15;
    }

    return score;
  }

  /**
   * Validate whether a string is a strict, valid 15-character Indian GSTIN.
   */
  public static isValidGSTIN(gstin: string | null | undefined): boolean {
    if (!gstin || typeof gstin !== 'string') return false;
    const clean = gstin.toUpperCase().trim();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(clean)) {
      return false;
    }
    const stateCode = parseInt(clean.substring(0, 2), 10);
    return (stateCode >= 1 && stateCode <= 38) || stateCode === 97 || stateCode === 99;
  }

  /**
   * Validate whether a string is a plausible PO Number.
   */
  public static isValidPONumber(poNumber: string | null | undefined): boolean {
    if (!poNumber || typeof poNumber !== 'string') return false;
    const clean = poNumber.trim();
    if (clean.length < 3 || clean.length > 30) return false;
    if (/^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(clean)) return false; // Reject dates
    if (this.isValidGSTIN(clean)) return false; // Reject GSTINs
    const compact = clean.replace(/[\s-]/g, '');
    if (/^(?:\+?91)?[6-9]\d{9}$/.test(compact)) return false; // Reject phone numbers
    if (/^(?:po|purchase\s*order|order|ref|reference|null|none|n\/a|undefined|unknown|invoice|bill)$/i.test(clean)) return false;
    return true;
  }

  /**
   * Validate whether a string is a plausible Invoice Number.
   */
  public static isValidInvoiceNumber(invoiceNumber: string | null | undefined): boolean {
    if (!invoiceNumber || typeof invoiceNumber !== 'string') return false;
    const clean = invoiceNumber.trim();
    if (clean.length < 2 || clean.length > 35) return false;
    if (/^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(clean)) return false; // Reject dates
    if (this.isValidGSTIN(clean)) return false; // Reject GSTINs
    const compact = clean.replace(/[\s-]/g, '');
    if (/^(?:\+?91)?[6-9]\d{9}$/.test(compact)) return false; // Reject phone numbers
    if (/^(?:invoice|tax\s*invoice|bill|inv|null|none|n\/a|undefined|unknown|date|total|amount)$/i.test(clean)) return false;
    return true;
  }

  /**
   * Extract and validate Indian GSTIN (15 characters) with positional OCR repair.
   * Strict format: 2-digit state code (01-38, 97, 99) + 10-char PAN + 1-char entity number + Z + 1-char checksum.
   */
  public static normalizeGSTIN(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    let clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // 1. Direct standard 15-character match with state code verification
    if (/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(clean)) {
      const stateCode = parseInt(clean.substring(0, 2), 10);
      if ((stateCode >= 1 && stateCode <= 38) || stateCode === 97 || stateCode === 99) {
        return clean;
      }
    }

    // 2. Positional OCR Repair for 15-character candidate:
    // Pos 0-1 (State digits): O->0, I/L->1, Z->2, S->5, B->8
    // Pos 2-6 (PAN 5 alpha): 0->O, 1->I, 2->Z, 5->S, 8->B
    // Pos 7-10 (PAN 4 digits): O->0, I/L->1, Z->2, S->5, B->8
    // Pos 11 (PAN 1 alpha): 0->O, 1->I, 2->Z, 5->S, 8->B
    // Pos 13 (Default Z): 2->Z
    if (clean.length === 15) {
      const digitsMap: Record<string, string> = { O: '0', I: '1', L: '1', Z: '2', S: '5', B: '8' };
      const alphaMap: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B' };

      const chars = clean.split('');

      // State digits
      chars[0] = digitsMap[chars[0]] || chars[0];
      chars[1] = digitsMap[chars[1]] || chars[1];

      // PAN letters
      for (let i = 2; i <= 6; i++) {
        chars[i] = alphaMap[chars[i]] || chars[i];
      }

      // PAN digits
      for (let i = 7; i <= 10; i++) {
        chars[i] = digitsMap[chars[i]] || chars[i];
      }

      // PAN letter
      chars[11] = alphaMap[chars[11]] || chars[11];

      // Default Z
      if (chars[13] === '2') chars[13] = 'Z';

      const repaired = chars.join('');
      if (/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(repaired)) {
        const stateCode = parseInt(repaired.substring(0, 2), 10);
        if ((stateCode >= 1 && stateCode <= 38) || stateCode === 97 || stateCode === 99) {
          return repaired;
        }
      }
    }

    // 3. Search within longer text
    const regex = /\b(\d{2})([A-Z]{5})(\d{4})([A-Z]{1})([A-Z\d]{1})([2Z]{1})([A-Z\d]{1})\b/g;
    let match;
    while ((match = regex.exec(clean)) !== null) {
      let val = match[0];
      val = val.substring(0, 13) + 'Z' + val.substring(14);
      const stateCode = parseInt(val.substring(0, 2), 10);
      if ((stateCode >= 1 && stateCode <= 38) || stateCode === 97 || stateCode === 99) {
        return val;
      }
    }

    return null;
  }

  /**
   * Normalize email address with contextual validation.
   */
  public static normalizeEmail(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const match = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!match) return null;
    const email = match[0].toLowerCase();
    if (email.endsWith('.example') || email.includes('localhost')) return email;
    return email;
  }

  /**
   * Normalize phone number with contextual guard to prevent matching account numbers or dates.
   */
  public static normalizePhone(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const labeledMatch = raw.match(/(?:phone|tel|telephone|mobile|contact|cell)[\s#.:\-_]*(?:\+91[\s-]?)?([6-9]\d{9})\b/i);
    if (labeledMatch) {
      return `+91 ${labeledMatch[1]}`;
    }

    const directMatch = raw.match(/\+91[\s-]?([6-9]\d{9})\b/);
    if (directMatch) {
      return `+91 ${directMatch[1]}`;
    }

    return null;
  }

  /**
   * Clean and normalize company/supplier names (stripping labels like "Seller:", "Supplier:").
   * Automatically passes through strict isValidSupplierName validation.
   */
  public static cleanCompanyName(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    let name = raw.trim();
    if (!name) return null;

    // Remove prefixes
    name = name.replace(/^(?:seller|supplier|vendor|from|company|biller|issued\s*by|sold\s*by|billed\s*by)[\s#.:\-_]*/i, '');
    name = name.replace(/\s+/g, ' ').trim();

    if (!this.isValidSupplierName(name)) {
      return null;
    }

    return name;
  }

  /**
   * Clean and validate Bank Name (rejecting descriptive phrases like "details verified by").
   */
  public static cleanBankName(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    let name = raw.trim();
    if (!name) return null;

    // Strip labels
    name = name.replace(/^(?:bank\s*name|bank)[\s:.]+/i, '').trim();

    // Discard non-bank descriptive phrases
    if (
      /^(?:details|verified|account|transferred|payable|remittance|beneficiary|terms|notes|via|by)/i.test(name) ||
      name.length < 3 ||
      name.length > 50 ||
      /^[0-9\W]+$/.test(name)
    ) {
      return null;
    }

    return name;
  }
}
