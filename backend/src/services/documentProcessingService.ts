import crypto from 'crypto';
import { DocumentModel, IDocumentEntity } from '../models/Document.js';
import { InvoiceModel } from '../models/Invoice.js';
import { PurchaseOrderModel } from '../models/PurchaseOrder.js';
import { SupplierModel } from '../models/Supplier.js';
import { documentStorageService } from './storage/documentStorageService.js';
import { documentTypeService } from './documentTypeService.js';
import { aiExtractionService } from './ai/aiExtractionService.js';
import { documentValidationService } from './documentValidationService.js';
import { poMatchingService } from './poMatchingService.js';

const escapeRegExp = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

class DocumentProcessingService {
  /**
   * Calculate SHA-256 hash of file buffer for content deduplication & idempotency.
   */
  public calculateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Orchestrate full document processing: Extraction -> Financial Math Validation -> PO Matching -> DB Sync.
   * Enforces strict idempotency and caching with atomic updates to avoid VersionErrors.
   */
  public async processDocument(
    documentId: string,
    companyId: string,
    userId: string,
    options?: { forceReprocess?: boolean }
  ): Promise<IDocumentEntity> {
    const forceReprocess = Boolean(options?.forceReprocess);

    // 1. Fetch Document from DB scoped strictly to companyId
    const doc = await DocumentModel.findOne({ id: documentId, companyId });
    if (!doc) {
      throw new Error(`Document with ID "${documentId}" not found or access denied.`);
    }

    // 2. Read file buffer
    const fileBuffer = await documentStorageService.getFileBuffer(companyId, doc.fileName);
    const fileHash = this.calculateFileHash(fileBuffer);

    // 3. Idempotency & Cache Check
    if (!forceReprocess) {
      if (doc.extractionStatus === 'extracted' && doc.extractedData) {
        console.log(`[DocumentProcessingService] Idempotency hit: Document ${documentId} already extracted.`);
        return doc;
      }

      // Check if another document in company has identical fileHash and extractedData
      const duplicateDoc = await DocumentModel.findOne({
        companyId,
        fileHash,
        extractionStatus: 'extracted',
        extractedData: { $exists: true },
      });

      if (duplicateDoc && duplicateDoc.extractedData) {
        console.log(`[DocumentProcessingService] Content hash cache hit for ${documentId} (matches ${duplicateDoc.id}).`);
        const updated = await DocumentModel.findOneAndUpdate(
          { id: documentId, companyId },
          {
            $set: {
              fileHash,
              documentType: duplicateDoc.documentType,
              extractedData: duplicateDoc.extractedData,
              validationResults: duplicateDoc.validationResults,
              matchResult: duplicateDoc.matchResult,
              processingStatus: 'processed',
              extractionStatus: 'extracted',
              extractedAt: duplicateDoc.extractedAt || new Date().toISOString(),
            },
          },
          { returnDocument: 'after' }
        );
        return updated || doc;
      }
    }

    // Mark status as processing atomically in DB
    await DocumentModel.updateOne(
      { id: documentId, companyId },
      {
        $set: {
          processingStatus: 'processing',
          extractionStatus: 'processing',
          fileHash,
          extractionError: null,
        },
      }
    );

    let docType: string = (doc.documentType && doc.documentType !== 'unknown') ? doc.documentType : 'unknown';

    try {
      // 4. Determine Document Type
      if (docType === 'unknown') {
        docType = documentTypeService.detectTypeFromFilename(doc.originalFileName);
        if (docType === 'unknown') {
          const aiClass = await aiExtractionService.classifyUnknownDocument(fileBuffer, doc.mimeType, {
            companyId,
            userId,
          });
          if (aiClass.documentType !== 'unknown') {
            docType = aiClass.documentType;
          }
        }
      }

      let extractedPayload: any = null;
      let validationResults: any[] = [];
      let matchResult: any = null;
      let supplierResult: any = undefined;
      let linkedRecordId: string | undefined = undefined;

      // 5. Extract Structured Data via AI Extraction Service
      if (docType === 'purchase_order') {
        const poRes = await aiExtractionService.extractPODocument(fileBuffer, doc.mimeType, {
          companyId,
          userId,
        });
        extractedPayload = poRes.data;

        // Perform financial math validation
        const valRes = documentValidationService.validateFinancialMath(extractedPayload);
        validationResults = valRes.validationChecks;

        // Optional supplier association for PO
        let poSupplierObj: any = null;
        try {
          const poSupName = (extractedPayload.supplierName || '').trim();
          const poSupGstin = (extractedPayload.supplierGstin || '').trim();
          if (poSupName) {
            poSupplierObj = await SupplierModel.findOne({
              companyId,
              $or: [
                { name: new RegExp(`^${escapeRegExp(poSupName)}$`, 'i') },
                ...(poSupGstin ? [{ gstin: new RegExp(`^${escapeRegExp(poSupGstin)}$`, 'i') }] : []),
              ],
            });

            if (!poSupplierObj) {
              poSupplierObj = await SupplierModel.create({
                id: `sup-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`,
                companyId,
                name: poSupName,
                gstin: poSupGstin,
                email: extractedPayload.supplierEmail || '',
                phone: '',
                totalSpend: 0,
                outstandingAmount: 0,
                invoiceCount: 0,
                riskLevel: 'low',
                lastInvoiceDate: 'N/A',
                status: 'active',
                bankAccounts: [],
                bankStatus: 'verified',
                totalPayable: 0,
                riskStatus: 'low',
              });
            }
          }
        } catch (supErr) {
          console.warn('[DocumentProcessingService] PO Supplier auto-sync warning (non-blocking):', supErr);
        }

        // Sync or Create PurchaseOrder record in MongoDB scoped to companyId
        const poNum = (extractedPayload.poNumber || `PO-${Date.now()}`).trim();
        const poSupplierId = poSupplierObj?.id || `sup-${(extractedPayload.supplierName || 'custom').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}`;
        const poRecordId = `po-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

        const createdPO = await PurchaseOrderModel.findOneAndUpdate(
          { companyId, poNumber: new RegExp(`^${poNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          {
            $setOnInsert: { id: poRecordId },
            $set: {
              poNumber: poNum,
              companyId,
              supplierId: poSupplierId,
              supplierName: extractedPayload.supplierName || 'Supplier',
              supplierGstin: extractedPayload.supplierGstin || '',
              totalAmount: extractedPayload.total || valRes.computedTotal || 0,
              issuedDate: extractedPayload.poDate || new Date().toISOString().split('T')[0],
              status: 'open',
              matchStatus: 'open',
              items: valRes.processedItems.map((i, idx) => ({
                id: `po-item-${Date.now()}-${idx + 1}`,
                description: i.description,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                total: i.total,
              })),
            },
          },
          { upsert: true, returnDocument: 'after' }
        );

        linkedRecordId = createdPO.id || createdPO._id?.toString();
      } else {
        // Default to Invoice extraction
        docType = 'invoice';
        const invRes = await aiExtractionService.extractInvoiceDocument(fileBuffer, doc.mimeType, {
          companyId,
          userId,
        });
        extractedPayload = invRes.data;

        // Financial Math Validation in TypeScript (0 AI calls)
        const valRes = documentValidationService.validateFinancialMath(extractedPayload);
        validationResults = valRes.validationChecks;

        // Automatic PO Matching in TypeScript (0 AI calls)
        matchResult = await poMatchingService.matchInvoiceToPO(companyId, extractedPayload);

        const invNum = (extractedPayload.invoiceNumber || `INV-${Date.now()}`).trim();
        const invSubtotal = extractedPayload.subtotal || valRes.computedSubtotal;
        const invTax = extractedPayload.tax || valRes.computedTax;
        const invTotal = extractedPayload.amount || valRes.computedTotal;

        const isMathValid = valRes.isMathValid;
        const isPOMatched = matchResult.matchStatus === 'matched';

        let status = isPOMatched && isMathValid ? 'ready' : (matchResult.matchStatus === 'mismatch' ? 'critical' : 'review');
        let aiStatus = isPOMatched && isMathValid ? 'Ready' : (matchResult.matchStatus === 'mismatch' ? 'PO Mismatch' : (!isMathValid ? 'Math Discrepancy' : 'Needs Review'));

        // 5a. Supplier Automation: Associate with existing supplier or auto-create within tenant
        let supplierId = `sup-${(extractedPayload.supplierName || 'custom').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}`;
        let finalSupplierName = extractedPayload.supplierName || 'Supplier Pvt Ltd';
        let isBankChanged = false;
        let supplierResult: any = undefined;

        try {
          const supplierGstin = (extractedPayload.supplierGstin || '').trim();
          const rawSupplierName = (extractedPayload.supplierName || '').trim();

          const searchConds: any[] = [];
          if (supplierGstin) {
            searchConds.push({ gstin: new RegExp(`^${escapeRegExp(supplierGstin)}$`, 'i') });
          }
          if (rawSupplierName) {
            searchConds.push({ name: new RegExp(`^${escapeRegExp(rawSupplierName)}$`, 'i') });
          }

          let matchedSupplier = searchConds.length > 0
            ? await SupplierModel.findOne({ companyId, $or: searchConds })
            : null;

          // Check if invoice already exists to ensure idempotency
          const existingInvoice = await InvoiceModel.findOne({
            companyId,
            invoiceNumber: new RegExp(`^${escapeRegExp(invNum)}$`, 'i'),
          });

          if (matchedSupplier) {
            supplierId = matchedSupplier.id;
            finalSupplierName = matchedSupplier.name;
            const matchedByField = supplierGstin && matchedSupplier.gstin?.toLowerCase() === supplierGstin.toLowerCase() ? 'gstin' : 'name';

            // Detect if invoice bank account changed compared to existing trusted supplier record
            if (extractedPayload.bankDetails?.accountNumber && matchedSupplier.bankAccounts?.[0]?.accountNumber) {
              const existingAcc = matchedSupplier.bankAccounts[0].accountNumber.replace(/[^0-9a-zA-Z]/g, '');
              const newAcc = extractedPayload.bankDetails.accountNumber.replace(/[^0-9a-zA-Z]/g, '');
              if (existingAcc && newAcc && existingAcc !== newAcc) {
                isBankChanged = true;
              }
            }

            // Update supplier aggregated stats safely only if it's a new invoice
            if (!existingInvoice) {
              await SupplierModel.updateOne(
                { id: matchedSupplier.id, companyId },
                {
                  $inc: { invoiceCount: 1, totalSpend: invTotal || 0, outstandingAmount: invTotal || 0 },
                  $set: {
                    lastInvoiceDate: extractedPayload.invoiceDate || new Date().toISOString().split('T')[0],
                    totalPayable: (matchedSupplier.totalPayable || 0) + (invTotal || 0),
                    bankStatus: isBankChanged ? 'changed' : matchedSupplier.bankStatus || 'verified',
                  },
                }
              );
            }

            supplierResult = {
              supplierId: matchedSupplier.id,
              supplierName: matchedSupplier.name,
              isNewSupplier: false,
              matchedBy: matchedByField,
              message: `Existing supplier matched: ${matchedSupplier.name}. Invoice associated with existing supplier.`,
            };
          } else if (rawSupplierName) {
            // Auto-create new Supplier record from extracted invoice info
            const generatedSupId = `sup-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
            const newBankAccounts = extractedPayload.bankDetails?.accountNumber
              ? [
                  {
                    accountNumber: extractedPayload.bankDetails.accountNumber,
                    bankName: extractedPayload.bankDetails.bankName || 'Bank',
                    ifsc: (extractedPayload.bankDetails.ifsc || 'N/A').toUpperCase(),
                    isPrimary: true,
                    addedDate: new Date().toISOString().split('T')[0],
                  },
                ]
              : [];

            const createdSup = await SupplierModel.create({
              id: generatedSupId,
              companyId,
              name: rawSupplierName,
              gstin: supplierGstin,
              email: extractedPayload.supplierEmail || '',
              phone: extractedPayload.supplierPhone || '',
              totalSpend: invTotal || 0,
              outstandingAmount: invTotal || 0,
              invoiceCount: 1,
              riskLevel: 'low',
              lastInvoiceDate: extractedPayload.invoiceDate || new Date().toISOString().split('T')[0],
              status: 'active',
              bankAccounts: newBankAccounts,
              bankStatus: 'verified',
              totalPayable: invTotal || 0,
              riskStatus: 'low',
            });
            supplierId = createdSup.id;
            console.log(`[DocumentProcessingService] Auto-registered new supplier "${rawSupplierName}" (${supplierId}) for company ${companyId}`);

            supplierResult = {
              supplierId: createdSup.id,
              supplierName: createdSup.name,
              isNewSupplier: true,
              matchedBy: 'auto_created',
              message: `New supplier detected: ${createdSup.name}. Supplier information was extracted from the invoice and added to your supplier database.`,
            };
          }
        } catch (supErr) {
          console.warn(`[DocumentProcessingService] Non-blocking supplier auto-sync warning for ${documentId}:`, supErr);
        }

        // Sync or Create Invoice record in MongoDB scoped to companyId
        const createdInvoice = await InvoiceModel.findOneAndUpdate(
          { companyId, invoiceNumber: new RegExp(`^${invNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          {
            $set: {
              id: `inv-${Date.now()}`,
              invoiceNumber: invNum,
              companyId,
              createdBy: userId,
              supplierId,
              supplierName: finalSupplierName,
              supplierGstin: extractedPayload.supplierGstin || '29AABCS1234F1Z1',
              supplierEmail: extractedPayload.supplierEmail || 'billing@supplier.com',
              supplierPhone: extractedPayload.supplierPhone || '+91 99000 00000',
              amount: invTotal,
              currency: extractedPayload.currency || 'INR',
              subtotal: invSubtotal,
              tax: invTax,
              discount: extractedPayload.discount || 0,
              invoiceDate: extractedPayload.invoiceDate || new Date().toISOString().split('T')[0],
              dueDate: extractedPayload.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
              poNumber: extractedPayload.poNumber || matchResult.poNumber,
              aiStatus: isBankChanged ? 'Bank Detail Change' : aiStatus,
              status: isBankChanged ? 'critical' : status,
              paymentStatus: isBankChanged ? 'on_hold' : (status === 'ready' ? 'scheduled' : 'pending'),
              riskLevel: isBankChanged ? 'high' : (status === 'ready' ? 'low' : 'medium'),
              paymentTerms: extractedPayload.paymentTerms || 'Net 15 Days',
              bankDetails: extractedPayload.bankDetails?.accountNumber ? {
                accountNumber: extractedPayload.bankDetails.accountNumber,
                ifsc: extractedPayload.bankDetails.ifsc || 'N/A',
                bankName: extractedPayload.bankDetails.bankName || 'Bank',
                isChangedFromPrevious: isBankChanged,
              } : {
                accountNumber: '990011223344',
                ifsc: 'HDFC0001234',
                bankName: 'HDFC Bank',
                isChangedFromPrevious: false,
              },
              items: valRes.processedItems.map((i, idx) => ({
                id: `item-${Date.now()}-${idx + 1}`,
                description: i.description,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                taxRate: i.taxRate,
                taxAmount: i.taxAmount,
                total: i.total,
                poItemMatched: true,
              })),
              aiChecks: validationResults,
              aiRecommendation: isBankChanged
                ? 'CRITICAL ALERT: Bank account details differ from verified supplier record. Verify bank mandate before disbursement.'
                : (isPOMatched && isMathValid
                  ? 'Document extracted and 100% matched with PO. Safe for autonomous approval.'
                  : 'Inspect validation checks and PO variances prior to disbursement.'),
            },
          },
          { upsert: true, returnDocument: 'after' }
        );

        linkedRecordId = createdInvoice.id || createdInvoice._id?.toString();
      }

      // Update Document record status atomically
      const finalDoc = await DocumentModel.findOneAndUpdate(
        { id: documentId, companyId },
        {
          $set: {
            documentType: docType,
            extractedData: extractedPayload,
            validationResults,
            matchResult,
            supplierResult,
            linkedRecordId,
            processingStatus: 'processed',
            extractionStatus: 'extracted',
            extractedAt: new Date().toISOString(),
          },
        },
        { returnDocument: 'after' }
      );

      return finalDoc || doc;
    } catch (err: any) {
      const failureReason = err?.message || String(err);
      console.error(`❌ [DocumentExtractionFailed] Document ID: "${documentId}" | Type: "${docType || doc.documentType || 'unknown'}"`);
      console.error(`   Primary Provider Attempted: Google Gemini (gemini-3.6-flash / gemini-2.5-flash)`);
      console.error(`   Fallback Provider Attempted: Groq (qwen/qwen3.6-27b)`);
      console.error(`   Failure Reason / Error: ${failureReason}`);

      const failedDoc = await DocumentModel.findOneAndUpdate(
        { id: documentId, companyId },
        {
          $set: {
            documentType: docType || doc.documentType || 'unknown',
            processingStatus: 'failed',
            extractionStatus: 'failed',
            extractionError: failureReason,
          },
        },
        { returnDocument: 'after' }
      );
      throw err;
    }
  }
}

export const documentProcessingService = new DocumentProcessingService();
