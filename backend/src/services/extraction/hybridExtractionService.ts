import { DocumentType } from '../../models/Document.js';
import { pdfTextExtractionService } from './pdfTextExtractionService.js';
import { ocrService } from './ocrService.js';
import { deterministicParserService } from './deterministicParserService.js';
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
  aiAssisted: boolean;
  documentType: DocumentType;
}

class HybridExtractionService {
  /**
   * Main Hybrid Extraction Pipeline.
   * Runs: PDF Text -> OCR -> Deterministic Parsing -> Validation -> AI Fallback & Smart Merging.
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

    console.log(`[EXTRACTION] Document ${documentId} (${originalFileName}) → starting extraction pipeline...`);

    let extractedText = '';
    let sourceMethod: 'pdf_text' | 'ocr' = 'pdf_text';
    let isUsableText = false;

    // -------------------------------------------------------------
    // Step 1: Text Extraction (PDF Text -> OCR)
    // -------------------------------------------------------------
    if (mimeType === 'application/pdf' || originalFileName.toLowerCase().endsWith('.pdf')) {
      console.log(`[EXTRACTION] Document ${documentId} → attempting local PDF text extraction...`);
      const pdfRes = await pdfTextExtractionService.extractTextFromPDF(fileBuffer);

      if (pdfRes.isUsable) {
        extractedText = pdfRes.text;
        isUsableText = true;
        sourceMethod = 'pdf_text';
        console.log(`[EXTRACTION] Document ${documentId} → PDF text extraction successful (${pdfRes.characterCount} chars, ${pdfRes.pageCount} page(s)). 0 AI tokens used.`);
      } else {
        console.log(`[EXTRACTION] Document ${documentId} → PDF contains minimal selectable text (${pdfRes.characterCount} chars). Routing to OCR/scanned layer...`);
      }
    }

    if (!isUsableText) {
      console.log(`[EXTRACTION] Document ${documentId} → OCR required.`);
      const ocrRes = await ocrService.extractTextWithOCR(fileBuffer, mimeType);
      if (ocrRes.isUsable) {
        extractedText = ocrRes.text;
        isUsableText = true;
        sourceMethod = 'ocr';
        console.log(`[EXTRACTION] Document ${documentId} → OCR text extraction successful via ${ocrRes.engine}.`);
      } else {
        console.log(`[EXTRACTION] Document ${documentId} → local text extraction unusable. Scanned image/complex document requires multimodal AI intelligence layer.`);
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
      console.log(`[EXTRACTION] Document ${documentId} → detected document type from text: "${detectedType}"`);
    }

    // Default to 'invoice' if still unknown to avoid unnecessary classification AI calls
    if (detectedType === 'unknown') {
      detectedType = 'invoice';
    }

    // -------------------------------------------------------------
    // Step 3: Deterministic Field Extraction
    // -------------------------------------------------------------
    if (isUsableText) {
      if (detectedType === 'purchase_order') {
        const detResult = deterministicParserService.parsePOText(extractedText, sourceMethod);

        if (!detResult.needsAI) {
          console.log(`[EXTRACTION] Document ${documentId} → deterministic PO extraction successful (method: ${sourceMethod}, confidence: ${detResult.confidence}). PO: ${detResult.data.poNumber}, Total: ${detResult.data.total}. Zero AI calls made.`);
          return {
            data: detResult.data,
            extractionMethod: sourceMethod,
            confidence: detResult.confidence,
            aiAssisted: false,
            documentType: 'purchase_order',
            model: 'deterministic_parser',
          };
        } else {
          console.log(`[EXTRACTION] Document ${documentId} → deterministic PO extraction incomplete (missing or ambiguous: [${detResult.missingOrAmbiguousFields.join(', ')}]). Triggering AI fallback layer...`);
        }
      } else {
        const detResult = deterministicParserService.parseInvoiceText(extractedText, sourceMethod);

        if (!detResult.needsAI) {
          console.log(`[EXTRACTION] Document ${documentId} → deterministic Invoice extraction successful (method: ${sourceMethod}, confidence: ${detResult.confidence}). Inv: ${detResult.data.invoiceNumber}, Amount: ${detResult.data.amount}, PO: ${detResult.data.poNumber || 'none'}. Zero AI calls made.`);
          return {
            data: detResult.data,
            extractionMethod: sourceMethod,
            confidence: detResult.confidence,
            aiAssisted: false,
            documentType: 'invoice',
            model: 'deterministic_parser',
          };
        } else {
          console.log(`[EXTRACTION] Document ${documentId} → deterministic Invoice extraction incomplete (missing or ambiguous: [${detResult.missingOrAmbiguousFields.join(', ')}]). Triggering AI fallback layer...`);
        }
      }
    }

    // -------------------------------------------------------------
    // Step 4: AI Fallback & Intelligent Merging
    // (Triggered ONLY when text was unusable or essential fields are missing)
    // -------------------------------------------------------------
    console.log(`[EXTRACTION] Document ${documentId} → AI fallback required. Enqueuing for Gemini (Groq fallback)...`);

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

      console.log(`[EXTRACTION] Document ${documentId} → extraction completed via AI (${aiRes.model}).`);
      return {
        data: mergedData,
        rawJson: aiRes.rawJson,
        model: aiRes.model,
        extractionMethod: 'ai',
        confidence: aiRes.data.confidence || 0.88,
        aiAssisted: true,
        documentType: 'purchase_order',
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

      console.log(`[EXTRACTION] Document ${documentId} → extraction completed via AI (${aiRes.model}).`);
      return {
        data: mergedData,
        rawJson: aiRes.rawJson,
        model: aiRes.model,
        extractionMethod: 'ai',
        confidence: aiRes.data.confidence || 0.88,
        aiAssisted: true,
        documentType: 'invoice',
      };
    }
  }

  /**
   * Smartly merge deterministic invoice data with AI fallback data.
   * Preserves reliable deterministic values while using AI to resolve missing/ambiguous fields.
   */
  private mergeInvoiceData(
    det: ExtractedInvoiceData,
    ai: ExtractedInvoiceData
  ): ExtractedInvoiceData {
    return {
      documentType: 'invoice',
      confidence: Math.max(det.confidence, ai.confidence),
      invoiceNumber: det.invoiceNumber || ai.invoiceNumber,
      supplierName: det.supplierName || ai.supplierName,
      supplierGstin: det.supplierGstin || ai.supplierGstin,
      supplierEmail: det.supplierEmail || ai.supplierEmail,
      supplierPhone: det.supplierPhone || ai.supplierPhone,
      invoiceDate: det.invoiceDate || ai.invoiceDate,
      dueDate: det.dueDate || ai.dueDate,
      // Prefer AI for PO number if deterministic failed to find one
      poNumber: det.poNumber || ai.poNumber,
      currency: det.currency || ai.currency || 'INR',
      subtotal: (det.subtotal && det.subtotal > 0) ? det.subtotal : ai.subtotal,
      tax: (det.tax && det.tax > 0) ? det.tax : ai.tax,
      discount: det.discount || ai.discount || 0,
      amount: (det.amount && det.amount > 0) ? det.amount : ai.amount,
      paymentTerms: det.paymentTerms || ai.paymentTerms,
      bankDetails: {
        accountNumber: det.bankDetails?.accountNumber || ai.bankDetails?.accountNumber || null,
        ifsc: det.bankDetails?.ifsc || ai.bankDetails?.ifsc || null,
        bankName: det.bankDetails?.bankName || ai.bankDetails?.bankName || null,
      },
      lineItems: (det.lineItems && det.lineItems.length > 0) ? det.lineItems : ai.lineItems,
    };
  }

  /**
   * Smartly merge deterministic PO data with AI fallback data.
   */
  private mergePOData(
    det: ExtractedPOData,
    ai: ExtractedPOData
  ): ExtractedPOData {
    return {
      documentType: 'purchase_order',
      confidence: Math.max(det.confidence, ai.confidence),
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
      lineItems: (det.lineItems && det.lineItems.length > 0) ? det.lineItems : ai.lineItems,
    };
  }
}

export const hybridExtractionService = new HybridExtractionService();
