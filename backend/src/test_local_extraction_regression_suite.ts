import { connectDB } from './config/db.js';
import { documentStorageService } from './services/storage/documentStorageService.js';
import { documentProcessingService } from './services/documentProcessingService.js';
import { DocumentModel } from './models/Document.js';
import { hybridExtractionService } from './services/extraction/hybridExtractionService.js';
import { deterministicParserService } from './services/extraction/deterministicParserService.js';
import { documentTextExtractionService } from './services/documentTextExtractionService.js';
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

const cleanInvoices = [
  {
    name: '01_CLEAN_INV-TEST-001.pdf',
    lines: [
      'TAX INVOICE',
      'Apex Cloud Solutions Pvt. Ltd.',
      'GSTIN: 29AAFCA8912J1ZQ',
      '',
      'Invoice Number',
      'INV-TEST-001',
      '',
      'Invoice Date',
      '2026-09-01',
      '',
      'Due Date',
      '2026-10-01',
      '',
      'Purchase Order',
      'PO-2026-TEST-001',
      '',
      'Subtotal',
      'Rs. 100,000.00',
      '',
      'GST @ 18%',
      'Rs. 18,000.00',
      '',
      'Total Amount',
      'Rs. 118,000.00',
    ],
    expected: {
      invoiceNumber: 'INV-TEST-001',
      supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
      poNumber: 'PO-2026-TEST-001',
      subtotal: 100000,
      tax: 18000,
      total: 118000,
    },
  },
  {
    name: '02_CLEAN_INV-TEST-002.pdf',
    lines: [
      'TAX INVOICE',
      'Apex Cloud Solutions Pvt. Ltd.',
      'GSTIN: 29AAFCA8912J1ZQ',
      '',
      'Invoice Number',
      'INV-TEST-002',
      '',
      'Invoice Date',
      '2026-09-02',
      '',
      'Due Date',
      '2026-10-02',
      '',
      'Purchase Order',
      'PO-2026-TEST-002',
      '',
      'Subtotal',
      'Rs. 250,000.00',
      '',
      'GST @ 18%',
      'Rs. 45,000.00',
      '',
      'Total Amount',
      'Rs. 295,000.00',
    ],
    expected: {
      invoiceNumber: 'INV-TEST-002',
      supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
      poNumber: 'PO-2026-TEST-002',
      subtotal: 250000,
      tax: 45000,
      total: 295000,
    },
  },
  {
    name: '03_CLEAN_INV-TEST-003.pdf',
    lines: [
      'TAX INVOICE',
      'TechNova Global Systems Pvt Ltd',
      'GSTIN: 27AABCT3518Q1ZS',
      '',
      'Invoice Number',
      'INV-TEST-003',
      '',
      'Invoice Date',
      '2026-09-03',
      '',
      'Due Date',
      '2026-10-03',
      '',
      'Purchase Order',
      'PO-2026-TEST-003',
      '',
      'Subtotal',
      'Rs. 50,000.00',
      '',
      'GST @ 18%',
      'Rs. 9,000.00',
      '',
      'Total Amount',
      'Rs. 59,000.00',
    ],
    expected: {
      invoiceNumber: 'INV-TEST-003',
      supplierName: 'TechNova Global Systems Pvt Ltd',
      poNumber: 'PO-2026-TEST-003',
      subtotal: 50000,
      tax: 9000,
      total: 59000,
    },
  },
  {
    name: '04_CLEAN_INV-TEST-004.pdf',
    lines: [
      'TAX INVOICE',
      'DataCore Industrial Supplies Pvt Ltd',
      'GSTIN: 29AAFCA8912J1ZQ',
      '',
      'Invoice Number',
      'INV-TEST-004',
      '',
      'Invoice Date',
      '2026-09-04',
      '',
      'Due Date',
      '2026-10-04',
      '',
      'Purchase Order',
      'PO-2026-TEST-004',
      '',
      'Subtotal',
      'Rs. 75,000.00',
      '',
      'GST @ 18%',
      'Rs. 13,500.00',
      '',
      'Total Amount',
      'Rs. 88,500.00',
    ],
    expected: {
      invoiceNumber: 'INV-TEST-004',
      supplierName: 'DataCore Industrial Supplies Pvt Ltd',
      poNumber: 'PO-2026-TEST-004',
      subtotal: 75000,
      tax: 13500,
      total: 88500,
    },
  },
  {
    name: '05_CLEAN_INV-TEST-005.pdf',
    lines: [
      'TAX INVOICE',
      'Vanguard Cloud Distribution Ltd',
      'GSTIN: 29AABCV9981K1Z2',
      '',
      'Invoice Number',
      'INV-TEST-005',
      '',
      'Invoice Date',
      '2026-09-05',
      '',
      'Due Date',
      '2026-10-05',
      '',
      'Purchase Order',
      'PO-2026-TEST-005',
      '',
      'Subtotal',
      'Rs. 300,000.00',
      '',
      'GST @ 18%',
      'Rs. 54,000.00',
      '',
      'Total Amount',
      'Rs. 354,000.00',
    ],
    expected: {
      invoiceNumber: 'INV-TEST-005',
      supplierName: 'Vanguard Cloud Distribution Ltd',
      poNumber: 'PO-2026-TEST-005',
      subtotal: 300000,
      tax: 54000,
      total: 354000,
    },
  },
];

async function runLocalExtractionRegressionSuite() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  InvoiceFlow AI — Local Extraction & Zero AI Regression Suite (Tests 1-8) ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  await connectDB();
  const testCompanyId = `comp-local-reg-${Date.now()}`;
  const testUserId = `user-tester-local`;

  let totalPassed = 0;
  let totalFailed = 0;

  function pass(desc: string, detail?: string) {
    console.log(`  ✅ PASS: ${desc}${detail ? ` (${detail})` : ''}`);
    totalPassed++;
  }

  function fail(desc: string, err?: any) {
    console.log(`  ❌ FAIL: ${desc} — ${err?.message || err}`);
    totalFailed++;
  }

  // -------------------------------------------------------------
  // TESTS 1-5: Individual Clean Invoices
  // -------------------------------------------------------------
  for (let idx = 0; idx < cleanInvoices.length; idx++) {
    const fixture = cleanInvoices[idx];
    const testNum = idx + 1;
    console.log(`\n[TEST ${testNum}] Processing ${fixture.name} (Zero AI Requirement)...`);

    try {
      const buffer = createPdfBuffer(fixture.lines);

      // Verify text extraction
      const textRes = await documentTextExtractionService.extractText(buffer);
      if (textRes.isScanned) {
        fail(`Test ${testNum}.1 isScanned flag should be false`, 'isScanned was true');
      } else {
        pass(`Test ${testNum}.1 isScanned is false`, `chars=${textRes.characterCount}`);
      }

      // Verify deterministic parsing
      const parsed = deterministicParserService.parseInvoiceText(textRes.text, 'pdf_text');
      if (parsed.data.invoiceNumber === fixture.expected.invoiceNumber) {
        pass(`Test ${testNum}.2 invoiceNumber extracted`, `inv#=${parsed.data.invoiceNumber}`);
      } else {
        fail(`Test ${testNum}.2 invoiceNumber mismatch`, `expected ${fixture.expected.invoiceNumber}, got ${parsed.data.invoiceNumber}`);
      }

      if (parsed.data.supplierName === fixture.expected.supplierName) {
        pass(`Test ${testNum}.3 supplierName extracted`, `supplier=${parsed.data.supplierName}`);
      } else {
        fail(`Test ${testNum}.3 supplierName mismatch`, `expected ${fixture.expected.supplierName}, got ${parsed.data.supplierName}`);
      }

      if (parsed.data.poNumber === fixture.expected.poNumber) {
        pass(`Test ${testNum}.4 poNumber extracted`, `po#=${parsed.data.poNumber}`);
      } else {
        fail(`Test ${testNum}.4 poNumber mismatch`, `expected ${fixture.expected.poNumber}, got ${parsed.data.poNumber}`);
      }

      if (parsed.data.subtotal === fixture.expected.subtotal) {
        pass(`Test ${testNum}.5 subtotal extracted`, `subtotal=₹${parsed.data.subtotal}`);
      } else {
        fail(`Test ${testNum}.5 subtotal mismatch`, `expected ${fixture.expected.subtotal}, got ${parsed.data.subtotal}`);
      }

      if (parsed.data.tax === fixture.expected.tax) {
        pass(`Test ${testNum}.6 tax extracted`, `tax=₹${parsed.data.tax}`);
      } else {
        fail(`Test ${testNum}.6 tax mismatch`, `expected ${fixture.expected.tax}, got ${parsed.data.tax}`);
      }

      if (parsed.data.amount === fixture.expected.total) {
        pass(`Test ${testNum}.7 total extracted`, `total=₹${parsed.data.amount}`);
      } else {
        fail(`Test ${testNum}.7 total mismatch`, `expected ${fixture.expected.total}, got ${parsed.data.amount}`);
      }

      // End-to-end storage and processing
      const storage = await documentStorageService.saveFile(testCompanyId, buffer, fixture.name);
      const doc = await DocumentModel.create({
        id: `doc-reg-${testNum}-${Date.now()}`,
        companyId: testCompanyId,
        uploadedBy: testUserId,
        originalFileName: fixture.name,
        fileName: storage.fileName,
        mimeType: 'application/pdf',
        fileSize: buffer.length,
        fileHash: documentProcessingService.calculateFileHash(buffer),
        documentType: 'invoice',
        storagePath: storage.storagePath,
        storageReference: storage.storageReference,
        processingStatus: 'queued',
        extractionStatus: 'pending',
      });

      const processed = await documentProcessingService.processDocument(doc.id, testCompanyId, testUserId);

      if (processed.extractionStatus === 'extracted') {
        pass(`Test ${testNum}.8 extractionStatus is "extracted"`);
      } else {
        fail(`Test ${testNum}.8 extractionStatus should be "extracted"`, `got ${processed.extractionStatus}`);
      }

      if ((processed as any).extractionMethod === 'pdf_text') {
        pass(`Test ${testNum}.9 extractionMethod is "pdf_text" (LOCAL)`);
      } else {
        fail(`Test ${testNum}.9 extractionMethod should be "pdf_text"`, `got ${(processed as any).extractionMethod}`);
      }

      if (!(processed as any).aiAssisted) {
        pass(`Test ${testNum}.10 aiAssisted is false (0 AI calls)`);
      } else {
        fail(`Test ${testNum}.10 aiAssisted should be false`, `aiAssisted was true`);
      }
    } catch (err: any) {
      fail(`Test ${testNum} unexpected error`, err);
    }
  }

  // -------------------------------------------------------------
  // TEST 6: Scanned / Image Invoice (OCR Path)
  // -------------------------------------------------------------
  console.log('\n[TEST 6] Scanned/Image Invoice — OCR Path...');
  try {
    const ocrText = `TAX INVOICE
Acme Heavy Industries Pvt Ltd
GSTIN: 29AAFCA8912J1ZQ
Invoice No: INV-OCR-9901
Date: 2026-09-10
Due Date: 2026-10-10
Subtotal: 40000.00
Tax: 7200.00
Total: 47200.00`;

    const parsedOCR = deterministicParserService.parseInvoiceText(ocrText, 'ocr');
    if (parsedOCR.data.invoiceNumber === 'INV-OCR-9901' && parsedOCR.data.amount === 47200) {
      pass('Test 6.1 OCR-derived text parsed deterministically', `inv#=${parsedOCR.data.invoiceNumber}, total=₹${parsedOCR.data.amount}`);
    } else {
      fail('Test 6.1 OCR parsing failed', `got ${parsedOCR.data.invoiceNumber}`);
    }

    if (parsedOCR.extractionMethod === 'ocr') {
      pass('Test 6.2 extractionMethod correctly tagged as "ocr"');
    } else {
      fail('Test 6.2 extractionMethod should be "ocr"', `got ${parsedOCR.extractionMethod}`);
    }

    const qCheck = ExtractionQualityEvaluator.evaluateInvoiceQuality(ocrText, parsedOCR.data);
    if (qCheck.quality === 'high' && !qCheck.needsAiFallback) {
      pass('Test 6.3 OCR extraction quality evaluated as HIGH with zero AI fallback needed');
    } else {
      fail('Test 6.3 OCR quality evaluation failed', `quality=${qCheck.quality}`);
    }
  } catch (err: any) {
    fail('Test 6 unexpected error', err);
  }

  // -------------------------------------------------------------
  // TEST 7: Malformed / Ambiguous Invoice — Controlled AI Fallback
  // -------------------------------------------------------------
  console.log('\n[TEST 7] Malformed/Ambiguous Document — Controlled AI Fallback...');
  try {
    const garbageText = 'Some random unformatted receipt without header or amounts xyz 123';
    const badParsed = deterministicParserService.parseInvoiceText(garbageText, 'pdf_text');

    if (badParsed.needsAI || badParsed.quality === 'incomplete') {
      pass('Test 7.1 Malformed document correctly flagged as incomplete / needsAI', `quality=${badParsed.quality}`);
    } else {
      fail('Test 7.1 Malformed document was not flagged', `quality=${badParsed.quality}`);
    }

    const qBad = ExtractionQualityEvaluator.evaluateInvoiceQuality(garbageText, badParsed.data);
    if (qBad.needsAiFallback && qBad.missingCriticalFields.length > 0) {
      pass('Test 7.2 Quality evaluator correctly flags missing critical fields', `missing=[${qBad.missingCriticalFields.join(', ')}]`);
    } else {
      fail('Test 7.2 Quality evaluator failed to flag missing critical fields');
    }
  } catch (err: any) {
    fail('Test 7 unexpected error', err);
  }

  // -------------------------------------------------------------
  // TEST 8: Concurrent Batch Upload of All 5 Clean Invoices
  // -------------------------------------------------------------
  console.log('\n[TEST 8] Concurrent Batch Upload of All 5 Clean Invoices (0 AI Calls Guaranteed)...');
  try {
    const batchCompanyId = `comp-batch-clean-${Date.now()}`;
    const batchPromises = cleanInvoices.map(async (fixture, bIdx) => {
      const buffer = createPdfBuffer(fixture.lines);
      const storage = await documentStorageService.saveFile(batchCompanyId, buffer, fixture.name);
      const doc = await DocumentModel.create({
        id: `doc-batch-clean-${bIdx + 1}-${Date.now()}`,
        companyId: batchCompanyId,
        uploadedBy: testUserId,
        originalFileName: fixture.name,
        fileName: storage.fileName,
        mimeType: 'application/pdf',
        fileSize: buffer.length,
        fileHash: documentProcessingService.calculateFileHash(buffer),
        documentType: 'invoice',
        storagePath: storage.storagePath,
        storageReference: storage.storageReference,
        processingStatus: 'queued',
        extractionStatus: 'pending',
      });
      return documentProcessingService.processDocument(doc.id, batchCompanyId, testUserId);
    });

    const batchResults = await Promise.all(batchPromises);

    const allExtracted = batchResults.every((d) => d.extractionStatus === 'extracted');
    const allLocal = batchResults.every((d) => (d as any).extractionMethod === 'pdf_text');
    const allZeroAI = batchResults.every((d) => !(d as any).aiAssisted);

    if (allExtracted) {
      pass('Test 8.1 All 5 batch invoices extracted successfully');
    } else {
      fail('Test 8.1 Batch invoices extraction failed');
    }

    if (allLocal) {
      pass('Test 8.2 All 5 batch invoices used LOCAL pdf_text extraction (0 AI calls)');
    } else {
      fail('Test 8.2 Some batch invoices did not use local pdf_text');
    }

    if (allZeroAI) {
      pass('Test 8.3 Zero Gemini / Groq AI quota consumed across batch');
    } else {
      fail('Test 8.3 Some batch documents consumed AI quota');
    }
  } catch (err: any) {
    fail('Test 8 unexpected error', err);
  }

  // -------------------------------------------------------------
  // FINAL SCORECARD
  // -------------------------------------------------------------
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${totalPassed} PASSED  |  ${totalFailed} FAILED  |  ${totalPassed + totalFailed} TOTAL`);
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runLocalExtractionRegressionSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
