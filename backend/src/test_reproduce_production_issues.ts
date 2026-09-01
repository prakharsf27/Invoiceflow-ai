import { createCanvas } from 'canvas';
import { documentTypeService } from './services/documentTypeService.js';
import { deterministicParserService } from './services/extraction/deterministicParserService.js';
import { hybridExtractionService } from './services/extraction/hybridExtractionService.js';
import { ocrService } from './services/extraction/ocrService.js';
import { ExtractionQualityEvaluator } from './services/extraction/extractionQualityEvaluator.js';

function createPdfBuffer(lines: string[]): Buffer {
  let streamContent = 'BT\n/F1 10 Tf\n50 750 Td\n16 TL\n';
  for (const l of lines) {
    const escaped = l.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    streamContent += `(${escaped}) Tj\nT*\n`;
  }
  streamContent += 'ET\n';

  const streamLen = Buffer.byteLength(streamContent);
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${streamLen} >>
stream
${streamContent}endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000293 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${400 + streamLen}
%%EOF`;
  return Buffer.from(pdf);
}

function createImageBuffer(textLines: string[], width = 800, height = 1000): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Black text
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 22px Arial';

  let y = 60;
  for (const line of textLines) {
    if (line.startsWith('TAX INVOICE') || line.startsWith('PURCHASE ORDER')) {
      ctx.font = 'bold 28px Arial';
    } else if (line.includes('Total') || line.includes('INV-') || line.includes('PO-')) {
      ctx.font = 'bold 22px Arial';
    } else {
      ctx.font = '18px Arial';
    }
    ctx.fillText(line, 50, y);
    y += 35;
  }

  return canvas.toBuffer('image/png');
}

async function testProductionIssues() {
  console.log('================================================================');
  console.log('🔍 REPRODUCING PRODUCTION FAILURES');
  console.log('================================================================\n');

  // Issue 1: 18_NO_PO_INV-TEST-018.pdf
  console.log('----------------------------------------------------');
  console.log('Test 1: 18_NO_PO_INV-TEST-018.pdf classification & extraction');
  console.log('----------------------------------------------------');
  const fn1 = '18_NO_PO_INV-TEST-018.pdf';
  const detectedType1 = documentTypeService.detectTypeFromFilename(fn1);
  console.log(`Filename: ${fn1}`);
  console.log(`detectTypeFromFilename result: "${detectedType1}" (Expected: "invoice")`);

  const pdf1Lines = [
    'TAX INVOICE',
    'Apex Cloud Solutions Pvt. Ltd.',
    'GSTIN: 29AAFCA8912J1ZQ',
    '',
    'Invoice Number: INV-TEST-018',
    'Invoice Date: 2026-09-18',
    'Due Date: 2026-10-18',
    '',
    'Subtotal: Rs. 120,000.00',
    'GST @ 18%: Rs. 21,600.00',
    'Total Amount: Rs. 141,600.00',
  ];
  const pdf1Buffer = createPdfBuffer(pdf1Lines);
  const ext1 = await hybridExtractionService.extractDocument(pdf1Buffer, 'application/pdf', {
    documentId: 'doc-repro-1',
    originalFileName: fn1,
    docTypeHint: detectedType1,
  });
  console.log(`Extraction method: ${ext1.extractionMethod}`);
  console.log(`Document type: ${ext1.documentType}`);
  console.log(`AI calls: ${ext1.aiCallsCount}`);
  console.log(`Quality: ${ext1.quality}`);
  console.log(`Data:`, ext1.data);

  // Issue 2: 20_SCANNED_CLEAN_INV-TEST-020.png
  console.log('\n----------------------------------------------------');
  console.log('Test 2: 20_SCANNED_CLEAN_INV-TEST-020.png (Clean image invoice)');
  console.log('----------------------------------------------------');
  const fn2 = '20_SCANNED_CLEAN_INV-TEST-020.png';
  const img2Lines = [
    'TAX INVOICE',
    'TechNova Solutions Pvt Ltd',
    'GSTIN: 27AABCT3518Q1ZS',
    'Invoice Number: INV-TEST-020',
    'Invoice Date: 2026-09-20',
    'Due Date: 2026-10-20',
    'Purchase Order: PO-2026-TEST-020',
    'Subtotal: Rs. 150,000.00',
    'GST @ 18%: Rs. 27,000.00',
    'Total Amount: Rs. 177,000.00',
  ];
  const img2Buffer = createImageBuffer(img2Lines);
  const ocr2 = await ocrService.extractTextWithOCR(img2Buffer, 'image/png');
  console.log(`OCR isUsable: ${ocr2.isUsable}, text length: ${ocr2.text.length}`);
  console.log(`OCR raw text:\n"""\n${ocr2.text}\n"""`);

  const ext2 = await hybridExtractionService.extractDocument(img2Buffer, 'image/png', {
    documentId: 'doc-repro-2',
    originalFileName: fn2,
    docTypeHint: documentTypeService.detectTypeFromFilename(fn2),
  });
  console.log(`Extraction method: ${ext2.extractionMethod}`);
  console.log(`AI calls: ${ext2.aiCallsCount}`);
  console.log(`Quality: ${ext2.quality}`);
  console.log(`Data:`, ext2.data);

  // Issue 3: 21_SCANNED_OVERRUN_INV-TEST-021.png
  console.log('\n----------------------------------------------------');
  console.log('Test 3: 21_SCANNED_OVERRUN_INV-TEST-021.png (Overrun scanned invoice)');
  console.log('----------------------------------------------------');
  const fn3 = '21_SCANNED_OVERRUN_INV-TEST-021.png';
  const img3Lines = [
    'TAX INVOICE',
    'DataCore Industrial Supplies Pvt Ltd',
    'GSTIN: 29AAFCA8912J1ZQ',
    'Invoice Number: INV-TEST-021',
    'Invoice Date: 2026-09-21',
    'Due Date: 2026-10-21',
    'Purchase Order: PO-2026-TEST-021',
    '1. Enterprise Cloud Server Qty: 10 Unit Price: 50,000.00 Tax Rate: 18% Tax Amount: 90,000.00 Total: 590,000.00',
    'Subtotal: Rs. 500,000.00',
    'GST @ 18%: Rs. 90,000.00',
    'Total Amount: Rs. 590,000.00',
  ];
  const img3Buffer = createImageBuffer(img3Lines);
  const ocr3 = await ocrService.extractTextWithOCR(img3Buffer, 'image/png');
  console.log(`OCR isUsable: ${ocr3.isUsable}, text length: ${ocr3.text.length}`);
  console.log(`OCR raw text:\n"""\n${ocr3.text}\n"""`);

  const ext3 = await hybridExtractionService.extractDocument(img3Buffer, 'image/png', {
    documentId: 'doc-repro-3',
    originalFileName: fn3,
    docTypeHint: documentTypeService.detectTypeFromFilename(fn3),
  });
  console.log(`Extraction method: ${ext3.extractionMethod}`);
  console.log(`AI calls: ${ext3.aiCallsCount}`);
  console.log(`Quality: ${ext3.quality}`);
  console.log(`Data:`, ext3.data);
}

testProductionIssues().catch(console.error);
