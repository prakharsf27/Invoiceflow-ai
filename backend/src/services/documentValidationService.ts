import { IDocumentValidationCheck } from '../models/Document.js';

export interface DocumentMathValidationResult {
  isMathValid: boolean;
  computedSubtotal: number;
  computedTax: number;
  computedTotal: number;
  processedItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    taxAmount: number;
    total: number;
  }>;
  validationChecks: IDocumentValidationCheck[];
  discrepancies: string[];
}

class DocumentValidationService {
  /**
   * Independently computes line item math and invoice totals in TypeScript.
   * Compares against extracted amounts without making any AI call.
   */
  public validateFinancialMath(extractedData: any): DocumentMathValidationResult {
    const rawItems = Array.isArray(extractedData?.lineItems) ? extractedData.lineItems : [];
    const discount = typeof extractedData?.discount === 'number' ? extractedData.discount : 0;

    const processedItems = rawItems.map((item: any) => {
      const description = String(item.description || 'Line Item').trim();
      const quantity = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
      const unitPrice = typeof item.unitPrice === 'number' && item.unitPrice >= 0 ? item.unitPrice : 0;
      const hasExplicitTaxRate = typeof item.taxRate === 'number' && item.taxRate >= 0;
      const taxRate = hasExplicitTaxRate ? item.taxRate : null;
      const declaredTaxAmount = typeof item.taxAmount === 'number' && item.taxAmount >= 0 ? item.taxAmount : null;
      const declaredTotal = typeof item.total === 'number' && item.total > 0 ? item.total : null;

      const lineSubtotal = Number((quantity * unitPrice).toFixed(2));
      const taxAmount = declaredTaxAmount !== null
        ? declaredTaxAmount
        : (taxRate !== null
          ? Number(((lineSubtotal * taxRate) / 100).toFixed(2))
          : (declaredTotal !== null && declaredTotal > lineSubtotal ? Number((declaredTotal - lineSubtotal).toFixed(2)) : 0));
      const total = declaredTotal !== null ? declaredTotal : Number((lineSubtotal + taxAmount).toFixed(2));

      return {
        description,
        quantity,
        unitPrice,
        taxRate: taxRate ?? (lineSubtotal > 0 && taxAmount > 0 ? Number(((taxAmount / lineSubtotal) * 100).toFixed(2)) : 0),
        taxAmount,
        total,
      };
    });

    const computedSubtotal = Number(
      processedItems.reduce((sum: number, item: any) => sum + item.quantity * item.unitPrice, 0).toFixed(2)
    );
    const computedTax = Number(
      processedItems.reduce((sum: number, item: any) => sum + (item.taxAmount || 0), 0).toFixed(2)
    );
    const computedTotal = Number(
      Math.max(0, computedSubtotal + computedTax - discount).toFixed(2)
    );

    const declaredSubtotal =
      typeof extractedData?.subtotal === 'number' && extractedData.subtotal > 0
        ? extractedData.subtotal
        : computedSubtotal;
    const declaredTax =
      typeof extractedData?.tax === 'number' && extractedData.tax >= 0
        ? extractedData.tax
        : computedTax;
    const declaredTotal =
      typeof extractedData?.amount === 'number' && extractedData.amount > 0
        ? extractedData.amount
        : typeof extractedData?.total === 'number' && extractedData.total > 0
        ? extractedData.total
        : computedTotal;

    const discrepancies: string[] = [];
    let isMathValid = true;

    // Check 1: Check subtotal + tax - discount = total
    const expectedDeclaredTotal = Number((declaredSubtotal + declaredTax - discount).toFixed(2));
    if (Math.abs(expectedDeclaredTotal - declaredTotal) > 1.5) {
      isMathValid = false;
      discrepancies.push(
        `Declared Subtotal (₹${declaredSubtotal.toLocaleString('en-IN')}) + Tax (₹${declaredTax.toLocaleString('en-IN')}) does not equal Total (₹${declaredTotal.toLocaleString('en-IN')}).`
      );
    }

    // Check 2: Check line items sum vs declared subtotal/total
    if (processedItems.length > 0) {
      if (Math.abs(computedSubtotal - declaredSubtotal) > 2.5) {
        isMathValid = false;
        discrepancies.push(
          `Line items subtotal sum (₹${computedSubtotal.toLocaleString('en-IN')}) differs from declared invoice subtotal (₹${declaredSubtotal.toLocaleString('en-IN')}).`
        );
      }
      if (Math.abs(computedTotal - declaredTotal) > 2.5) {
        isMathValid = false;
        discrepancies.push(
          `Line items total sum (₹${computedTotal.toLocaleString('en-IN')}) differs from declared total (₹${declaredTotal.toLocaleString('en-IN')}).`
        );
      }
    }

    const validationChecks: IDocumentValidationCheck[] = [
      {
        id: `val-math-${Date.now()}`,
        title: 'Math & Tax Computations',
        passed: isMathValid,
        type: isMathValid ? 'success' : 'critical',
        detail: isMathValid
          ? `Calculations & GST verified. Subtotal (₹${declaredSubtotal.toLocaleString('en-IN')}) + Tax (₹${declaredTax.toLocaleString('en-IN')}) = Total (₹${declaredTotal.toLocaleString('en-IN')})`
          : discrepancies[0] || 'Math discrepancy detected in document amounts.',
      },
    ];

    return {
      isMathValid,
      computedSubtotal,
      computedTax,
      computedTotal,
      processedItems,
      validationChecks,
      discrepancies,
    };
  }
}

export const documentValidationService = new DocumentValidationService();
