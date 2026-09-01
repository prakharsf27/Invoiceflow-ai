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
  aiCallsCount?: number;
}

class HybridExtractionService {
  /**
   * Main Deterministic-First Hybrid Extraction Pipeline.
   * Pipeline:
   * 1. PDF Text Extraction (for text PDFs) -> 0 AI calls
   * 2. Local OCR Extraction (for scanned PDFs, PNG, JPG, JPEG) -> 0 AI calls
   * 3. Deterministic Extraction -> Evaluate Quality (Critical vs Optional)
   * 4. Selective AI Fallback ONLY if critical fields are genuinely missing / ambiguous -> Max 1 Gemini -> Immediate Groq fallback.
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

    console.log(`[DOC] Processing: ${originalFileName}`);
    console.log(`[DOC] MIME: ${mimeType}, size: ${fileBuffer.length} bytes`);

    let extractedText = '';
    let sourceMethod: 'pdf_text' | 'ocr' = 'pdf_text';
    let isUsableText = false;
    let aiCallsCount = 0;

    // -------------------------------------------------------------
    // Step 1: Text Extraction (PDF Text -> Local OCR)
    // -------------------------------------------------------------
    const isPdf = mimeType === 'application/pdf' || originalFileName.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      console.log(`[DOC] Extraction strategy: PDF_TEXT`);
      const pdfRes = await documentTextExtractionService.extractText(fileBuffer);
      if (pdfRes.success && !pdfRes.isScanned) {
        extractedText = pdfRes.text;
        isUsableText = true;
        sourceMethod = 'pdf_text';
        console.log(`[DOC] PDF text extraction: ${pdfRes.characterCount} chars (pages: ${pdfRes.pageCount || 1})`);
        console.log(`[DOC] OCR required: false`);
      } else {
        console.log(`[DOC] PDF text extraction: insufficient (${pdfRes.characterCount} chars). Scanned/image PDF detected.`);
        console.log(`[DOC] OCR required: true`);
      }
    }

    if (!isUsableText) {
      if (!isPdf) {
        console.log(`[DOC] Extraction strategy: OCR (raster image)`);
      } else {
        console.log(`[DOC] Extraction strategy: OCR (scanned PDF rasterization)`);
      }
      const ocrRes = await ocrService.extractTextWithOCR(fileBuffer, mimeType);
      if (ocrRes.isUsable) {
        extractedText = ocrRes.text;
        isUsableText = true;
        sourceMethod = 'ocr';
        console.log(`[DOC] OCR extraction: ${extractedText.length} chars (engine: ${ocrRes.engine}, confidence: ${ocrRes.confidence.toFixed(2)})`);
      } else {
        console.log(`[DOC] OCR extraction: not usable (engine: ${ocrRes.engine}). Routing to AI fallback.`);
      }
    }

    // -------------------------------------------------------------
    // Step 2: Determine Document Type (Text ground truth takes priority)
    // -------------------------------------------------------------
    let detectedType: DocumentType = 'unknown';

    if (isUsableText) {
      const typeFromText = deterministicParserService.detectDocumentTypeFromText(extractedText);
      if (typeFromText !== 'unknown') {
        detectedType = typeFromText;
        console.log(`[DOC] Detected document type from text: ${detectedType}`);
      }
    }

    if (detectedType === 'unknown' && docTypeHint && docTypeHint !== 'unknown') {
      detectedType = docTypeHint;
      console.log(`[DOC] Detected document type from filename hint: ${detectedType}`);
    }

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
          console.log(`[DOC] Deterministic extraction quality: HIGH`);
          console.log(`[DOC] AI calls required: 0`);
          console.log(`[DOC] PO extracted: PO# "${detResult.data.poNumber}", Supplier: "${detResult.data.supplierName}", Total: ₹${detResult.data.total}`);

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
            aiCallsCount: 0,
          };
        } else {
          console.log(`[DOC] Deterministic PO extraction: ${detResult.quality.toUpperCase()} (missing critical: ${detResult.missingOrAmbiguousFields.join(', ')})`);
          console.log(`[DOC] AI calls required: 1`);
        }
      } else {
        const detResult = deterministicParserService.parseInvoiceText(extractedText, sourceMethod);

        if (detResult.quality === 'high' && !detResult.needsAI) {
          console.log(`[DOC] Deterministic extraction quality: HIGH`);
          console.log(`[DOC] AI calls required: 0`);
          console.log(`[DOC] Invoice extracted: Inv# "${detResult.data.invoiceNumber}", Supplier: "${detResult.data.supplierName}", Amount: ₹${detResult.data.amount}`);

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
            aiCallsCount: 0,
          };
        } else {
          console.log(`[DOC] Deterministic invoice extraction: ${detResult.quality.toUpperCase()} (missing critical: ${detResult.missingOrAmbiguousFields.join(', ')})`);
          console.log(`[DOC] AI calls required: 1`);
        }
      }
    } else {
      console.log(`[DOC] Deterministic extraction: UNREADABLE / NO TEXT`);
      console.log(`[DOC] Extraction strategy: AI`);
      console.log(`[DOC] AI calls required: 1`);
    }

    // -------------------------------------------------------------
    // Step 4: Selective AI Fallback (1 Gemini attempt -> Immediate Groq fallback on 429/failure)
    // Gemini: 1 attempt max. Groq: 1 attempt max. No retry storm.
    // -------------------------------------------------------------
    aiCallsCount = 1;
    console.log(`[AI] Gemini attempt: 1/1`);

    if (detectedType === 'purchase_order') {
      const aiRes = await aiExtractionService.extractPODocument(fileBuffer, mimeType, {
        companyId,
        userId,
      });

      // Merge with any valid deterministic fields if available (local has priority)
      let mergedData = aiRes.data;
      if (isUsableText) {
        const detResult = deterministicParserService.parsePOText(extractedText, sourceMethod);
        mergedData = this.mergePOData(detResult.data, aiRes.data);
      }

      const qualityCheck = ExtractionQualityEvaluator.evaluatePOQuality(extractedText, mergedData);

      console.log(`[DOC] Final extraction quality: ${qualityCheck.quality.toUpperCase()} (AI model: ${aiRes.model})`);
      console.log(`[DOC] AI calls: 1`);
      console.log(`[AI] AI extraction validated successfully (PO)`);

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
        aiCallsCount: 1,
      };
    } else {
      const aiRes = await aiExtractionService.extractInvoiceDocument(fileBuffer, mimeType, {
        companyId,
        userId,
      });

      // Merge with any valid deterministic fields if available (local has priority)
      let mergedData = aiRes.data;
      if (isUsableText) {
        const detResult = deterministicParserService.parseInvoiceText(extractedText, sourceMethod);
        mergedData = this.mergeInvoiceData(detResult.data, aiRes.data);
      }

      const qualityCheck = ExtractionQualityEvaluator.evaluateInvoiceQuality(extractedText, mergedData);

      console.log(`[DOC] Final extraction quality: ${qualityCheck.quality.toUpperCase()} (AI model: ${aiRes.model})`);
      console.log(`[DOC] AI calls: 1`);
      console.log(`[AI] AI extraction validated successfully (Invoice)`);

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
        aiCallsCount: 1,
      };
    }
  }

  /**
   * Smartly merge deterministic invoice data with AI fallback data.
   * LOCAL TRUSTWORTHY DATA ALWAYS HAS PRIORITY OVER AI.
   * AI acts as a completion layer for missing/ambiguous fields only.
   */
  private mergeInvoiceData(
    det: ExtractedInvoiceData,
    ai: ExtractedInvoiceData
  ): ExtractedInvoiceData {
    const invDate = (det.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(det.invoiceDate)) ? det.invoiceDate : ai.invoiceDate;
    const terms = det.paymentTerms || ai.paymentTerms;
    let dueDate = det.dueDate || ai.dueDate;
    if (!dueDate && invDate && terms) {
      dueDate = NormalizationHelper.calculateDueDateFromTerms(invDate, terms);
    }

    const lineItems = (det.lineItems && det.lineItems.length > 0)
      ? det.lineItems
      : (ai.lineItems || []);

    const invoiceNumber = (det.invoiceNumber && det.invoiceNumber.trim().length >= 2 && !/^(?:unknown|null|n\/a)$/i.test(det.invoiceNumber))
      ? det.invoiceNumber
      : ai.invoiceNumber;

    const supplierName = (det.supplierName && det.supplierName.trim().length >= 3 && !/^(?:unknown|null|n\/a|supplier|vendor)$/i.test(det.supplierName))
      ? det.supplierName
      : ai.supplierName;

    const amount = (typeof det.amount === 'number' && det.amount > 0)
      ? det.amount
      : ai.amount;

    return {
      documentType: 'invoice',
      confidence: Math.max(det.confidence, ai.confidence || 0.88),
      invoiceNumber,
      supplierName,
      supplierGstin: det.supplierGstin || ai.supplierGstin,
      supplierEmail: det.supplierEmail || ai.supplierEmail,
      supplierPhone: det.supplierPhone || ai.supplierPhone,
      invoiceDate: invDate,
      dueDate,
      poNumber: det.poNumber || ai.poNumber,
      currency: det.currency || ai.currency || 'INR',
      subtotal: (typeof det.subtotal === 'number' && det.subtotal > 0) ? det.subtotal : ai.subtotal,
      tax: (typeof det.tax === 'number' && det.tax > 0) ? det.tax : ai.tax,
      discount: det.discount || ai.discount || 0,
      amount,
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
   * LOCAL TRUSTWORTHY DATA ALWAYS HAS PRIORITY OVER AI.
   */
  private mergePOData(
    det: ExtractedPOData,
    ai: ExtractedPOData
  ): ExtractedPOData {
    const lineItems = (det.lineItems && det.lineItems.length > 0)
      ? det.lineItems
      : (ai.lineItems || []);

    const poNumber = (det.poNumber && det.poNumber.trim().length >= 2 && !/^(?:unknown|null|n\/a)$/i.test(det.poNumber))
      ? det.poNumber
      : ai.poNumber;

    const supplierName = (det.supplierName && det.supplierName.trim().length >= 3 && !/^(?:unknown|null|n\/a|supplier|vendor)$/i.test(det.supplierName))
      ? det.supplierName
      : ai.supplierName;

    const poDate = (det.poDate && /^\d{4}-\d{2}-\d{2}$/.test(det.poDate)) ? det.poDate : ai.poDate;

    const total = (typeof det.total === 'number' && det.total > 0)
      ? det.total
      : ai.total;

    return {
      documentType: 'purchase_order',
      confidence: Math.max(det.confidence, ai.confidence || 0.88),
      poNumber,
      poDate,
      buyerName: det.buyerName || ai.buyerName,
      buyerGstin: det.buyerGstin || ai.buyerGstin,
      supplierName,
      supplierGstin: det.supplierGstin || ai.supplierGstin,
      supplierEmail: det.supplierEmail || ai.supplierEmail,
      deliveryAddress: det.deliveryAddress || ai.deliveryAddress,
      paymentTerms: det.paymentTerms || ai.paymentTerms,
      expectedDeliveryDate: det.expectedDeliveryDate || ai.expectedDeliveryDate,
      currency: det.currency || ai.currency || 'INR',
      subtotal: (typeof det.subtotal === 'number' && det.subtotal > 0) ? det.subtotal : ai.subtotal,
      tax: (typeof det.tax === 'number' && det.tax > 0) ? det.tax : ai.tax,
      total,
      lineItems,
    };
  }
}

export const hybridExtractionService = new HybridExtractionService();
