import crypto from 'crypto';
import { DocumentModel, IDocumentEntity } from '../models/Document.js';
import { InvoiceModel } from '../models/Invoice.js';
import { PurchaseOrderModel } from '../models/PurchaseOrder.js';
import { documentStorageService } from './storage/documentStorageService.js';
import { documentTypeService } from './documentTypeService.js';
import { aiExtractionService } from './ai/aiExtractionService.js';
import { documentValidationService } from './documentValidationService.js';
import { poMatchingService } from './poMatchingService.js';

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
          { new: true }
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

    try {
      // 4. Determine Document Type
      let docType = documentTypeService.detectTypeFromFilename(doc.originalFileName);
      if (docType === 'unknown') {
        const aiClass = await aiExtractionService.classifyUnknownDocument(fileBuffer, doc.mimeType, {
          companyId,
          userId,
        });
        if (aiClass.documentType !== 'unknown') {
          docType = aiClass.documentType;
        }
      }

      let extractedPayload: any = null;
      let validationResults: any[] = [];
      let matchResult: any = null;
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

        // Sync or Create PurchaseOrder record in MongoDB scoped to companyId
        const poNum = (extractedPayload.poNumber || `PO-${Date.now()}`).trim();
        const createdPO = await PurchaseOrderModel.findOneAndUpdate(
          { companyId, poNumber: new RegExp(`^${poNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          {
            $set: {
              poNumber: poNum,
              companyId,
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
          { upsert: true, new: true }
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

        // Sync or Create Invoice record in MongoDB scoped to companyId
        const invNum = (extractedPayload.invoiceNumber || `INV-${Date.now()}`).trim();
        const invSubtotal = extractedPayload.subtotal || valRes.computedSubtotal;
        const invTax = extractedPayload.tax || valRes.computedTax;
        const invTotal = extractedPayload.amount || valRes.computedTotal;

        const isMathValid = valRes.isMathValid;
        const isPOMatched = matchResult.matchStatus === 'matched';

        let status = isPOMatched && isMathValid ? 'ready' : (matchResult.matchStatus === 'mismatch' ? 'critical' : 'review');
        let aiStatus = isPOMatched && isMathValid ? 'Ready' : (matchResult.matchStatus === 'mismatch' ? 'PO Mismatch' : (!isMathValid ? 'Math Discrepancy' : 'Needs Review'));

        const createdInvoice = await InvoiceModel.findOneAndUpdate(
          { companyId, invoiceNumber: new RegExp(`^${invNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          {
            $set: {
              id: `inv-${Date.now()}`,
              invoiceNumber: invNum,
              companyId,
              createdBy: userId,
              supplierId: `sup-${(extractedPayload.supplierName || 'custom').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
              supplierName: extractedPayload.supplierName || 'Supplier Pvt Ltd',
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
              aiStatus,
              status,
              paymentStatus: status === 'ready' ? 'scheduled' : 'pending',
              riskLevel: status === 'ready' ? 'low' : 'medium',
              paymentTerms: extractedPayload.paymentTerms || 'Net 15 Days',
              bankDetails: extractedPayload.bankDetails?.accountNumber ? {
                accountNumber: extractedPayload.bankDetails.accountNumber,
                ifsc: extractedPayload.bankDetails.ifsc || 'N/A',
                bankName: extractedPayload.bankDetails.bankName || 'Bank',
                isChangedFromPrevious: false,
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
              aiRecommendation: isPOMatched && isMathValid
                ? 'Document extracted and 100% matched with PO. Safe for autonomous approval.'
                : 'Inspect validation checks and PO variances prior to disbursement.',
            },
          },
          { upsert: true, new: true }
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
            linkedRecordId,
            processingStatus: 'processed',
            extractionStatus: 'extracted',
            extractedAt: new Date().toISOString(),
          },
        },
        { new: true }
      );

      return finalDoc || doc;
    } catch (err: any) {
      console.error(`❌ Document processing error for ${documentId}:`, err);
      const failedDoc = await DocumentModel.findOneAndUpdate(
        { id: documentId, companyId },
        {
          $set: {
            processingStatus: 'failed',
            extractionStatus: 'failed',
            extractionError: err?.message || 'AI document processing failed.',
          },
        },
        { new: true }
      );
      throw err;
    }
  }
}

export const documentProcessingService = new DocumentProcessingService();
