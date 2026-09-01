/**
 * @deprecated Use documentTextExtractionService instead.
 * This service is kept for backwards compatibility.
 * The canonical PDF text extraction service is:
 *   backend/src/services/documentTextExtractionService.ts
 *
 * This file is NOT actively used in the extraction pipeline.
 */

import { documentTextExtractionService } from '../documentTextExtractionService.js';

export interface PDFTextExtractionResult {
  text: string;
  pageCount: number;
  isUsable: boolean;
  characterCount: number;
}

class PDFTextExtractionService {
  /**
   * @deprecated Use documentTextExtractionService.extractText() instead.
   */
  public async extractTextFromPDF(fileBuffer: Buffer): Promise<PDFTextExtractionResult> {
    const result = await documentTextExtractionService.extractText(fileBuffer);
    return {
      text: result.text,
      pageCount: result.pageCount ?? 0,
      isUsable: result.success,
      characterCount: result.characterCount,
    };
  }
}

export const pdfTextExtractionService = new PDFTextExtractionService();
