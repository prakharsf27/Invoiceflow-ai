import { PurchaseOrderModel } from '../models/PurchaseOrder.js';
import { DocumentModel } from '../models/Document.js';
import { InvoiceModel } from '../models/Invoice.js';
import { IPOMatchResult } from '../models/Document.js';
import { NormalizationHelper } from './extraction/normalizationHelper.js';

export class POMatchingNormalizer {
  /**
   * Normalize money/currency values to clean numeric float.
   * Strips ₹, $, €, £, Rs., commas, whitespace.
   */
  public static normalizeMoney(val: any): number {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (val === null || val === undefined) return 0;
    const clean = String(val)
      .replace(/[\u25A0\u25AA\uFFFD■▪●₹$€£]/g, '')
      .replace(/\bRs\.?\s*/gi, '')
      .replace(/,/g, '')
      .replace(/\s+/g, '')
      .trim();
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Normalize quantity values to clean numeric float.
   */
  public static normalizeQuantity(val: any): number {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (val === null || val === undefined) return 0;
    const clean = String(val)
      .replace(/,/g, '')
      .replace(/[^\d.]/g, '')
      .trim();
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Generic text normalization: lowercase, collapse whitespace, trim.
   */
  public static normalizeText(val: any): string {
    if (!val) return '';
    return String(val)
      .toLowerCase()
      .replace(/[\s\-_/\\,.]+/g, ' ')
      .trim();
  }

  /**
   * Line item description normalization:
   * Strips leading item numbering (e.g. "1.", "(2)", "[3]"), punctuation, extra spaces.
   */
  public static normalizeItemDescription(val: any): string {
    if (!val) return '';
    return String(val)
      .toLowerCase()
      .replace(/^\s*\d+[.)\]\s-]*/, '')
      .replace(/[\u25A0\u25AA\uFFFD■▪●₹$€£()\[\]{}:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Company/Supplier name normalization:
   * Strips common suffixes (Pvt Ltd, Private Limited, Ltd, LLC, Inc, Corp).
   */
  public static normalizeSupplier(val: any): string {
    if (!val) return '';
    return String(val)
      .toLowerCase()
      .replace(/\b(?:private\s*limited|pvt\s*ltd|ltd|limited|inc|incorporated|llc|corp|corporation|co)\b/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Normalize PO number for robust alphanumeric comparison.
   */
  public static normalizePONumber(val: any): string {
    if (!val) return '';
    return String(val)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }
}

class POMatchingService {
  /**
   * Automatically search company-scoped POs for candidate matches.
   * Runs 100% deterministically in TypeScript without external AI calls.
   */
  public async matchInvoiceToPO(
    companyId: string,
    extractedInvoice: any
  ): Promise<IPOMatchResult> {
    const rawPoNumber = (extractedInvoice?.poNumber || '').trim();
    const rawSupplierGstin = (extractedInvoice?.supplierGstin || '').trim();
    const rawSupplierName = (extractedInvoice?.supplierName || '').trim();
    const isPoValid = NormalizationHelper.isValidPONumber(rawPoNumber);
    const isGstinValid = NormalizationHelper.isValidGSTIN(rawSupplierGstin);
    const isSupplierValid = NormalizationHelper.isValidSupplierName(rawSupplierName);

    const invoiceTotal = POMatchingNormalizer.normalizeMoney(
      extractedInvoice?.amount ?? extractedInvoice?.total ?? 0
    );

    // If rawPoNumber was present on invoice but invalid/corrupted (e.g. "PPE" or date)
    if (rawPoNumber && !isPoValid) {
      console.log(`[PO-MATCH DEBUG] Invalid/corrupted PO number rejected: "${rawPoNumber}"`);
      return {
        poNumber: undefined,
        matchStatus: 'no_match',
        matchScore: 0,
        matchedFields: [],
        discrepancies: ['PO reference could not be reliably extracted from OCR.'],
      };
    }

    let candidatePO: any = null;
    let isFallbackMatch = false;

    // 1. Priority 1: Exact / Alphanumeric PO Number Match in PurchaseOrders collection
    if (rawPoNumber && isPoValid) {
      candidatePO = await PurchaseOrderModel.findOne({
        companyId,
        $or: [
          { poNumber: new RegExp(`^${rawPoNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { id: rawPoNumber },
        ],
      } as any);

      // Alphanumeric fallback if hyphens or spaces differ
      if (!candidatePO) {
        const normSearchPO = POMatchingNormalizer.normalizePONumber(rawPoNumber);
        const allPOs = await PurchaseOrderModel.find({ companyId }).lean();
        candidatePO = allPOs.find(
          (p) => POMatchingNormalizer.normalizePONumber(p.poNumber) === normSearchPO
        );
      }
    }

    // 2. Priority 2: Look for extracted PO Documents in Document collection
    if (!candidatePO && rawPoNumber && isPoValid) {
      const poDoc: any = await DocumentModel.findOne({
        companyId,
        documentType: 'purchase_order',
        $or: [
          { 'extractedData.poNumber': new RegExp(`^${rawPoNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { originalFileName: new RegExp(rawPoNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        ],
      } as any);

      if (poDoc && poDoc.extractedData) {
        candidatePO = {
          id: poDoc.linkedRecordId || poDoc.id,
          poNumber: poDoc.extractedData.poNumber || rawPoNumber,
          supplierName: poDoc.extractedData.supplierName || rawSupplierName,
          supplierGstin: poDoc.extractedData.supplierGstin || '',
          totalAmount: poDoc.extractedData.total || 0,
          items: poDoc.extractedData.lineItems || [],
          isDocReference: true,
        };
      }
    }

    // 3. Priority 3: Candidate suggestion by Supplier GSTIN / Name ONLY if valid and genuine supplier entity
    if (!candidatePO && !rawPoNumber && (isGstinValid || isSupplierValid)) {
      const orConds: any[] = [];
      if (isGstinValid) orConds.push({ supplierGstin: new RegExp(`^${rawSupplierGstin}$`, 'i') });
      if (isSupplierValid) orConds.push({ supplierName: new RegExp(rawSupplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });

      if (orConds.length > 0) {
        candidatePO = await PurchaseOrderModel.findOne({
          companyId,
          $or: orConds,
        } as any);
        if (candidatePO) {
          isFallbackMatch = true;
        }
      }
    }

    // Handle case where no candidate PO is found or PO reference was invalid
    if (!candidatePO) {
      console.log(`[PO-MATCH DEBUG] No candidate PO found for company: ${companyId}, PO ref: "${rawPoNumber}"`);
      const discrepancyMsg = rawPoNumber
        ? (isPoValid
            ? `Purchase Order ${rawPoNumber} referenced on invoice was not found in company procurement records.`
            : 'PO reference could not be reliably extracted from OCR.')
        : 'No purchase order reference or supplier PO found in company records.';

      return {
        poNumber: isPoValid ? rawPoNumber : undefined,
        matchStatus: 'no_match',
        matchScore: 0,
        matchedFields: [],
        discrepancies: [discrepancyMsg],
      };
    }

    // -----------------------------------------------------------------
    // Perform Granular 3-Way Matching Comparison
    // -----------------------------------------------------------------
    const matchedFields: string[] = [];
    const discrepancies: string[] = [];
    let score = 0;

    // A. PO Number Comparison (30 Points)
    const normInvPO = POMatchingNormalizer.normalizePONumber(rawPoNumber);
    const normPoPO = POMatchingNormalizer.normalizePONumber(candidatePO.poNumber);
    const poNumMatch = normInvPO && normPoPO && normInvPO === normPoPO;

    if (poNumMatch) {
      matchedFields.push('PO Number');
      score += 30;
    } else if (rawPoNumber) {
      discrepancies.push(`Invoice references PO ${rawPoNumber}, but matched PO record is ${candidatePO.poNumber}.`);
    }

    // B. Supplier Compatibility Comparison (25 Points)
    const candidateSupplierName = candidatePO.supplierName || '';
    const candidateSupplierGstin = candidatePO.supplierGstin || '';
    const normInvSup = POMatchingNormalizer.normalizeSupplier(rawSupplierName);
    const normPoSup = POMatchingNormalizer.normalizeSupplier(candidateSupplierName);

    let supplierMatch = false;
    if (rawSupplierGstin && candidateSupplierGstin && rawSupplierGstin.toUpperCase() === candidateSupplierGstin.toUpperCase()) {
      supplierMatch = true;
    } else if (normInvSup && normPoSup) {
      if (normInvSup === normPoSup || normInvSup.includes(normPoSup) || normPoSup.includes(normInvSup)) {
        supplierMatch = true;
      }
    } else if (!rawSupplierName && !candidateSupplierName) {
      supplierMatch = true;
    }

    if (supplierMatch) {
      matchedFields.push('Supplier Identity');
      score += 25;
    } else {
      discrepancies.push(`SUPPLIER_MISMATCH: Supplier "${rawSupplierName}" differs from PO supplier "${candidateSupplierName}".`);
    }

    // C. Total Amount Comparison (25 Points)
    const poTotal = POMatchingNormalizer.normalizeMoney(candidatePO.totalAmount ?? candidatePO.total ?? 0);
    const amountVariance = Math.abs(invoiceTotal - poTotal);

    if (invoiceTotal > 0 && poTotal > 0) {
      if (amountVariance <= 2.0) {
        matchedFields.push('Total Financial Amount');
        score += 25;
      } else {
        const diffStr = (invoiceTotal - poTotal).toLocaleString('en-IN');
        discrepancies.push(
          `TOTAL_MISMATCH: Total amount variance: Invoice (₹${invoiceTotal.toLocaleString('en-IN')}) vs PO (₹${poTotal.toLocaleString('en-IN')}) [Diff: ${invoiceTotal > poTotal ? '+' : ''}₹${diffStr}].`
        );
      }
    } else if (invoiceTotal === 0 && poTotal === 0) {
      score += 25;
    }

    // D. Granular Line Item Comparison (20 Points)
    const rawInvItems = Array.isArray(extractedInvoice?.lineItems) ? extractedInvoice.lineItems : [];
    const rawPoItems = Array.isArray(candidatePO.items)
      ? candidatePO.items
      : (Array.isArray(candidatePO.lineItems) ? candidatePO.lineItems : []);

    const invItems = rawInvItems.map((item: any) => ({
      description: String(item.description || '').trim(),
      normDesc: POMatchingNormalizer.normalizeItemDescription(item.description),
      quantity: POMatchingNormalizer.normalizeQuantity(item.quantity),
      unitPrice: POMatchingNormalizer.normalizeMoney(item.unitPrice),
      total: POMatchingNormalizer.normalizeMoney(item.total),
    }));

    const poItems = rawPoItems.map((item: any) => ({
      description: String(item.description || '').trim(),
      normDesc: POMatchingNormalizer.normalizeItemDescription(item.description),
      quantity: POMatchingNormalizer.normalizeQuantity(item.quantity),
      unitPrice: POMatchingNormalizer.normalizeMoney(item.unitPrice),
      total: POMatchingNormalizer.normalizeMoney(item.total),
    }));

    let lineItemScore = 0;
    const quantityComparisonDetails: string[] = [];
    const unitPriceComparisonDetails: string[] = [];
    const lineTotalComparisonDetails: string[] = [];

    if (invItems.length > 0 && poItems.length > 0) {
      let matchedItemsCount = 0;
      const matchedPoIndices = new Set<number>();

      for (let i = 0; i < invItems.length; i++) {
        const invItem = invItems[i];
        let bestPoIndex = -1;

        // Try exact/containment description match
        for (let j = 0; j < poItems.length; j++) {
          if (matchedPoIndices.has(j)) continue;
          const poItem = poItems[j];
          if (
            invItem.normDesc === poItem.normDesc ||
            invItem.normDesc.includes(poItem.normDesc) ||
            poItem.normDesc.includes(invItem.normDesc)
          ) {
            bestPoIndex = j;
            break;
          }
        }

        // If description didn't directly match, but array length is identical, check position
        if (bestPoIndex === -1 && invItems.length === poItems.length && !matchedPoIndices.has(i)) {
          bestPoIndex = i;
        }

        if (bestPoIndex !== -1) {
          matchedPoIndices.add(bestPoIndex);
          matchedItemsCount++;
          const poItem = poItems[bestPoIndex];

          // Quantity Comparison
          const qtyDiff = Math.abs(invItem.quantity - poItem.quantity);
          if (invItem.quantity > 0 && poItem.quantity > 0 && qtyDiff > 0.01) {
            const reason = `QUANTITY_MISMATCH: Item "${invItem.description}" quantity variance (Invoice: ${invItem.quantity} vs PO: ${poItem.quantity}).`;
            discrepancies.push(reason);
            quantityComparisonDetails.push(reason);
          } else {
            quantityComparisonDetails.push(`Item "${invItem.description}" quantity matched (${invItem.quantity})`);
          }

          // Unit Price Comparison
          const priceDiff = Math.abs(invItem.unitPrice - poItem.unitPrice);
          if (invItem.unitPrice > 0 && poItem.unitPrice > 0 && priceDiff > 2.0) {
            const reason = `PRICE_MISMATCH: Item "${invItem.description}" unit price variance (Invoice: ₹${invItem.unitPrice.toLocaleString('en-IN')} vs PO: ₹${poItem.unitPrice.toLocaleString('en-IN')}).`;
            discrepancies.push(reason);
            unitPriceComparisonDetails.push(reason);
          } else {
            unitPriceComparisonDetails.push(`Item "${invItem.description}" unit price matched (₹${invItem.unitPrice.toLocaleString('en-IN')})`);
          }

          // Line Total Comparison
          const totalDiff = Math.abs(invItem.total - poItem.total);
          if (invItem.total > 0 && poItem.total > 0 && totalDiff > 5.0) {
            lineTotalComparisonDetails.push(`Item "${invItem.description}" total variance (Invoice: ₹${invItem.total.toLocaleString('en-IN')} vs PO: ₹${poItem.total.toLocaleString('en-IN')})`);
          } else {
            lineTotalComparisonDetails.push(`Item "${invItem.description}" line total matched (₹${invItem.total.toLocaleString('en-IN')})`);
          }
        } else {
          discrepancies.push(`EXTRA_ITEM: Invoice contains item "${invItem.description}" not listed on PO.`);
        }
      }

      // Check for missing items in PO
      for (let j = 0; j < poItems.length; j++) {
        if (!matchedPoIndices.has(j)) {
          discrepancies.push(`MISSING_ITEM: PO item "${poItems[j].description}" is missing from invoice.`);
        }
      }

      if (matchedItemsCount === poItems.length && discrepancies.filter((d) => d.includes('MISMATCH') || d.includes('ITEM')).length === 0) {
        lineItemScore = 20;
        matchedFields.push('Line Items (Quantities & Unit Prices Verified)');
      } else if (matchedItemsCount > 0) {
        lineItemScore = Math.round((matchedItemsCount / Math.max(poItems.length, invItems.length)) * 15);
        matchedFields.push('Partial Line Items Verified');
      }
    } else if (invItems.length > 0 || poItems.length > 0) {
      lineItemScore = 15;
      matchedFields.push('Financial Schedule Verified');
    } else {
      lineItemScore = 20;
      matchedFields.push('Order Total Reconciled');
    }

    score += lineItemScore;

    if (isFallbackMatch) {
      discrepancies.push('PO candidate suggested via supplier fallback (No explicit PO number on invoice). Requires manual confirmation.');
    }

    // Determine final status based on score and discrepancies
    let matchStatus: IPOMatchResult['matchStatus'] = 'no_match';
    if (!isFallbackMatch && discrepancies.length === 0 && score >= 85) {
      matchStatus = 'matched';
      score = 100;
    } else if (discrepancies.some((d) => d.includes('MISMATCH') || d.includes('ITEM') || d.includes('differs'))) {
      matchStatus = 'mismatch';
    } else if (score >= 50 || poNumMatch || isFallbackMatch) {
      matchStatus = 'partial_match';
    } else {
      matchStatus = 'needs_review';
    }

    const finalScore = Math.min(100, Math.max(0, score));

    // -----------------------------------------------------------------
    // Structured Debug Logging
    // -----------------------------------------------------------------
    console.log(`
[PO-MATCH DEBUG]
PO Number: ${candidatePO.poNumber}
Invoice Number: ${extractedInvoice?.invoiceNumber || 'N/A'}
PO ID: ${candidatePO.id || candidatePO._id?.toString() || 'N/A'}
Invoice ID: ${extractedInvoice?.id || 'N/A'}

PO total: ₹${poTotal.toLocaleString('en-IN')}
Invoice total: ₹${invoiceTotal.toLocaleString('en-IN')}

PO line items: ${poItems.length}
Invoice line items: ${invItems.length}

Supplier PO: "${candidateSupplierName}"
Supplier Invoice: "${rawSupplierName}"
Supplier Match: ${supplierMatch}

Quantity comparison: ${quantityComparisonDetails.join('; ') || 'N/A'}
Unit price comparison: ${unitPriceComparisonDetails.join('; ') || 'N/A'}
Line total comparison: ${lineTotalComparisonDetails.join('; ') || 'N/A'}

Final score: ${finalScore}%
Final status: ${matchStatus}
Mismatch reasons: ${discrepancies.length > 0 ? discrepancies.join(' | ') : 'None (100% Match)'}
`);

    const result: IPOMatchResult = {
      purchaseOrderId: candidatePO.id || candidatePO._id?.toString(),
      poNumber: candidatePO.poNumber,
      matchStatus,
      matchScore: finalScore,
      matchedFields,
      discrepancies,
      poDetails: {
        poNumber: candidatePO.poNumber,
        supplierName: candidatePO.supplierName,
        totalAmount: poTotal,
      },
    };

    return result;
  }

  /**
   * Re-run PO matching for all invoices in a company that reference a given PO number.
   * Called after a PO document is successfully processed to propagate match results to
   * invoices that were extracted before the PO was uploaded.
   */
  public async rematchInvoicesForPO(
    companyId: string,
    poNumber: string
  ): Promise<{ rematchedCount: number; invoiceIds: string[] }> {
    if (!poNumber || !companyId) return { rematchedCount: 0, invoiceIds: [] };

    console.log(`[PO MATCH] Re-matching invoices for newly processed PO: "${poNumber}" in company ${companyId}...`);

    const normTargetPO = POMatchingNormalizer.normalizePONumber(poNumber);

    const invoiceDocs: any[] = await DocumentModel.find({
      companyId,
      documentType: 'invoice',
      extractionStatus: 'extracted',
    } as any);

    const rematchedIds: string[] = [];

    for (const invoiceDoc of invoiceDocs) {
      const invPORef = (invoiceDoc.extractedData?.poNumber || '').trim();
      const normInvPO = POMatchingNormalizer.normalizePONumber(invPORef);

      // Only match if invoice explicitly references this PO or has no previous match
      if (normInvPO && normInvPO !== normTargetPO) {
        continue;
      }

      try {
        const newMatchResult = await this.matchInvoiceToPO(companyId, invoiceDoc.extractedData);
        const oldStatus = invoiceDoc.matchResult?.matchStatus || 'no_match';
        const newStatus = newMatchResult.matchStatus;

        if (newStatus !== 'no_match' || oldStatus === 'no_match') {
          await DocumentModel.updateOne(
            { id: invoiceDoc.id, companyId },
            {
              $set: {
                matchResult: newMatchResult,
              },
            }
          );

          const invNum = invoiceDoc.extractedData?.invoiceNumber;
          if (invNum) {
            const isPOMatched = newMatchResult.matchStatus === 'matched';
            const isMathValid = (invoiceDoc.validationResults || []).every((c: any) => c.passed !== false);
            const aiStatus = isPOMatched && isMathValid
              ? 'Ready'
              : (newMatchResult.matchStatus === 'mismatch'
                ? 'PO Mismatch'
                : (!isMathValid ? 'Math Discrepancy' : 'Needs Review'));

            const updatedInvoice = await InvoiceModel.findOneAndUpdate(
              { companyId, invoiceNumber: new RegExp(`^${invNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
              {
                $set: {
                  poNumber: newMatchResult.poNumber || invoiceDoc.extractedData?.poNumber,
                  aiStatus,
                  status: isPOMatched && isMathValid ? 'ready' : 'review',
                },
              },
              { returnDocument: 'after' }
            );

            // Synchronize PurchaseOrderModel matchStatus & invoiceId (do not revert if variance was explicitly accepted)
            if (newMatchResult.poNumber) {
              await PurchaseOrderModel.updateOne(
                {
                  companyId,
                  poNumber: new RegExp(`^${newMatchResult.poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                  varianceAccepted: { $ne: true },
                },
                {
                  $set: {
                    matchStatus: newMatchResult.matchStatus,
                    invoiceId: updatedInvoice?.id || invoiceDoc.linkedRecordId || invoiceDoc.id,
                  },
                }
              );
            }
          }

          rematchedIds.push(invoiceDoc.id);
          console.log(`[PO MATCH] Re-matched document ${invoiceDoc.id}: ${oldStatus} → ${newStatus} (Score: ${newMatchResult.matchScore}%)`);
        }
      } catch (rematchErr: any) {
        console.warn(`[PO MATCH] Re-match failed for document ${invoiceDoc.id}:`, rematchErr?.message);
      }
    }

    console.log(`[PO MATCH] Re-match complete for PO "${poNumber}": ${rematchedIds.length} invoice(s) updated.`);
    return { rematchedCount: rematchedIds.length, invoiceIds: rematchedIds };
  }
}

export const poMatchingService = new POMatchingService();
