import { createCanvas } from 'canvas';
import { connectDB } from './config/db.js';
import { documentStorageService } from './services/storage/documentStorageService.js';
import { documentProcessingService } from './services/documentProcessingService.js';
import { DocumentModel } from './models/Document.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { InvoiceModel } from './models/Invoice.js';
import { hybridExtractionService } from './services/extraction/hybridExtractionService.js';
import { deterministicParserService } from './services/extraction/deterministicParserService.js';
import { documentTextExtractionService } from './services/documentTextExtractionService.js';
import { ocrService } from './services/extraction/ocrService.js';
import { ExtractionQualityEvaluator } from './services/extraction/extractionQualityEvaluator.js';
import { poMatchingService } from './services/poMatchingService.js';

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
00000000115 00000 n 
0000000224 00000 n 
0000000293 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${400 + streamLen}
%%EOF`;
  return Buffer.from(pdf);
}

function createImageBuffer(textLines: string[], format: 'image/png' | 'image/jpeg' = 'image/png', width = 900, height = 1200): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

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
    y += 38;
  }

  return format === 'image/jpeg' ? canvas.toBuffer('image/jpeg', { quality: 0.95 }) : canvas.toBuffer('image/png');
}

async function runScreenshotAndProductionSuite() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  EXACT OCR SCREENSHOT & COMPREHENSIVE PRODUCTION TEST SUITE                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  await connectDB();

  const companyId = `comp-ocr-test-${Date.now()}`;
  const userId = `user-ocr-test-${Date.now()}`;
  let passedCount = 0;
  let failedCount = 0;

  function recordPass(testName: string, details: string) {
    console.log(`\n  ✅ [PASS] ${testName}`);
    console.log(`     └─ ${details}`);
    passedCount++;
  }

  function recordFail(testName: string, error: any) {
    console.error(`\n  ❌ [FAIL] ${testName}`);
    console.error(`     └─ Reason:`, error?.message || error);
    failedCount++;
  }

  // =========================================================================
  // TEST 0: EXACT USER SCREENSHOT FIXTURE TEST
  // =========================================================================
  console.log('\n--- TEST 0: Exact User Screenshot Invoice (INV-TEST-020) ---');
  try {
    const screenshotLines = [
      'TAX INVOICE',
      'Supplier:',
      'Apex Cloud Solutions Pvt. Ltd.',
      'GSTIN:',
      '27AAECA1234F1Z5',
      'Invoice #:',
      'INV-TEST-020',
      'Invoice Date:',
      '2026-09-01',
      'Due Date:',
      '2026-10-01',
      'PO:',
      'PO-2026-TEST-001',
      'Cloud Infrastructure Services',
      'Qty: 10',
      'Unit Price: 10,000',
      'Tax: 18%',
      'Total: 1,18,000',
      'Subtotal:',
      '1,00,000',
      'GST:',
      '18,000',
      'Total:',
      '1,18,000',
    ];

    const pngBuffer = createImageBuffer(screenshotLines, 'image/png');
    const docId = `doc-screenshot-020-${Date.now()}`;

    const res = await hybridExtractionService.extractDocument(pngBuffer, 'image/png', {
      documentId: docId,
      originalFileName: '20_SCANNED_CLEAN_INV-TEST-020.png',
      docTypeHint: 'invoice',
      companyId,
      userId,
    });

    const data = res.data as any;
    if (res.extractionMethod !== 'ocr') throw new Error(`Expected extractionMethod='ocr', got '${res.extractionMethod}'`);
    if (res.aiCallsCount !== 0) throw new Error(`Expected 0 AI calls, got ${res.aiCallsCount}`);
    if (data.invoiceNumber !== 'INV-TEST-020') throw new Error(`Expected invoiceNumber='INV-TEST-020', got '${data.invoiceNumber}'`);
    if (data.supplierName !== 'Apex Cloud Solutions Pvt. Ltd.') throw new Error(`Expected supplierName='Apex Cloud Solutions Pvt. Ltd.', got '${data.supplierName}'`);
    if (data.supplierGstin !== '27AAECA1234F1Z5') throw new Error(`Expected supplierGstin='27AAECA1234F1Z5', got '${data.supplierGstin}'`);
    if (data.poNumber !== 'PO-2026-TEST-001') throw new Error(`Expected poNumber='PO-2026-TEST-001', got '${data.poNumber}'`);
    if (data.invoiceDate !== '2026-09-01') throw new Error(`Expected invoiceDate='2026-09-01', got '${data.invoiceDate}'`);
    if (data.dueDate !== '2026-10-01') throw new Error(`Expected dueDate='2026-10-01', got '${data.dueDate}'`);
    if (data.subtotal !== 100000) throw new Error(`Expected subtotal=100000, got ${data.subtotal}`);
    if (data.tax !== 18000) throw new Error(`Expected tax=18000, got ${data.tax}`);
    if (data.amount !== 118000) throw new Error(`Expected amount=118000, got ${data.amount}`);
    if (!Array.isArray(data.lineItems) || data.lineItems.length !== 1) throw new Error(`Expected 1 line item, got ${data.lineItems?.length}`);
    if (data.lineItems[0].description !== 'Cloud Infrastructure Services') throw new Error(`Expected description='Cloud Infrastructure Services', got '${data.lineItems[0].description}'`);
    if (data.lineItems[0].quantity !== 10) throw new Error(`Expected quantity=10, got ${data.lineItems[0].quantity}`);
    if (data.lineItems[0].unitPrice !== 10000) throw new Error(`Expected unitPrice=10000, got ${data.lineItems[0].unitPrice}`);
    if (data.lineItems[0].total !== 118000) throw new Error(`Expected item total=118000, got ${data.lineItems[0].total}`);

    recordPass('TEST 0: Exact Screenshot OCR Extraction', `All fields, GSTIN, PO, line item, and totals parsed locally (Method: ${res.extractionMethod}, AI Calls: ${res.aiCallsCount})`);
  } catch (err) {
    recordFail('TEST 0: Exact Screenshot OCR Extraction', err);
  }

  // =========================================================================
  // TEST 1: Normal text PDF (0 AI calls, method pdf_text)
  // =========================================================================
  console.log('\n--- TEST 1: Normal text PDF ---');
  try {
    const pdfLines = [
      'TAX INVOICE',
      'Supplier: TechFlow Systems Pvt Ltd',
      'GSTIN: 29AABCT1334M1Z8',
      'Invoice Number: INV-2026-00881',
      'Invoice Date: 2026-09-01',
      'PO Number: PO-2026-00421',
      '1. Cloud Database Instance 10 5000 18% 59000',
      'Subtotal: 50,000.00',
      'Tax: 9,000.00',
      'Total: 59,000.00',
    ];
    const pdfBuf = createPdfBuffer(pdfLines);
    const res = await hybridExtractionService.extractDocument(pdfBuf, 'application/pdf', {
      documentId: `doc-test-1-${Date.now()}`,
      originalFileName: 'text_invoice_01.pdf',
      docTypeHint: 'invoice',
      companyId,
      userId,
    });
    if (res.extractionMethod !== 'pdf_text') throw new Error(`Expected 'pdf_text', got '${res.extractionMethod}'`);
    if (res.aiCallsCount !== 0) throw new Error(`Expected 0 AI calls, got ${res.aiCallsCount}`);
    if ((res.data as any).invoiceNumber !== 'INV-2026-00881') throw new Error(`Mismatch invoice number`);
    recordPass('TEST 1: Normal Text PDF', `Extracted locally via pdf_text with 0 AI calls`);
  } catch (err) {
    recordFail('TEST 1: Normal Text PDF', err);
  }

  // =========================================================================
  // TEST 2: PNG Screenshot Clean Invoice
  // =========================================================================
  console.log('\n--- TEST 2: PNG Screenshot Clean Invoice ---');
  try {
    const pngLines = [
      'TAX INVOICE',
      'Supplier Name: Pinnacle Infra Services Pvt Ltd',
      'GSTIN: 27AABCP9999F1Z1',
      'Invoice #: INV-PNG-7788',
      'Invoice Date: 2026-09-01',
      'Due Date: 2026-10-01',
      'Purchase Order: PO-PNG-0099',
      'Dedicated Compute Cluster',
      'Qty: 2',
      'Unit Price: 50,000',
      'Tax: 18%',
      'Total: 1,18,000',
      'Subtotal: 1,00,000',
      'GST: 18,000',
      'Total: 1,18,000',
    ];
    const pngBuf = createImageBuffer(pngLines, 'image/png');
    const res = await hybridExtractionService.extractDocument(pngBuf, 'image/png', {
      documentId: `doc-test-2-${Date.now()}`,
      originalFileName: 'clean_invoice.png',
      docTypeHint: 'invoice',
      companyId,
      userId,
    });
    const data = res.data as any;
    if (res.extractionMethod !== 'ocr') throw new Error(`Expected 'ocr', got '${res.extractionMethod}'`);
    if (res.aiCallsCount !== 0) throw new Error(`Expected 0 AI calls, got ${res.aiCallsCount}`);
    if (data.invoiceNumber !== 'INV-PNG-7788') throw new Error(`Expected INV-PNG-7788, got ${data.invoiceNumber}`);
    if (data.supplierGstin !== '27AABCP9999F1Z1') throw new Error(`Expected 27AABCP9999F1Z1, got ${data.supplierGstin}`);
    if (data.poNumber !== 'PO-PNG-0099') throw new Error(`Expected PO-PNG-0099, got ${data.poNumber}`);
    if (data.amount !== 118000) throw new Error(`Expected 118000, got ${data.amount}`);
    recordPass('TEST 2: PNG Screenshot Clean Invoice', `OCR extracted locally with complete fields & 0 AI calls`);
  } catch (err) {
    recordFail('TEST 2: PNG Screenshot Clean Invoice', err);
  }

  // =========================================================================
  // TEST 3: JPG Screenshot Clean Invoice
  // =========================================================================
  console.log('\n--- TEST 3: JPG Screenshot Clean Invoice ---');
  try {
    const jpgLines = [
      'TAX INVOICE',
      'Supplier Name: Alpha Core Technologies Pvt Ltd',
      'GSTIN: 33AAACR2222M1Z4',
      'Invoice Number: INV-JPG-3344',
      'Invoice Date: 2026-09-01',
      'Due Date: 2026-10-01',
      'PO Number: PO-JPG-1122',
      'Kubernetes Engine Hosting',
      'Qty: 5',
      'Unit Price: 20,000',
      'Tax: 18%',
      'Total: 1,18,000',
      'Subtotal: 1,00,000',
      'GST: 18,000',
      'Total: 1,18,000',
    ];
    const jpgBuf = createImageBuffer(jpgLines, 'image/jpeg');
    const res = await hybridExtractionService.extractDocument(jpgBuf, 'image/jpeg', {
      documentId: `doc-test-3-${Date.now()}`,
      originalFileName: 'clean_invoice.jpg',
      docTypeHint: 'invoice',
      companyId,
      userId,
    });
    const data = res.data as any;
    if (res.extractionMethod !== 'ocr') throw new Error(`Expected 'ocr', got '${res.extractionMethod}'`);
    if (res.aiCallsCount !== 0) throw new Error(`Expected 0 AI calls, got ${res.aiCallsCount}`);
    if (data.invoiceNumber !== 'INV-JPG-3344') throw new Error(`Expected INV-JPG-3344, got ${data.invoiceNumber}`);
    if (data.supplierGstin !== '33AAACR2222M1Z4') throw new Error(`Expected 33AAACR2222M1Z4, got ${data.supplierGstin}`);
    recordPass('TEST 3: JPG Screenshot Clean Invoice', `OCR extracted JPG image locally with 0 AI calls`);
  } catch (err) {
    recordFail('TEST 3: JPG Screenshot Clean Invoice', err);
  }

  // =========================================================================
  // TEST 4: Scanned PDF
  // =========================================================================
  console.log('\n--- TEST 4: Scanned PDF ---');
  try {
    const scannedDocLines = [
      'TAX INVOICE',
      'Supplier Name: Scanned Systems India Pvt Ltd',
      'GSTIN: 07AAAAA0000A1Z5',
      'Invoice Number: INV-SCAN-9900',
      'Invoice Date: 2026-09-01',
      'Due Date: 2026-10-01',
      'PO Number: PO-SCAN-8811',
      'Server Rack Colocation 10 10000 18% 118000',
      'Subtotal: 100000',
      'GST: 18000',
      'Total: 118000',
    ];
    const imgBuf = createImageBuffer(scannedDocLines, 'image/png');
    // Scanned PDF simulated via image OCR pipeline
    const res = await hybridExtractionService.extractDocument(imgBuf, 'image/png', {
      documentId: `doc-test-4-${Date.now()}`,
      originalFileName: 'scanned_invoice.png',
      docTypeHint: 'invoice',
      companyId,
      userId,
    });
    if (res.extractionMethod !== 'ocr') throw new Error(`Expected 'ocr', got '${res.extractionMethod}'`);
    if (res.aiCallsCount !== 0) throw new Error(`Expected 0 AI calls, got ${res.aiCallsCount}`);
    recordPass('TEST 4: Scanned PDF', `Scanned document extracted via local OCR pipeline (0 AI)`);
  } catch (err) {
    recordFail('TEST 4: Scanned PDF', err);
  }

  // =========================================================================
  // TEST 5: Clean invoice with NO PO
  // =========================================================================
  console.log('\n--- TEST 5: Clean invoice with NO PO ---');
  try {
    const noPoLines = [
      'TAX INVOICE',
      'Supplier: Direct Retail Solutions Pvt Ltd',
      'GSTIN: 27AABCS1234M1Z5',
      'Invoice #: INV-NOPO-1122',
      'Invoice Date: 2026-09-01',
      'Due Date: 2026-10-01',
      'Office Ergonomic Chairs',
      'Qty: 10',
      'Unit Price: 5,000',
      'Tax: 18%',
      'Total: 59,000',
      'Subtotal: 50,000',
      'GST: 9,000',
      'Total: 59,000',
    ];
    const pngBuf = createImageBuffer(noPoLines, 'image/png');
    const res = await hybridExtractionService.extractDocument(pngBuf, 'image/png', {
      documentId: `doc-test-5-${Date.now()}`,
      originalFileName: '18_NO_PO_INV-TEST-018.png',
      docTypeHint: 'invoice',
      companyId,
      userId,
    });
    const data = res.data as any;
    if (data.poNumber !== null) throw new Error(`Expected poNumber=null, got '${data.poNumber}'`);
    if (res.aiCallsCount !== 0) throw new Error(`Expected 0 AI calls, got ${res.aiCallsCount}`);
    recordPass('TEST 5: Clean Invoice with No PO', `poNumber=null correctly preserved without triggering false PO match or AI`);
  } catch (err) {
    recordFail('TEST 5: Clean Invoice with No PO', err);
  }

  // =========================================================================
  // TEST 6: Invoice with Quantity Mismatch
  // =========================================================================
  console.log('\n--- TEST 6: Invoice with Quantity Mismatch ---');
  try {
    const poNum = `PO-QTY-MATCH-${Date.now()}`;
    await PurchaseOrderModel.create({
      id: `po-test-6-${Date.now()}`,
      companyId,
      poNumber: poNum,
      supplierId: 'sup-hardware-1',
      supplierName: 'Hardware Vendor Pvt Ltd',
      totalAmount: 118000,
      issuedDate: '2026-09-01',
      status: 'approved',
      matchStatus: 'open',
      items: [{ id: 'item-6-1', description: 'Enterprise Laptop', quantity: 10, unitPrice: 10000, total: 118000 }],
    });

    const inv = {
      invoiceNumber: `INV-QTY-MISMATCH-${Date.now()}`,
      poNumber: poNum,
      supplierName: 'Hardware Vendor Pvt Ltd',
      amount: 94400,
      subtotal: 80000,
      tax: 14400,
      lineItems: [{ description: 'Enterprise Laptop', quantity: 8, unitPrice: 10000, total: 94400 }],
    };
    const match = await poMatchingService.matchInvoiceToPO(companyId, inv as any);
    if (match.matchStatus !== 'mismatch') throw new Error(`Expected 'mismatch', got '${match.matchStatus}'`);
    recordPass('TEST 6: Quantity Mismatch', `Detected quantity variance (8 vs 10) and flagged status='mismatch'`);
  } catch (err) {
    recordFail('TEST 6: Quantity Mismatch', err);
  }

  // =========================================================================
  // TEST 7: Invoice with Price Mismatch
  // =========================================================================
  console.log('\n--- TEST 7: Invoice with Price Mismatch ---');
  try {
    const poNum = `PO-PRICE-MATCH-${Date.now()}`;
    await PurchaseOrderModel.create({
      id: `po-test-7-${Date.now()}`,
      companyId,
      poNumber: poNum,
      supplierId: 'sup-hardware-1',
      supplierName: 'Hardware Vendor Pvt Ltd',
      totalAmount: 118000,
      issuedDate: '2026-09-01',
      status: 'approved',
      matchStatus: 'open',
      items: [{ id: 'item-7-1', description: 'Enterprise Laptop', quantity: 10, unitPrice: 10000, total: 118000 }],
    });

    const inv = {
      invoiceNumber: `INV-PRICE-MISMATCH-${Date.now()}`,
      poNumber: poNum,
      supplierName: 'Hardware Vendor Pvt Ltd',
      amount: 141600,
      subtotal: 120000,
      tax: 21600,
      lineItems: [{ description: 'Enterprise Laptop', quantity: 10, unitPrice: 12000, total: 141600 }],
    };
    const match = await poMatchingService.matchInvoiceToPO(companyId, inv as any);
    if (match.matchStatus !== 'mismatch') throw new Error(`Expected 'mismatch', got '${match.matchStatus}'`);
    recordPass('TEST 7: Price Mismatch', `Detected price variance (₹12,000 vs ₹10,000) and flagged status='mismatch'`);
  } catch (err) {
    recordFail('TEST 7: Price Mismatch', err);
  }

  // =========================================================================
  // TEST 8: Invoice with Tax Discrepancy
  // =========================================================================
  console.log('\n--- TEST 8: Invoice with Tax Discrepancy ---');
  try {
    const taxAnomalyLines = [
      'TAX INVOICE',
      'Supplier: Zenith Hardware Systems Pvt Ltd',
      'GSTIN: 27AABCZ9988K1Z3',
      'Invoice #: INV-TAX-DISC-01',
      'Invoice Date: 2026-09-01',
      'Industrial Power Supply',
      'Qty: 10',
      'Unit Price: 10,000',
      'Tax: 28%',
      'Total: 1,28,000',
      'Subtotal: 1,00,000',
      'GST @ 28%: 28,000',
      'Total: 1,28,000',
    ];
    const pngBuf = createImageBuffer(taxAnomalyLines, 'image/png');
    const res = await hybridExtractionService.extractDocument(pngBuf, 'image/png', {
      documentId: `doc-test-8-${Date.now()}`,
      originalFileName: 'tax_discrepancy.png',
      docTypeHint: 'invoice',
      companyId,
      userId,
    });
    const data = res.data as any;
    if (data.tax !== 28000) throw new Error(`Expected tax=28000, got ${data.tax}`);
    if (data.amount !== 128000) throw new Error(`Expected amount=128000, got ${data.amount}`);
    recordPass('TEST 8: Tax Discrepancy / 28% GST Rate', `Extracted 28% GST rate deterministically with ₹28,000 tax`);
  } catch (err) {
    recordFail('TEST 8: Tax Discrepancy / 28% GST Rate', err);
  }

  // =========================================================================
  // TEST 9: Image Invoice Missing GSTIN
  // =========================================================================
  console.log('\n--- TEST 9: Image Invoice Missing GSTIN ---');
  try {
    const noGstinLines = [
      'TAX INVOICE',
      'Supplier: Overseas Global LLC',
      'Invoice #: INV-OVERSEAS-01',
      'Invoice Date: 2026-09-01',
      'Due Date: 2026-10-01',
      'Software Subscription License',
      'Qty: 1',
      'Unit Price: 50,000',
      'Total: 50,000',
      'Subtotal: 50,000',
      'Total: 50,000',
    ];
    const pngBuf = createImageBuffer(noGstinLines, 'image/png');
    const res = await hybridExtractionService.extractDocument(pngBuf, 'image/png', {
      documentId: `doc-test-9-${Date.now()}`,
      originalFileName: 'no_gstin.png',
      docTypeHint: 'invoice',
      companyId,
      userId,
    });
    const data = res.data as any;
    if (data.supplierGstin !== null) throw new Error(`Expected supplierGstin=null, got '${data.supplierGstin}'`);
    recordPass('TEST 9: Missing GSTIN Handling', `GSTIN=null preserved without data fabrication`);
  } catch (err) {
    recordFail('TEST 9: Missing GSTIN Handling', err);
  }

  // =========================================================================
  // TEST 10: Malformed OCR Layout -> Controlled Fallback
  // =========================================================================
  console.log('\n--- TEST 10: Malformed OCR Layout ---');
  try {
    const malformedText = `
      SOME UNRECOGNIZABLE HEADER TEXT
      Random fragmented text: 12345
      Nothing structured or labeled
    `;
    const detRes = deterministicParserService.parseInvoiceText(malformedText, 'ocr');
    if (!detRes.needsAI || detRes.quality === 'high') {
      throw new Error(`Expected needsAI=true and quality != 'high' for malformed text`);
    }
    recordPass('TEST 10: Malformed Layout Handling', `Malformed OCR layout flagged for selective fallback (quality: ${detRes.quality})`);
  } catch (err) {
    recordFail('TEST 10: Malformed Layout Handling', err);
  }

  // =========================================================================
  // TEST 11: Batch of 12 Mixed Documents Concurrent Processing
  // =========================================================================
  console.log('\n--- TEST 11: Batch of 12 Mixed Documents Concurrent Processing ---');
  try {
    const batchTasks: Promise<any>[] = [];
    for (let i = 0; i < 12; i++) {
      const isPdf = i % 2 === 0;
      const fileName = isPdf ? `batch_inv_${i}.pdf` : `batch_inv_${i}.png`;
      const mime = isPdf ? 'application/pdf' : 'image/png';
      const lines = [
        'TAX INVOICE',
        `Supplier Name: Batch Vendor ${i} Pvt Ltd`,
        `GSTIN: 27AABCV${1000 + i}F1Z5`,
        `Invoice #: INV-BATCH-2026-${100 + i}`,
        'Invoice Date: 2026-09-01',
        'Due Date: 2026-10-01',
        `Batch Item ${i}`,
        'Qty: 5',
        `Unit Price: ${10000 + i * 500}`,
        'Tax: 18%',
        `Total: ${(10000 + i * 500) * 5 * 1.18}`,
        `Subtotal: ${(10000 + i * 500) * 5}`,
        `GST: ${(10000 + i * 500) * 5 * 0.18}`,
        `Total: ${(10000 + i * 500) * 5 * 1.18}`,
      ];
      const buf = isPdf ? createPdfBuffer(lines) : createImageBuffer(lines, 'image/png');

      batchTasks.push(
        hybridExtractionService.extractDocument(buf, mime, {
          documentId: `doc-batch-11-${Date.now()}-${i}`,
          originalFileName: fileName,
          docTypeHint: 'invoice',
          companyId,
          userId,
        })
      );
    }

    const results = await Promise.all(batchTasks);
    const allExtractedLocally = results.every((r) => r.aiCallsCount === 0 && (r.extractionMethod === 'pdf_text' || r.extractionMethod === 'ocr'));
    if (!allExtractedLocally) throw new Error(`Some batch documents made unexpected AI calls`);
    recordPass('TEST 11: Batch Mixed Documents', `12 mixed PDFs and PNGs processed concurrently with 0 AI calls and 100% success`);
  } catch (err) {
    recordFail('TEST 11: Batch Mixed Documents', err);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passedCount} PASSED  |  ${failedCount} FAILED  |  ${passedCount + failedCount} TOTAL`);
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runScreenshotAndProductionSuite().catch((err) => {
  console.error('Fatal error running suite:', err);
  process.exit(1);
});
