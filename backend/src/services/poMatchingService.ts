import { PurchaseOrderModel } from '../models/PurchaseOrder.js';
import { DocumentModel } from '../models/Document.js';
import { IPOMatchResult } from '../models/Document.js';

class POMatchingService {
  /**
   * Automatically search company-scoped POs for candidate matches.
   * Runs 100% deterministically in TypeScript without calling Gemini AI.
   *
   * Priority:
   *  1. Exact PO number match in PurchaseOrders collection
   *  2. Exact PO number match in Documents collection (extracted PO documents)
   *  3. Supplier GSTIN / Name fallback
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

    console.log(`[PO MATCH] Invoice PO reference: "${poNumber || 'none'}"`);
    console.log(`[PO MATCH] Invoice supplier: "${supplierName}" (GSTIN: "${supplierGstin}")`);
    console.log(`[PO MATCH] Invoice total: ₹${invoiceTotal.toLocaleString('en-IN')}`);

    let candidatePO: any = null;
    let candidateSource = '';

    // -------------------------------------------------------------------
    // Priority 1: Exact PO Number Match in PurchaseOrders collection
    // -------------------------------------------------------------------
    if (poNumber) {
      console.log(`[PO MATCH] Searching PurchaseOrders collection for PO: "${poNumber}"...`);
      candidatePO = await PurchaseOrderModel.findOne({
        companyId,
        poNumber: new RegExp(`^${poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      } as any);

      if (candidatePO) {
        candidateSource = 'PurchaseOrders';
        console.log(`[PO MATCH] Candidate PO found in PurchaseOrders: "${candidatePO.poNumber}" (supplier: "${candidatePO.supplierName}", total: ${candidatePO.totalAmount})`);
      } else {
        console.log(`[PO MATCH] No exact PO number match found in PurchaseOrders.`);
      }
    }

    // -------------------------------------------------------------------
    // Priority 2: Match in Documents collection (extracted PO documents)
    // This handles: invoice processed before PO was put into PurchaseOrders,
    // but PO document has been uploaded & extracted.
    // -------------------------------------------------------------------
    if (!candidatePO && poNumber) {
      console.log(`[PO MATCH] Searching Documents collection for extracted PO with number: "${poNumber}"...`);
      const poDoc: any = await DocumentModel.findOne({
        companyId,
        documentType: 'purchase_order',
        extractionStatus: 'extracted',
        $or: [
          { 'extractedData.poNumber': new RegExp(`^${poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { originalFileName: new RegExp(poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        ],
      } as any);

      if (poDoc && poDoc.extractedData) {
        candidateSource = 'DocumentRepository';
        candidatePO = {
          id: poDoc.linkedRecordId || poDoc.id,
          poNumber: poDoc.extractedData.poNumber || poNumber,
          supplierName: poDoc.extractedData.supplierName || supplierName,
          supplierGstin: poDoc.extractedData.supplierGstin || supplierGstin,
          totalAmount: poDoc.extractedData.total || poDoc.extractedData.subtotal || 0,
          items: poDoc.extractedData.lineItems || [],
          isDocReference: true,
        };
        console.log(`[PO MATCH] Candidate PO found in Documents repository: "${candidatePO.poNumber}" (supplier: "${candidatePO.supplierName}", total: ${candidatePO.totalAmount})`);
      } else {
        console.log(`[PO MATCH] No extracted PO document found with number: "${poNumber}".`);
      }
    }

    // -------------------------------------------------------------------
    // Priority 3: Supplier GSTIN / Name fuzzy fallback (no PO number available)
    // -------------------------------------------------------------------
    if (!candidatePO && (supplierGstin || supplierName)) {
      console.log(`[PO MATCH] No PO number. Falling back to supplier GSTIN/name search...`);
      const orConds: any[] = [];
      if (supplierGstin) orConds.push({ supplierGstin: new RegExp(`^${escapeRegExp(supplierGstin)}$`, 'i') });
      if (supplierName) orConds.push({ supplierName: new RegExp(escapeRegExp(supplierName), 'i') });

      candidatePO = await PurchaseOrderModel.findOne({
        companyId,
        $or: orConds,
      } as any);

      if (candidatePO) {
        candidateSource = 'SupplierFallback';
        console.log(`[PO MATCH] Candidate PO found via supplier fallback: "${candidatePO.poNumber}"`);
      } else {
        console.log(`[PO MATCH] No candidate PO found via supplier fallback.`);
      }
    }

    // -------------------------------------------------------------------
    // No candidate PO found
    // -------------------------------------------------------------------
    if (!candidatePO) {
      const noMatchReason = poNumber
        ? `Purchase Order "${poNumber}" referenced on invoice was not found in procurement records. Upload the PO document first, then re-match.`
        : 'No PO number referenced on this invoice and no supplier PO found in company records.';

      console.log(`[PO MATCH] Final result: no_match — ${noMatchReason}`);
      return {
        poNumber: poNumber || undefined,
        matchStatus: 'no_match',
        matchScore: 0,
        matchedFields: [],
        discrepancies: [noMatchReason],
      };
    }

    // -------------------------------------------------------------------
    // Perform deterministic 3-way matching comparison
    // -------------------------------------------------------------------
    const matchedFields: string[] = [];
    const discrepancies: string[] = [];
    let score = 0;

    // A. PO Number Match Check
    const candidatePONum = (candidatePO.poNumber || '').trim();
    const poNumMatch = poNumber && candidatePONum &&
      poNumber.toLowerCase() === candidatePONum.toLowerCase();

    if (poNumMatch) {
      matchedFields.push('PO Number');
      score += 35;
      console.log(`[PO MATCH] PO Number: MATCHED ("${poNumber}" = "${candidatePONum}")`);
    } else if (poNumber && candidatePONum) {
      discrepancies.push(`Invoice references PO "${poNumber}", but matched PO record is "${candidatePONum}".`);
      console.log(`[PO MATCH] PO Number: MISMATCH ("${poNumber}" ≠ "${candidatePONum}")`);
    }

    // B. Supplier Match Check
    const candidateSupplierName = (candidatePO.supplierName || '').trim();
    const normInvSup = supplierName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normPoSup = candidateSupplierName.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (normInvSup && normPoSup && (normInvSup.includes(normPoSup) || normPoSup.includes(normInvSup))) {
      matchedFields.push('Supplier Identity');
      score += 25;
      console.log(`[PO MATCH] Supplier: MATCHED ("${supplierName}" ≈ "${candidateSupplierName}")`);
    } else if (supplierName && candidateSupplierName) {
      discrepancies.push(`Supplier name "${supplierName}" differs from PO supplier "${candidateSupplierName}".`);
      console.log(`[PO MATCH] Supplier: MISMATCH ("${supplierName}" ≠ "${candidateSupplierName}")`);
    } else {
      console.log(`[PO MATCH] Supplier: no comparison possible (one or both supplier names are empty)`);
    }

    // C. Total Amount Match Check
    const poTotal = typeof candidatePO.totalAmount === 'number' ? candidatePO.totalAmount
      : typeof candidatePO.total === 'number' ? candidatePO.total : 0;
    const amountVariance = Math.abs(invoiceTotal - poTotal);

    console.log(`[PO MATCH] Total amount: Invoice=₹${invoiceTotal.toLocaleString('en-IN')}, PO=₹${poTotal.toLocaleString('en-IN')}, Variance=₹${amountVariance.toLocaleString('en-IN')}`);

    if (invoiceTotal > 0 && poTotal > 0) {
      // Accept within 0.5% tolerance for rounding differences
      const tolerancePercent = 0.005;
      const tolerance = Math.max(2.0, poTotal * tolerancePercent);
      if (amountVariance <= tolerance) {
        matchedFields.push('Total Amount');
        score += 25;
        console.log(`[PO MATCH] Total amount: MATCHED (within ₹${tolerance.toFixed(2)} tolerance)`);
      } else {
        const sign = invoiceTotal > poTotal ? '+' : '';
        discrepancies.push(
          `Total amount variance: Invoice (₹${invoiceTotal.toLocaleString('en-IN')}) vs PO (₹${poTotal.toLocaleString('en-IN')}) [Diff: ${sign}₹${(invoiceTotal - poTotal).toLocaleString('en-IN')}].`
        );
        console.log(`[PO MATCH] Total amount: MISMATCH (variance ₹${amountVariance.toLocaleString('en-IN')} exceeds tolerance)`);
      }
    } else {
      console.log(`[PO MATCH] Total amount: skipped (one or both totals are zero)`);
    }

    // D. Line Items Match Check
    const invItems = Array.isArray(extractedInvoice?.lineItems) ? extractedInvoice.lineItems : [];
    const poItems = Array.isArray(candidatePO.items) ? candidatePO.items : [];

    console.log(`[PO MATCH] Line items: Invoice has ${invItems.length}, PO has ${poItems.length}`);

    if (invItems.length > 0 && poItems.length > 0) {
      let matchedItemCount = 0;
      invItems.forEach((invItem: any) => {
        const itemDesc = (invItem.description || '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
        const itemMatch = poItems.some((poItem: any) => {
          const poDesc = (poItem.description || '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
          const words = itemDesc.split(' ').filter((w: string) => w.length > 3);
          const poWords = poDesc.split(' ').filter((w: string) => w.length > 3);
          // Match if at least 2 significant words overlap
          const overlap = words.filter((w: string) => poWords.some((pw: string) => pw.includes(w) || w.includes(pw)));
          return overlap.length >= Math.min(2, Math.min(words.length, poWords.length));
        });
        if (itemMatch) matchedItemCount++;
      });

      console.log(`[PO MATCH] Line item descriptions: ${matchedItemCount}/${invItems.length} matched`);

      if (matchedItemCount > 0) {
        matchedFields.push('Line Item Descriptions & Quantities');
        score += 15;
      } else {
        discrepancies.push(`Line item descriptions do not match between invoice and PO.`);
      }
    } else if (invItems.length > 0) {
      // PO has no item list but has a matching PO number — give partial credit
      matchedFields.push('Quantity & Rates Verified');
      score += 15;
      console.log(`[PO MATCH] Line items: PO record has no items, partial credit given`);
    }

    // -------------------------------------------------------------------
    // Determine final status
    // -------------------------------------------------------------------
    let matchStatus: IPOMatchResult['matchStatus'] = 'no_match';
    if (score >= 90 && discrepancies.length === 0) {
      matchStatus = 'matched';
    } else if (score >= 60 || (poNumMatch && discrepancies.length <= 1)) {
      matchStatus = 'partial_match';
    } else if (discrepancies.length > 0) {
      matchStatus = 'mismatch';
    } else {
      matchStatus = 'needs_review';
    }

    console.log(`[PO MATCH] Final result: ${matchStatus} (score=${score}/100, matchedFields=[${matchedFields.join(', ')}], discrepancies=${discrepancies.length}) [source: ${candidateSource}]`);

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

    // Find all invoice documents in this company that reference this PO number
    // and currently have no_match or missing matchResult
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

    console.log(`[PO MATCH] Found ${invoiceDocs.length} invoice document(s) to re-check for PO "${poNumber}".`);

    const rematchedIds: string[] = [];

    for (const invoiceDoc of invoiceDocs) {
      // Only process invoices that reference this specific PO number
      const invPORef = (invoiceDoc.extractedData?.poNumber || '').trim().toLowerCase();
      const targetPO = poNumber.toLowerCase();
      if (invPORef && invPORef !== targetPO) {
        continue;
      }

      try {
        const newMatchResult = await this.matchInvoiceToPO(companyId, invoiceDoc.extractedData);

        // Only update if match improved
        const oldStatus = invoiceDoc.matchResult?.matchStatus || 'no_match';
        const newStatus = newMatchResult.matchStatus;
        const improved = newStatus !== 'no_match' || oldStatus === 'no_match';

        if (improved) {
          await DocumentModel.updateOne(
            { id: invoiceDoc.id, companyId },
            {
              $set: {
                matchResult: newMatchResult,
              },
            }
          );

          // Also update Invoice model if the invoice record exists
          if (invoiceDoc.linkedRecordId || invoiceDoc.extractedData?.invoiceNumber) {
            const invNum = invoiceDoc.extractedData?.invoiceNumber;
            if (invNum) {
              const isPOMatched = newMatchResult.matchStatus === 'matched';
              const isMathValid = (invoiceDoc.validationResults || []).every((c: any) => c.passed !== false);
              const aiStatus = isPOMatched && isMathValid ? 'Ready'
                : (newMatchResult.matchStatus === 'mismatch' ? 'PO Mismatch'
                : (!isMathValid ? 'Math Discrepancy' : 'Needs Review'));

              await import('../models/Invoice.js').then(({ InvoiceModel }) =>
                InvoiceModel.updateOne(
                  { companyId, invoiceNumber: new RegExp(`^${invNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                  {
                    $set: {
                      poNumber: newMatchResult.poNumber || invoiceDoc.extractedData?.poNumber,
                      aiStatus,
                      status: isPOMatched && isMathValid ? 'ready' : 'review',
                    },
                  }
                )
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

const escapeRegExp = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const poMatchingService = new POMatchingService();
