import { DocumentType } from '../../models/Document.js';
import { documentTextExtractionService } from '../documentTextExtractionService.js';
import { ocrService } from './ocrService.js';
import { deterministicParserService } from './deterministicParserService.js';
import { NormalizationHelper } from './normalizationHelper.js';
import { ExtractionQualityEvaluator } from './extractionQualityEvaluator.js';
import {
  aiExtractionService,
  ExtractedInvoiceData,
  ExtractedPOData,
} from '../ai/aiExtractionService.js';

export interface HybridExtractionResult<T> {
  data: T;
  rawJson?: string;
  model?: string;
  extractionMethod: 'pdf_text' | 'ocr' | 'ai';
  confidence: number;
  quality: 'high' | 'incomplete' | 'ambiguous';
  aiAssisted: boolean;
  documentType: DocumentType;
  missingFields?: string[];
  warnings?: string[];
}

class HybridExtractionService {
  /**
   * Main Hybrid Extraction Pipeline.
   * Runs: PDF Text -> OCR -> Deterministic Parsing -> Quality Validation -> AI Fallback & Field-Level Merging.
   */
  public async extractDocument(
    fileBuffer: Buffer,
    mimeType: string,
    options: {
      documentId: string;
      originalFileName: string;
      docTypeHint?: DocumentType;
      companyId?: string;
      userId?: string;
    }
  ): Promise<HybridExtractionResult<ExtractedInvoiceData | ExtractedPOData>> {
    const { documentId, originalFileName, docTypeHint, companyId, userId } = options;

    console.log(`[DOC] Processing document: ${documentId} (${originalFileName})`);

    let extractedText = '';
    let sourceMethod: 'pdf_text' | 'ocr' = 'pdf_text';
    let isUsableText = false;

    // -------------------------------------------------------------
    // Step 1: Text Extraction (PDF Text -> OCR)
    // -------------------------------------------------------------
    if (mimeType === 'application/pdf' || originalFileName.toLowerCase().endsWith('.pdf')) {
      const pdfRes = await documentTextExtractionService.extractText(fileBuffer);
      console.log(`[DOC] PDF text extraction: ${pdfRes.characterCount} chars (pages: ${pdfRes.pageCount || 1})`);

      if (pdfRes.success && !pdfRes.isScanned) {
        extractedText = pdfRes.text;
        isUsableText = true;
        sourceMethod = 'pdf_text';
      } else {
        console.log(`[DOC] Minimal or unreadable text detected. Document flagged as scanned/image.`);
      }
    }

    if (!isUsableText) {
      const ocrRes = await ocrService.extractTextWithOCR(fileBuffer, mimeType);
      if (ocrRes.isUsable) {
        extractedText = ocrRes.text;
        isUsableText = true;
        sourceMethod = 'ocr';
        console.log(`[DOC] OCR text extraction: ${extractedText.length} chars (engine: ${ocrRes.engine})`);
      }
    }

    // -------------------------------------------------------------
    // Step 2: Determine Document Type
    // -------------------------------------------------------------
    let detectedType: DocumentType = (docTypeHint && docTypeHint !== 'unknown')
      ? docTypeHint
      : 'unknown';

    if (detectedType === 'unknown' && isUsableText) {
      detectedType = deterministicParserService.detectDocumentTypeFromText(extractedText);
      console.log(`[DOC] Detected document type: ${detectedType}`);
    }

    // Default to 'invoice' if still unknown
    if (detectedType === 'unknown') {
      detectedType = 'invoice';
    }

    // -------------------------------------------------------------
    // Step 3: Deterministic Field Extraction & Quality Assessment
    // -------------------------------------------------------------
    if (isUsableText) {
      if (detectedType === 'purchase_order') {
        const detResult = deterministicParserService.parsePOText(extractedText, sourceMethod);

        if (detResult.quality === 'high' && !detResult.needsAI) {
          console.log(`[DOC] Extraction strategy: LOCAL (Quality: HIGH, 0 AI calls required)`);
          console.log(`[DOC] Local extraction confidence: ${detResult.confidence}`);
          console.log(`[DOC] Local PO extracted: PO# "${detResult.data.poNumber}", Supplier: "${detResult.data.supplierName}", Total: ${detResult.data.total}`);

          return {
            data: detResult.data,
            extractionMethod: sourceMethod,
            confidence: detResult.confidence,
            quality: 'high',
            aiAssisted: false,
            documentType: 'purchase_order',
            model: 'deterministic_parser',
            missingFields: [],
            warnings: detResult.warnings,
          };
        } else {
          console.log(`[DOC] Local PO extraction evaluated as ${detResult.quality.toUpperCase()} (missing/ambiguous: ${detResult.missingOrAmbiguousFields.join(', ')}). Warnings: ${detResult.warnings.join('; ')}`);
          console.log(`[DOC] Triggering selective AI fallback for quality completion...`);
        }
      } else {
        const detResult = deterministicParserService.parseInvoiceText(extractedText, sourceMethod);

        if (detResult.quality === 'high' && !detResult.needsAI) {
          console.log(`[DOC] Extraction strategy: LOCAL (Quality: HIGH, 0 AI calls required)`);
          console.log(`[DOC] Local extraction confidence: ${detResult.confidence}`);
          console.log(`[DOC] Local Invoice extracted: Inv# "${detResult.data.invoiceNumber}", Supplier: "${detResult.data.supplierName}", Amount: ${detResult.data.amount}`);

          return {
            data: detResult.data,
            extractionMethod: sourceMethod,
            confidence: detResult.confidence,
            quality: 'high',
            aiAssisted: false,
            documentType: 'invoice',
            model: 'deterministic_parser',
            missingFields: [],
            warnings: detResult.warnings,
          };
        } else {
          console.log(`[DOC] Local Invoice extraction evaluated as ${detResult.quality.toUpperCase()} (missing/ambiguous: ${detResult.missingOrAmbiguousFields.join(', ')}). Warnings: ${detResult.warnings.join('; ')}`);
          console.log(`[DOC] Triggering selective AI fallback for quality completion...`);
        }
      }
    }

    // -------------------------------------------------------------
    // Step 4: AI Fallback & Intelligent Field-Level Merging
    // (Triggered ONLY when text was unusable or essential fields/line items are missing)
    // -------------------------------------------------------------
    console.log(`[DOC] Extraction strategy: AI (Serialized AI Queue)`);

    if (detectedType === 'purchase_order') {
      const aiRes = await aiExtractionService.extractPODocument(fileBuffer, mimeType, {
        companyId,
        userId,
      });

      // Merge with any valid deterministic fields if available
      let mergedData = aiRes.data;
      if (isUsableText) {
        const detResult = deterministicParserService.parsePOText(extractedText, sourceMethod);
        mergedData = this.mergePOData(detResult.data, aiRes.data);
      }

      const qualityCheck = ExtractionQualityEvaluator.evaluatePOQuality(extractedText, mergedData);

      console.log(`[DOC] Extraction complete via AI (model: ${aiRes.model}, quality: ${qualityCheck.quality})`);
      return {
        data: mergedData,
        rawJson: aiRes.rawJson,
        model: aiRes.model,
        extractionMethod: 'ai',
        confidence: Math.max(mergedData.confidence, qualityCheck.confidence),
        quality: qualityCheck.quality,
        aiAssisted: true,
        documentType: 'purchase_order',
        missingFields: qualityCheck.missingFields,
        warnings: qualityCheck.warnings,
      };
    } else {
      const aiRes = await aiExtractionService.extractInvoiceDocument(fileBuffer, mimeType, {
        companyId,
        userId,
      });

      // Merge with any valid deterministic fields if available
      let mergedData = aiRes.data;
      if (isUsableText) {
        const detResult = deterministicParserService.parseInvoiceText(extractedText, sourceMethod);
        mergedData = this.mergeInvoiceData(detResult.data, aiRes.data);
      }

      const qualityCheck = ExtractionQualityEvaluator.evaluateInvoiceQuality(extractedText, mergedData);

      console.log(`[DOC] Extraction complete via AI (model: ${aiRes.model}, quality: ${qualityCheck.quality})`);
      return {
        data: mergedData,
        rawJson: aiRes.rawJson,
        model: aiRes.model,
        extractionMethod: 'ai',
        confidence: Math.max(mergedData.confidence, qualityCheck.confidence),
        quality: qualityCheck.quality,
        aiAssisted: true,
        documentType: 'invoice',
        missingFields: qualityCheck.missingFields,
        warnings: qualityCheck.warnings,
      };
    }
  }

  /**
   * Smartly merge deterministic invoice data with AI fallback data.
   * Priority:
   * 1. Reliable deterministic values (e.g. invoiceNumber, dates, amounts when valid).
   * 2. AI values when deterministic values are missing, null, or incomplete (e.g. lineItems).
   * 3. Re-calculated derived fields.
   */
  private mergeInvoiceData(
    det: ExtractedInvoiceData,
    ai: ExtractedInvoiceData
  ): ExtractedInvoiceData {
    const invDate = det.invoiceDate || ai.invoiceDate;
    const terms = det.paymentTerms || ai.paymentTerms;
    let dueDate = det.dueDate || ai.dueDate;
    if (!dueDate && invDate && terms) {
      dueDate = NormalizationHelper.calculateDueDateFromTerms(invDate, terms);
    }

    // Determine line items: prefer deterministic if populated and non-empty, otherwise use AI-extracted items
    let lineItems = (det.lineItems && det.lineItems.length > 0)
      ? det.lineItems
      : (ai.lineItems || []);

    return {
      documentType: 'invoice',
      confidence: Math.max(det.confidence, ai.confidence || 0.88),
      invoiceNumber: det.invoiceNumber || ai.invoiceNumber,
      supplierName: det.supplierName || ai.supplierName,
      supplierGstin: det.supplierGstin || ai.supplierGstin,
      supplierEmail: det.supplierEmail || ai.supplierEmail,
      supplierPhone: det.supplierPhone || ai.supplierPhone,
      invoiceDate: invDate,
      dueDate,
      poNumber: det.poNumber || ai.poNumber,
      currency: det.currency || ai.currency || 'INR',
      subtotal: (det.subtotal && det.subtotal > 0) ? det.subtotal : ai.subtotal,
      tax: (det.tax && det.tax > 0) ? det.tax : ai.tax,
      discount: det.discount || ai.discount || 0,
      amount: (det.amount && det.amount > 0) ? det.amount : ai.amount,
      paymentTerms: terms,
      bankDetails: {
        accountNumber: det.bankDetails?.accountNumber || ai.bankDetails?.accountNumber || null,
        ifsc: det.bankDetails?.ifsc || ai.bankDetails?.ifsc || null,
        bankName: det.bankDetails?.bankName || ai.bankDetails?.bankName || null,
      },
      lineItems,
    };
  }

  /**
   * Smartly merge deterministic PO data with AI fallback data.
   */
  private mergePOData(
    det: ExtractedPOData,
    ai: ExtractedPOData
  ): ExtractedPOData {
    let lineItems = (det.lineItems && det.lineItems.length > 0)
      ? det.lineItems
      : (ai.lineItems || []);

    return {
      documentType: 'purchase_order',
      confidence: Math.max(det.confidence, ai.confidence || 0.88),
      poNumber: det.poNumber || ai.poNumber,
      poDate: det.poDate || ai.poDate,
      buyerName: det.buyerName || ai.buyerName,
      buyerGstin: det.buyerGstin || ai.buyerGstin,
      supplierName: det.supplierName || ai.supplierName,
      supplierGstin: det.supplierGstin || ai.supplierGstin,
      supplierEmail: det.supplierEmail || ai.supplierEmail,
      deliveryAddress: det.deliveryAddress || ai.deliveryAddress,
      paymentTerms: det.paymentTerms || ai.paymentTerms,
      expectedDeliveryDate: det.expectedDeliveryDate || ai.expectedDeliveryDate,
      currency: det.currency || ai.currency || 'INR',
      subtotal: (det.subtotal && det.subtotal > 0) ? det.subtotal : ai.subtotal,
      tax: (det.tax && det.tax > 0) ? det.tax : ai.tax,
      total: (det.total && det.total > 0) ? det.total : ai.total,
      lineItems,
    };
  }
}

export const hybridExtractionService = new HybridExtractionService();
