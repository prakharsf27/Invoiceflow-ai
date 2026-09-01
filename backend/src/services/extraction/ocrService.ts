/**
 * OCR Service — Production-Hardened.
 *
 * Deterministic-first pipeline:
 * - PNG / JPEG / JPEG2000 → Tesseract OCR directly
 * - Scanned PDF → rasterize with pdf-parse v2 getScreenshot() → Tesseract OCR per page
 * - Text PDF → handled upstream by documentTextExtractionService (NOT via this service)
 *
 * Key guarantees:
 * - Tesseract uses local @tesseract.js-data/eng (no jsdelivr CDN required at runtime)
 * - Invoice-specific quality check replaces weak alphanumeric count threshold
 * - PDF workers are ALWAYS destroyed in finally blocks (no resource leaks)
 * - Zero AI calls from this service
 */

import { createRequire } from 'module';
import Tesseract from 'tesseract.js';

// ---------------------------------------------------------------------------
// Resolve local Tesseract language data path (no CDN dependency)
// ---------------------------------------------------------------------------
const _require = createRequire(import.meta.url);

let LOCAL_LANG_PATH = '';
let LOCAL_LANG_GZIP = true;

try {
  const engData = _require('@tesseract.js-data/eng');
  LOCAL_LANG_PATH = engData.langPath as string;
  LOCAL_LANG_GZIP = engData.gzip !== false;
  console.log(`[OCRService] Using local Tesseract eng data: ${LOCAL_LANG_PATH}`);
} catch {
  console.warn('[OCRService] @tesseract.js-data/eng not found. Tesseract will fall back to CDN.');
}

// ---------------------------------------------------------------------------
// OCR Quality Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate whether OCR text contains enough invoice/PO-relevant content to be usable.
 * Replaces weak alphanumeric count with invoice-specific content signals.
 */
function evaluateOCRQuality(text: string): { isUsable: boolean; score: number; signals: string[] } {
  if (!text || text.trim().length < 20) {
    return { isUsable: false, score: 0, signals: [] };
  }

  const lower = text.toLowerCase();
  const signals: string[] = [];
  let score = 0;

  // 1. Invoice/PO structural keywords
  if (/\binvoice\b|\btax\s*invoice\b|\bvat\s*invoice\b/.test(lower)) {
    score += 20; signals.push('keyword:invoice');
  }
  if (/\bpurchase\s*order\b|\bpo\s*(?:no|number|#)\b/.test(lower)) {
    score += 20; signals.push('keyword:po');
  }
  if (/\binvoice\s*(?:no|number|#|num)\b/.test(lower)) {
    score += 15; signals.push('keyword:invoice_number');
  }
  if (/\bbill\s*(?:to|from)\b|\bsupplier\b|\bvendor\b|\bsold\s*by\b/.test(lower)) {
    score += 15; signals.push('keyword:supplier');
  }

  // 2. Financial/amount patterns
  if (/(?:rs\.?|inr|₹|usd|\$|eur|€)\s*[\d,]+/.test(lower) || /[\d,]+(?:\.\d{2})?\s*(?:rs\.?|inr|₹)/.test(lower)) {
    score += 20; signals.push('pattern:currency');
  }
  if (/\btotal\s*(?:amount|payable|due)?\s*:?\s*[\d,]+/.test(lower) || /\bgrand\s*total\b/.test(lower)) {
    score += 15; signals.push('pattern:total');
  }
  if (/\bsubtotal\b|\bsub\s*total\b/.test(lower)) { score += 10; signals.push('pattern:subtotal'); }
  if (/\btax\b|\bgst\b|\bcgst\b|\bsgst\b|\bigst\b|\bvat\b/.test(lower)) { score += 10; signals.push('pattern:tax'); }

  // 3. Date patterns
  if (/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/.test(text) || /\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b/.test(text)) {
    score += 15; signals.push('pattern:date');
  }

  // 4. Reference number patterns
  if (/\b(?:inv|po|ord|bill|ref|doc)[\/\-#]?\s*[a-z0-9]{2,}[-\/]?\d{2,}/i.test(text)) {
    score += 10; signals.push('pattern:reference');
  }

  // 5. Numeric density
  const numericTokens = (text.match(/\b\d+(?:[,\s]\d+)*(?:\.\d+)?\b/g) || []).length;
  if (numericTokens >= 5) { score += 10; signals.push(`numeric_density:${numericTokens}`); }

  // Minimum raw text length check
  const alphanumericCount = (text.match(/[a-zA-Z0-9]/g) || []).length;
  if (alphanumericCount < 50) {
    return { isUsable: false, score: 0, signals: ['too_short'] };
  }

  return { isUsable: score >= 25, score, signals };
}

// ---------------------------------------------------------------------------
// Tesseract worker (with local lang data)
// ---------------------------------------------------------------------------
async function runTesseract(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
  const workerOptions: Record<string, any> = {
    logger: () => {},
    // Suppress worker error events to avoid unhandled rejection in Node
    errorHandler: () => {},
  };

  if (LOCAL_LANG_PATH) {
    workerOptions.langPath = LOCAL_LANG_PATH;
    workerOptions.gzip = LOCAL_LANG_GZIP;
  }

  let worker: any = null;
  try {
    worker = await Tesseract.createWorker('eng', 1, workerOptions as any);
    const { data } = await worker.recognize(imageBuffer);
    return {
      text: (data?.text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(),
      confidence: typeof data?.confidence === 'number' ? data.confidence : 75,
    };
  } catch (err: any) {
    // Gracefully handle invalid image errors (not a valid raster image, corrupt buffer, etc.)
    const msg = String(err?.message || err);
    if (/read image|unknown format|invalid|corrupt|pix/i.test(msg)) {
      console.warn(`[OCRService] Tesseract: image not readable (${msg.slice(0, 80)}). Returning empty result.`);
    } else {
      console.warn(`[OCRService] Tesseract error: ${msg.slice(0, 120)}`);
    }
    return { text: '', confidence: 0 };
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Image Preprocessing Pipeline (using node-canvas)
// ---------------------------------------------------------------------------
async function preprocessImageForOCR(imageBuffer: Buffer): Promise<Buffer | null> {
  try {
    const { createCanvas, loadImage } = await import('canvas');
    const img = await loadImage(imageBuffer);

    // 1. Target resolution: scale image to optimal text recognition DPI (~1800 - 2400px width)
    let scale = 1.0;
    if (img.width < 1000) {
      scale = Math.min(3.0, 2000 / img.width);
    } else if (img.width < 1600) {
      scale = 1.5;
    } else if (img.width > 3200) {
      scale = 2400 / img.width;
    }

    const targetWidth = Math.max(200, Math.round(img.width * scale));
    const targetHeight = Math.max(200, Math.round(img.height * scale));

    const canvas = createCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');

    // High quality interpolation
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';

    // White background fill for transparent PNGs
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // Draw scaled image
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // Pixel-level luminance & contrast stretching
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;

    let minLuma = 255;
    let maxLuma = 0;

    for (let i = 0; i < data.length; i += 4) {
      const luma = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = luma;
      data[i + 1] = luma;
      data[i + 2] = luma;
      if (luma < minLuma) minLuma = luma;
      if (luma > maxLuma) maxLuma = luma;
    }

    // Auto-levels / contrast enhancement if dynamic range is compressed
    const range = maxLuma - minLuma;
    if (range > 20 && range < 220) {
      for (let i = 0; i < data.length; i += 4) {
        const stretched = Math.min(255, Math.max(0, Math.round(((data[i] - minLuma) / range) * 255)));
        data[i] = stretched;
        data[i + 1] = stretched;
        data[i + 2] = stretched;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toBuffer('image/png');
  } catch (err: any) {
    console.warn(`[OCRService] Image preprocessing fallback: ${err?.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scanned PDF → rasterize → Tesseract
// ---------------------------------------------------------------------------
async function ocrScannedPDF(fileBuffer: Buffer): Promise<{ text: string; isUsable: boolean; confidence: number }> {
  let PDFParseClass: any;
  try {
    const mod = await import('pdf-parse');
    PDFParseClass = (mod as any).PDFParse ?? (mod as any).default?.PDFParse;
    if (!PDFParseClass) throw new Error('PDFParse class not exported from pdf-parse');
  } catch (err: any) {
    console.warn(`[OCRService] pdf-parse import failed: ${err?.message}`);
    return { text: '', isUsable: false, confidence: 0 };
  }

  const parser = new PDFParseClass({ data: fileBuffer });
  try {
    const loadResult = await parser.load();
    const numPages: number = loadResult?.numPages ?? 0;

    if (numPages === 0) {
      console.warn('[OCRService] Scanned PDF has 0 pages.');
      return { text: '', isUsable: false, confidence: 0 };
    }

    const pagesToProcess = Math.min(numPages, 5);
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      try {
        console.log(`[OCR] Rasterizing PDF page ${pageNum}/${pagesToProcess}`);
        const screenshotResult = await parser.getScreenshot({
          imageBuffer: true,
          pages: [pageNum],
          scale: 2.0,
        });

        const pages: any[] = screenshotResult?.pages ?? [];
        for (const page of pages) {
          const imgData: Uint8Array | undefined = page?.data;
          if (!imgData || imgData.length === 0) continue;

          let imgBuffer: Buffer = Buffer.from(imgData);
          const preprocessed = await preprocessImageForOCR(imgBuffer);
          if (preprocessed) {
            imgBuffer = Buffer.from(preprocessed);
          }

          console.log(`[OCR] Tesseract recognizing page ${pageNum} (${imgBuffer.length} bytes)`);
          const { text } = await runTesseract(imgBuffer);
          if (text && text.trim().length > 10) {
            pageTexts.push(text.trim());
          }
        }
      } catch (pageErr: any) {
        console.warn(`[OCRService] Failed to rasterize/OCR page ${pageNum}: ${pageErr?.message}`);
      }
    }

    const combinedText = pageTexts.join('\n\n').trim();
    const quality = evaluateOCRQuality(combinedText);
    console.log(`[OCR] Scanned PDF OCR: ${combinedText.length} chars, score=${quality.score}, usable=${quality.isUsable}, signals=[${quality.signals.join(', ')}]`);

    return {
      text: combinedText,
      isUsable: quality.isUsable,
      confidence: quality.isUsable ? 0.75 : 0,
    };
  } finally {
    try { await parser.destroy(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export interface OCRResult {
  text: string;
  method: 'ocr';
  isUsable: boolean;
  confidence: number;
  engine: string;
}

class DefaultOCRService {
  /**
   * Extract text from raster images (PNG/JPEG) or scanned PDFs using Tesseract.js.
   *
   * Text-based PDFs must be routed via documentTextExtractionService — NOT here.
   */
  public async extractTextWithOCR(fileBuffer: Buffer, mimeType: string): Promise<OCRResult> {
    const isImage = mimeType.startsWith('image/');
    const isPDF = mimeType === 'application/pdf';

    // Path 1: Raster image (PNG/JPEG/JPG)
    if (isImage) {
      console.log(`[OCR] Processing raster image (${mimeType}, ${fileBuffer.length} bytes)`);
      try {
        // Pass 1: Preprocessed image (upscaled + contrast normalized)
        const preprocessed = await preprocessImageForOCR(fileBuffer);
        const pass1Buffer: Buffer = preprocessed ? Buffer.from(preprocessed) : fileBuffer;

        const res1 = await runTesseract(pass1Buffer);
        const qual1 = evaluateOCRQuality(res1.text);

        console.log(`[OCR] Pass 1 (preprocessed): ${res1.text.length} chars, score=${qual1.score}, usable=${qual1.isUsable}`);

        if (qual1.isUsable && qual1.score >= 25) {
          return {
            text: res1.text,
            method: 'ocr',
            isUsable: true,
            confidence: Math.min(0.95, Math.max(0.60, res1.confidence / 100)),
            engine: 'tesseract_local',
          };
        }

        // Pass 2: Raw original image fallback if Pass 1 wasn't usable
        if (preprocessed && !qual1.isUsable) {
          console.log(`[OCR] Running Pass 2 (raw original image fallback)...`);
          const res2 = await runTesseract(fileBuffer);
          const qual2 = evaluateOCRQuality(res2.text);

          console.log(`[OCR] Pass 2 (raw): ${res2.text.length} chars, score=${qual2.score}, usable=${qual2.isUsable}`);

          const bestText = qual2.score >= qual1.score ? res2.text : res1.text;
          const bestScore = Math.max(qual1.score, qual2.score);
          const isUsable = bestScore >= 25;

          return {
            text: bestText,
            method: 'ocr',
            isUsable,
            confidence: isUsable ? 0.75 : 0,
            engine: 'tesseract_local',
          };
        }

        return {
          text: res1.text,
          method: 'ocr',
          isUsable: qual1.isUsable,
          confidence: qual1.isUsable ? Math.min(0.95, Math.max(0.60, res1.confidence / 100)) : 0,
          engine: 'tesseract_local',
        };
      } catch (err: any) {
        console.warn(`[OCRService] Tesseract failed for image: ${err?.message}`);
        return { text: '', method: 'ocr', isUsable: false, confidence: 0, engine: 'tesseract_local' };
      }
    }

    // Path 2: Scanned PDF (rasterize first)
    if (isPDF) {
      console.log('[OCR] Scanned PDF: starting rasterization pipeline');
      try {
        const result = await ocrScannedPDF(fileBuffer);
        return {
          text: result.text,
          method: 'ocr',
          isUsable: result.isUsable,
          confidence: result.confidence,
          engine: 'tesseract_local_pdf_rasterize',
        };
      } catch (err: any) {
        console.warn(`[OCRService] Scanned PDF OCR pipeline failed: ${err?.message}`);
        return { text: '', method: 'ocr', isUsable: false, confidence: 0, engine: 'tesseract_local_pdf_rasterize' };
      }
    }

    console.warn(`[OCRService] Unsupported MIME type for OCR: ${mimeType}`);
    return { text: '', method: 'ocr', isUsable: false, confidence: 0, engine: 'none' };
  }
}

export const ocrService = new DefaultOCRService();
