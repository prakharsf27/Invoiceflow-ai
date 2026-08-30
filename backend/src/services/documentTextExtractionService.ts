import { PDFParse } from 'pdf-parse';

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
   */
  public async extractText(fileBuffer: Buffer): Promise<TextExtractionResult> {
    if (!fileBuffer || fileBuffer.length === 0) {
      return { success: false, text: '', pageCount: 0, isScanned: true, characterCount: 0 };
    }

    try {
      const parser = new PDFParse({ data: fileBuffer });
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

      return {
        success: isUsable,
        text: cleanedText,
        pageCount: parsed.total || (parsed.pages ? parsed.pages.length : 1),
        isScanned: !isUsable,
        characterCount,
      };
    } catch (error: any) {
      console.warn(`[DocumentTextExtractionService] Local PDF text extraction failed:`, error?.message);
      return {
        success: false,
        text: '',
        pageCount: 0,
        isScanned: true,
        characterCount: 0,
      };
    }
  }
}

export const documentTextExtractionService = new DocumentTextExtractionService();
