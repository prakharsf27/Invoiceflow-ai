/**
 * Document Text Extraction Service.
 * Extracts selectable text from text-based PDF files using pdf-parse v2.
 *
 * Key guarantees:
 * - PDFParse instances are ALWAYS destroyed in finally blocks (no worker leaks)
 * - Minimum usable text threshold: 40 alphanumeric characters
 * - Returns isScanned=true when text is insufficient (routes to OCR pipeline)
 * - Zero AI calls
 */

export interface TextExtractionResult {
  success: boolean;
  text: string;
  pageCount?: number;
  isScanned?: boolean;
  characterCount: number;
}

export class DocumentTextExtractionService {
  private readonly MIN_USABLE_TEXT_LENGTH = 40;

  /**
   * Extract text directly from PDF buffer in-memory without invoking external AI APIs.
   * PDF workers are always destroyed to prevent resource leaks.
   */
  public async extractText(fileBuffer: Buffer): Promise<TextExtractionResult> {
    if (!fileBuffer || fileBuffer.length === 0) {
      return { success: false, text: '', pageCount: 0, isScanned: true, characterCount: 0 };
    }

    let parser: any = null;
    try {
      const pdfParseModule = await import('pdf-parse');
      const PDFParse = (pdfParseModule as any).PDFParse ?? (pdfParseModule as any).default?.PDFParse;
      if (!PDFParse) throw new Error('PDFParse class not available in pdf-parse module');

      parser = new PDFParse({ data: fileBuffer });
      const parsed = await parser.getText();
      const rawText = parsed.text || '';

      const cleanedText = rawText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();

      const characterCount = cleanedText.length;
      const alphanumericCount = (cleanedText.match(/[a-zA-Z0-9]/g) || []).length;
      const isUsable = alphanumericCount >= this.MIN_USABLE_TEXT_LENGTH;

      console.log(`[DOC] PDF text extraction: ${characterCount} chars, ${alphanumericCount} alphanumeric, usable=${isUsable}, pages=${parsed.total ?? 1}`);

      return {
        success: isUsable,
        text: cleanedText,
        pageCount: parsed.total || (parsed.pages ? parsed.pages.length : 1),
        isScanned: !isUsable,
        characterCount,
      };
    } catch (error: any) {
      console.warn(`[DocumentTextExtractionService] PDF text extraction failed: ${error?.message}`);
      return {
        success: false,
        text: '',
        pageCount: 0,
        isScanned: true,
        characterCount: 0,
      };
    } finally {
      if (parser) {
        try { await parser.destroy(); } catch { /* ignore destroy errors */ }
      }
    }
  }
}

export const documentTextExtractionService = new DocumentTextExtractionService();
