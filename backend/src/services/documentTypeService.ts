import { DocumentType } from '../models/Document.js';

class DocumentTypeService {
  /**
   * Deterministically detect document type from filename heuristics without calling AI.
   */
  public detectTypeFromFilename(originalFileName: string): DocumentType {
    const fn = (originalFileName || '').toLowerCase().trim();

    // 1. Explicit negative PO patterns (e.g. 18_NO_PO_INV-TEST-018.pdf) -> Invoice
    if (/(?:no|non|without|zero)[_-]?po/i.test(fn)) {
      if (/\binv\b|\binv[-_]|invoice|tax[-_ ]?invoice|\bbill\b/i.test(fn) || fn.includes('inv-') || fn.includes('inv_') || fn.includes('invoice')) {
        return 'invoice';
      }
    }

    // 2. Invoice Indicators
    const hasInv =
      /\binv\b|\binv[-_]|invoice|tax[-_ ]?invoice|\bbill\b/i.test(fn) ||
      fn.includes('invoice') ||
      fn.includes('tax_invoice') ||
      fn.includes('bill') ||
      fn.includes('inv_') ||
      fn.includes('inv-');

    // 3. Purchase Order Indicators (Exclude negative prefixes)
    const isNegativePO = /(?:no|non|without|zero)[_-]?po/i.test(fn);
    const hasPO =
      !isNegativePO &&
      (/\bpo[-_]\d+/i.test(fn) ||
        /\bpo\b(?![_-]?inv)/i.test(fn) ||
        /\bp\.o\.?\b/i.test(fn) ||
        /purchase[-_ ]?order/i.test(fn) ||
        fn.includes('purchase_order') ||
        fn.includes('purchase-order') ||
        fn.includes('purchaseorder') ||
        fn.startsWith('po_') ||
        fn.startsWith('po-') ||
        fn.includes('_po-') ||
        fn.includes('-po-') ||
        fn.includes('_po_'));

    if (hasInv && !hasPO) return 'invoice';
    if (hasPO && !hasInv) return 'purchase_order';
    if (hasInv && hasPO) {
      if (fn.includes('purchase_order') || fn.startsWith('po')) return 'purchase_order';
      return 'invoice';
    }

    return 'unknown';
  }
}

export const documentTypeService = new DocumentTypeService();
