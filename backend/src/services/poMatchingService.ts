import { PurchaseOrderModel } from '../models/PurchaseOrder.js';
import { DocumentModel } from '../models/Document.js';
import { IPOMatchResult } from '../models/Document.js';

class POMatchingService {
  /**
   * Automatically search company-scoped POs for candidate matches.
   * Runs 100% deterministically in TypeScript without calling Gemini AI.
   */
  public async matchInvoiceToPO(
    companyId: string,
    extractedInvoice: any
  ): Promise<IPOMatchResult> {
    const poNumber = (extractedInvoice?.poNumber || '').trim();
    const supplierGstin = (extractedInvoice?.supplierGstin || '').trim();
    const supplierName = (extractedInvoice?.supplierName || '').trim();
    const invoiceTotal = typeof extractedInvoice?.amount === 'number'
      ? extractedInvoice.amount
      : typeof extractedInvoice?.total === 'number'
      ? extractedInvoice.total
      : 0;

    let candidatePO: any = null;

    // 1. Priority 1: Exact PO Number Match in PurchaseOrders collection
    if (poNumber) {
      candidatePO = await PurchaseOrderModel.findOne({
        companyId,
        poNumber: new RegExp(`^${poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      } as any);
    }

    // 2. Priority 2: Look for extracted PO Documents in Document collection
    if (!candidatePO && poNumber) {
      const poDoc: any = await DocumentModel.findOne({
        companyId,
        documentType: 'purchase_order',
        $or: [
          { 'extractedData.poNumber': new RegExp(`^${poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { originalFileName: new RegExp(poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        ],
      } as any);

      if (poDoc && poDoc.extractedData) {
        candidatePO = {
          poNumber: poDoc.extractedData.poNumber || poNumber,
          supplierName: poDoc.extractedData.supplierName || supplierName,
          totalAmount: poDoc.extractedData.total || 0,
          items: poDoc.extractedData.lineItems || [],
          isDocReference: true,
        };
      }
    }

    // 3. Priority 3: Match by Supplier GSTIN / Name if no direct PO number was referenced on invoice
    if (!candidatePO && !poNumber && (supplierGstin || supplierName)) {
      const orConds: any[] = [];
      if (supplierGstin) orConds.push({ supplierGstin: new RegExp(`^${supplierGstin}$`, 'i') });
      if (supplierName) orConds.push({ supplierName: new RegExp(supplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });

      candidatePO = await PurchaseOrderModel.findOne({
        companyId,
        $or: orConds,
      } as any);
    }

    // Handle case where no candidate PO is found
    if (!candidatePO) {
      return {
        poNumber: poNumber || undefined,
        matchStatus: poNumber ? 'no_match' : 'no_match',
        matchScore: 0,
        matchedFields: [],
        discrepancies: poNumber
          ? [`Purchase Order ${poNumber} referenced on invoice was not found in company procurement records.`]
          : ['No purchase order reference or supplier PO found in company records.'],
      };
    }

    // Perform deterministic matching comparison
    const matchedFields: string[] = [];
    const discrepancies: string[] = [];
    let score = 0;

    // A. PO Number Match Check
    const poNumMatch = poNumber && candidatePO.poNumber && poNumber.toLowerCase() === candidatePO.poNumber.toLowerCase();
    if (poNumMatch) {
      matchedFields.push('PO Number');
      score += 35;
    } else if (poNumber) {
      discrepancies.push(`Invoice references PO ${poNumber}, but matched PO record is ${candidatePO.poNumber}.`);
    }

    // B. Supplier Match Check
    const candidateSupplierName = candidatePO.supplierName || '';
    const normInvSup = supplierName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normPoSup = candidateSupplierName.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (normInvSup && normPoSup && (normInvSup.includes(normPoSup) || normPoSup.includes(normInvSup))) {
      matchedFields.push('Supplier Identity');
      score += 25;
    } else if (supplierName && candidateSupplierName) {
      discrepancies.push(`Supplier name "${supplierName}" differs from PO supplier "${candidateSupplierName}".`);
    }

    // C. Total Amount Match Check
    const poTotal = candidatePO.totalAmount ?? candidatePO.total ?? 0;
    const amountVariance = Math.abs(invoiceTotal - poTotal);

    if (invoiceTotal > 0 && poTotal > 0) {
      if (amountVariance <= 2.0) {
        matchedFields.push('Total Amount');
        score += 25;
      } else {
        const diffStr = (invoiceTotal - poTotal).toLocaleString('en-IN');
        discrepancies.push(`Total amount variance: Invoice (₹${invoiceTotal.toLocaleString('en-IN')}) vs PO (₹${poTotal.toLocaleString('en-IN')}) [Diff: ${invoiceTotal > poTotal ? '+' : ''}₹${diffStr}].`);
      }
    }

    // D. Line Items Match Check
    const invItems = Array.isArray(extractedInvoice?.lineItems) ? extractedInvoice.lineItems : [];
    const poItems = Array.isArray(candidatePO.items) ? candidatePO.items : [];

    if (invItems.length > 0 && poItems.length > 0) {
      let matchedItemCount = 0;
      invItems.forEach((invItem: any) => {
        const itemDesc = (invItem.description || '').toLowerCase();
        const itemMatch = poItems.some((poItem: any) => {
          const poDesc = (poItem.description || '').toLowerCase();
          return itemDesc.includes(poDesc) || poDesc.includes(itemDesc);
        });
        if (itemMatch) matchedItemCount++;
      });

      if (matchedItemCount > 0) {
        matchedFields.push('Line Item Descriptions & Quantities');
        score += 15;
      }
    } else if (invItems.length > 0) {
      matchedFields.push('Quantity & Rates Verified');
      score += 15;
    }

    // Determine final status based on score and discrepancies
    let matchStatus: IPOMatchResult['matchStatus'] = 'no_match';
    if (score >= 90 && discrepancies.length === 0) {
      matchStatus = 'matched';
    } else if (discrepancies.length > 0) {
      matchStatus = 'mismatch';
    } else if (score >= 60 || poNumMatch) {
      matchStatus = 'partial_match';
    } else {
      matchStatus = 'needs_review';
    }

    return {
      purchaseOrderId: candidatePO.id || candidatePO._id?.toString(),
      poNumber: candidatePO.poNumber,
      matchStatus,
      matchScore: Math.min(100, score),
      matchedFields,
      discrepancies,
      poDetails: {
        poNumber: candidatePO.poNumber,
        supplierName: candidatePO.supplierName,
        totalAmount: poTotal,
      },
    };
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

    const invoiceDocs: any[] = await DocumentModel.find({
      companyId,
      documentType: 'invoice',
      extractionStatus: 'extracted',
      $or: [
        { 'extractedData.poNumber': new RegExp(`^${poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        { 'matchResult.matchStatus': 'no_match' },
        { matchResult: { $exists: false } },
        { matchResult: null },
      ],
    } as any);

    const rematchedIds: string[] = [];

    for (const invoiceDoc of invoiceDocs) {
      const invPORef = (invoiceDoc.extractedData?.poNumber || '').trim().toLowerCase();
      const targetPO = poNumber.toLowerCase();
      if (invPORef && invPORef !== targetPO) {
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

          if (invoiceDoc.linkedRecordId || invoiceDoc.extractedData?.invoiceNumber) {
            const invNum = invoiceDoc.extractedData?.invoiceNumber;
            if (invNum) {
              const isPOMatched = newMatchResult.matchStatus === 'matched';
              const isMathValid = (invoiceDoc.validationResults || []).every((c: any) => c.passed !== false);
              const aiStatus = isPOMatched && isMathValid ? 'Ready'
                : (newMatchResult.matchStatus === 'mismatch' ? 'PO Mismatch'
                : (!isMathValid ? 'Math Discrepancy' : 'Needs Review'));

              const { InvoiceModel } = await import('../models/Invoice.js');
              await InvoiceModel.updateOne(
                { companyId, invoiceNumber: new RegExp(`^${invNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                {
                  $set: {
                    poNumber: newMatchResult.poNumber || invoiceDoc.extractedData?.poNumber,
                    aiStatus,
                    status: isPOMatched && isMathValid ? 'ready' : 'review',
                  },
                }
              );
            }
          }

          rematchedIds.push(invoiceDoc.id);
          console.log(`[PO MATCH] Re-matched document ${invoiceDoc.id}: ${oldStatus} → ${newStatus}`);
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
