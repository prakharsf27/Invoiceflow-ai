import { DocumentType } from '../models/Document.js';

class DocumentTypeService {
  /**
   * Deterministically detect document type from filename heuristics without calling AI.
   */
  public detectTypeFromFilename(originalFileName: string): DocumentType {
    const fn = (originalFileName || '').toLowerCase().trim();

    // Purchase Order Patterns
    if (
      /\bpo\b|\bpo[-_]|\bp\.o\.?\b|purchase[-_ ]?order/i.test(fn) ||
      fn.includes('purchase_order') ||
      fn.includes('purchase-order') ||
      fn.includes('purchaseorder') ||
      fn.includes('po_') ||
      fn.includes('po-')
    ) {
      return 'purchase_order';
    }

    // Invoice Patterns
    if (
      /\binv\b|\binv[-_]|invoice|tax[-_ ]?invoice|\bbill\b/i.test(fn) ||
      fn.includes('invoice') ||
      fn.includes('tax_invoice') ||
      fn.includes('bill') ||
      fn.includes('inv_') ||
      fn.includes('inv-')
    ) {
      return 'invoice';
    }

    return 'unknown';
  }
}

export const documentTypeService = new DocumentTypeService();
