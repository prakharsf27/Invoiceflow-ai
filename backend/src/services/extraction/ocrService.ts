/**
 * OCR Abstraction Service.
 * Provides a clean interface for extracting text from scanned PDFs or images (PNG, JPG, TIFF).
 * Can be plugged into specialized OCR engines (Tesseract, AWS Textract, Google Cloud Vision, etc.)
 * or gracefully hand off to the multimodal AI intelligence layer.
 */

export interface OCRResult {
  text: string;
  method: 'ocr';
  isUsable: boolean;
  confidence: number;
  engine: string;
}

export interface IOCRProvider {
  name: string;
  isAvailable(): boolean;
  extractText(fileBuffer: Buffer, mimeType: string): Promise<OCRResult>;
}

class DefaultOCRService {
  private providers: IOCRProvider[] = [];

  constructor() {
    // Built-in fallback provider that extracts readable printable chunks from buffer
    this.providers.push({
      name: 'buffer_stream_scanner',
      isAvailable: () => true,
      extractText: async (fileBuffer: Buffer, mimeType: string): Promise<OCRResult> => {
        try {
          if (mimeType.startsWith('image/')) {
            // For pure raster images without local OCR engine, return empty so pipeline routes to multimodal AI
            return {
              text: '',
              method: 'ocr',
              isUsable: false,
              confidence: 0,
              engine: 'buffer_stream_scanner',
            };
          }

          // For scanned PDF streams, extract any printable ASCII/Unicode fragments
          const raw = fileBuffer.toString('utf-8');
          const printable = raw.match(/[\x20-\x7E\n\r\t]{4,}/g) || [];
          const filtered = printable.filter(
            (str) =>
              !str.startsWith('/') &&
              !str.startsWith('<<') &&
              !str.startsWith('>>') &&
              !str.includes('obj') &&
              !str.includes('endstream') &&
              !str.includes('xref')
          );
          const extracted = filtered.join('\n').slice(0, 10000).trim();
          const alphanumericCount = (extracted.match(/[a-zA-Z0-9]/g) || []).length;
          const isUsable = alphanumericCount >= 50;

          return {
            text: extracted,
            method: 'ocr',
            isUsable,
            confidence: isUsable ? 0.75 : 0,
            engine: 'buffer_stream_scanner',
          };
        } catch {
          return {
            text: '',
            method: 'ocr',
            isUsable: false,
            confidence: 0,
            engine: 'buffer_stream_scanner',
          };
        }
      },
    });
  }

  public registerProvider(provider: IOCRProvider): void {
    this.providers.unshift(provider);
  }

  /**
   * Extract text from scanned PDF or image using the first available OCR provider.
   */
  public async extractTextWithOCR(fileBuffer: Buffer, mimeType: string): Promise<OCRResult> {
    for (const provider of this.providers) {
      if (provider.isAvailable()) {
        try {
          const result = await provider.extractText(fileBuffer, mimeType);
          if (result.isUsable) {
            return result;
          }
        } catch (err: any) {
          console.warn(`[OCRService] Provider ${provider.name} failed:`, err?.message);
        }
      }
    }

    return {
      text: '',
      method: 'ocr',
      isUsable: false,
      confidence: 0,
      engine: 'none',
    };
  }
}

export const ocrService = new DefaultOCRService();
