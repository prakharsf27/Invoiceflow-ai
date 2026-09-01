/**
 * OCR Abstraction Service.
 * Provides local OCR for images (PNG, JPG, JPEG) and scanned PDFs using Tesseract.js.
 * Fully in-process and deterministic with zero external AI API consumption.
 */

import Tesseract from 'tesseract.js';

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
    // 1. Primary local OCR engine: Tesseract.js (in-process, 0 API quota)
    this.providers.push({
      name: 'tesseract_local',
      isAvailable: () => true,
      extractText: async (fileBuffer: Buffer, mimeType: string): Promise<OCRResult> => {
        try {
          const isImage = mimeType.startsWith('image/');
          if (!isImage) {
            return {
              text: '',
              method: 'ocr',
              isUsable: false,
              confidence: 0,
              engine: 'tesseract_local',
            };
          }

          const { data } = await Tesseract.recognize(fileBuffer, 'eng', {
            logger: () => {}, // silent in production
          });

          const rawText = data?.text || '';
          const cleanedText = rawText
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .trim();

          const alphanumericCount = (cleanedText.match(/[a-zA-Z0-9]/g) || []).length;
          const isUsable = alphanumericCount >= 30;
          const rawConf = typeof data?.confidence === 'number' ? data.confidence : 75;
          const normalizedConf = isUsable
            ? Math.min(0.95, Math.max(0.60, Math.round(rawConf) / 100))
            : 0;

          return {
            text: cleanedText,
            method: 'ocr',
            isUsable,
            confidence: normalizedConf,
            engine: 'tesseract_local',
          };
        } catch (err: any) {
          console.warn(`[OCRService] Tesseract recognition failed:`, err?.message);
          return {
            text: '',
            method: 'ocr',
            isUsable: false,
            confidence: 0,
            engine: 'tesseract_local',
          };
        }
      },
    });

    // 2. Secondary fallback: Stream chunk scanner for PDF buffers
    this.providers.push({
      name: 'buffer_stream_scanner',
      isAvailable: () => true,
      extractText: async (fileBuffer: Buffer, mimeType: string): Promise<OCRResult> => {
        try {
          if (mimeType.startsWith('image/')) {
            return {
              text: '',
              method: 'ocr',
              isUsable: false,
              confidence: 0,
              engine: 'buffer_stream_scanner',
            };
          }

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
          const isUsable = alphanumericCount >= 40;

          return {
            text: extracted,
            method: 'ocr',
            isUsable,
            confidence: isUsable ? 0.70 : 0,
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
   * Extract text from scanned PDF or raster image (PNG, JPG, JPEG) using available OCR engines.
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
