import { DocumentType } from '../models/Document.js';

class DocumentTypeService {
  /**
   * Deterministically detect document type from filename heuristics without calling AI.
   */
  public detectTypeFromFilename(originalFileName: string): DocumentType {
    const fn = (originalFileName || '').toLowerCase().trim();

    // Purchase Order Patterns
    if (
      /\bpo[-_]?\d+/i.test(fn) ||
      fn.includes('purchase_order') ||
      fn.includes('purchase-order') ||
      fn.includes('purchaseorder') ||
      fn.startsWith('po_') ||
      fn.startsWith('po-') ||
      fn.startsWith('po ') ||
      fn.includes('_po_') ||
      fn.includes('-po-')
    ) {
      return 'purchase_order';
    }

    // Invoice Patterns
    if (
      /\binv[-_]?\d+/i.test(fn) ||
      fn.includes('invoice') ||
      fn.includes('tax_invoice') ||
      fn.includes('bill') ||
      fn.startsWith('inv_') ||
      fn.startsWith('inv-') ||
      fn.startsWith('inv ') ||
      fn.includes('_inv_') ||
      fn.includes('-inv-')
    ) {
      return 'invoice';
    }

    return 'unknown';
  }
}

export const documentTypeService = new DocumentTypeService();
