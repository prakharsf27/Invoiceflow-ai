import { PDFParse } from 'pdf-parse';

export interface PDFTextExtractionResult {
  text: string;
  pageCount: number;
  isUsable: boolean;
  characterCount: number;
}

class PDFTextExtractionService {
  /**
   * Minimum printable characters required for a PDF to be considered text-based
   * rather than a scanned image wrapped in a PDF envelope.
   */
  private readonly MIN_USABLE_TEXT_LENGTH = 40;

  /**
   * Extract selectable text content from a PDF buffer in-memory (0 AI calls).
   * Fast, synchronous-style execution with zero external network dependencies.
   */
  public async extractTextFromPDF(fileBuffer: Buffer): Promise<PDFTextExtractionResult> {
    if (!fileBuffer || fileBuffer.length === 0) {
      return { text: '', pageCount: 0, isUsable: false, characterCount: 0 };
    }

    try {
      const parser = new PDFParse({ data: fileBuffer });
      const parsed = await parser.getText();
      const rawText = parsed.text || '';

      // Normalize line breaks and clean whitespace
      const cleanedText = rawText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();

      const characterCount = cleanedText.length;
      // Check if text has meaningful alphanumeric density (not just unprintable control characters)
      const alphanumericCount = (cleanedText.match(/[a-zA-Z0-9]/g) || []).length;
      const isUsable = alphanumericCount >= this.MIN_USABLE_TEXT_LENGTH;

      return {
        text: cleanedText,
        pageCount: parsed.total || (parsed.pages ? parsed.pages.length : 1),
        isUsable,
        characterCount,
      };
    } catch (error: any) {
      console.warn(`[PDFTextExtractionService] Local PDF text extraction failed or unsupported:`, error?.message);
      return {
        text: '',
        pageCount: 0,
        isUsable: false,
        characterCount: 0,
      };
    }
  }
}

export const pdfTextExtractionService = new PDFTextExtractionService();
