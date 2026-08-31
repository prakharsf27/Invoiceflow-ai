import { connectDB } from './config/db.js';
import { hybridExtractionService } from './services/extraction/hybridExtractionService.js';
import { deterministicParserService } from './services/extraction/deterministicParserService.js';
import { documentTextExtractionService } from './services/documentTextExtractionService.js';
import { documentStorageService } from './services/storage/documentStorageService.js';
import { documentProcessingService } from './services/documentProcessingService.js';
import { poMatchingService } from './services/poMatchingService.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { DocumentModel } from './models/Document.js';
import { InvoiceModel } from './models/Invoice.js';

/**
 * Creates a raw standard text-based PDF buffer with the exact content of INV-2026-00989.
 */
function create00989PdfBuffer(): Buffer {
  const lines = [
    'TAX INVOICE',
    'Invoice Number: INV-2026-00989',
    'Date: 2026-08-31',
    'Purchase Order: PO-2026-09999',
    'Supplier:',
    'DataCore Industrial Supplies Pvt Ltd',
    'GSTIN: 07AADCD7742P1ZQ',
    'Buyer:',
    'Apex Global Technologies Pvt Ltd',
    'GSTIN: 27AAECA1234A1Z5',
    'Line Items:',
    '1. Enterprise Network Switch 48-Port 4 42000.00 18% 30240.00 168000.00',
    '2. Cat6A Network Cable Box 10 7800.00 18% 14040.00 78000.00',
    '3. Rack Mount PDU 16A 4 6500.00 18% 4680.00 26000.00',
    'Subtotal: 272000.00',
    'GST: 48960.00',
    'Grand Total: 320960.00',
    'Payment Terms: Net 30 Days',
  ];

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

async function run00989TestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING FOCUSED REGRESSION TEST SUITE FOR INV-2026-00989');
  console.log('================================================================\n');

  await connectDB();

  const testCompanyId = `comp-test-00989-${Date.now()}`;
  const testUserId = `user-qa-${Date.now()}`;

  // Pre-seed an unrelated PO (PO-2026-00423) in this company to verify that PO-2026-09999 NEVER matches it
  await PurchaseOrderModel.create({
    id: `po-unrelated-${Date.now()}`,
    companyId: testCompanyId,
    poNumber: 'PO-2026-00423',
    supplierId: 'sup-datacore-001',
    supplierName: 'DataCore Industrial Supplies Pvt Ltd',
    totalAmount: 500000,
    issuedDate: '2026-08-15',
    status: 'open',
    matchStatus: 'open',
    items: [],
  });

  const pdfBuffer = create00989PdfBuffer();

  console.log('📌 [STEP 1] Testing Local PDF Text Extraction (0 AI Calls)...');
  const textExtractResult = await documentTextExtractionService.extractText(pdfBuffer);
  console.log(`   PDF Text Extracted: ${textExtractResult.characterCount} chars, isScanned: ${textExtractResult.isScanned}`);
  if (!textExtractResult.success || textExtractResult.isScanned) {
    throw new Error('FAILED Step 1: Text extraction failed or incorrectly marked scanned.');
  }

  console.log('\n📌 [STEP 2] Testing Deterministic Parser on Raw Text with Artifacts...');
  // Add unicode currency box artifacts to test line item parser robustness against malformed currency symbols
  const artifactText = textExtractResult.text
    .replace('42000.00', '■42,000.00')
    .replace('30240.00', '■30,240.00')
    .replace('168000.00', '■168,000.00')
    .replace('7800.00', '■7,800.00')
    .replace('14040.00', '■14,040.00')
    .replace('78000.00', '■78,000.00')
    .replace('6500.00', '■6,500.00')
    .replace('4680.00', '■4,680.00')
    .replace('26000.00', '■26,000.00');

  const detRes = deterministicParserService.parseInvoiceText(artifactText, 'pdf_text');
  console.log('   Deterministic Result Summary:', {
    confidence: detRes.confidence,
    needsAI: detRes.needsAI,
    invoiceNumber: detRes.data.invoiceNumber,
    supplierName: detRes.data.supplierName,
    poNumber: detRes.data.poNumber,
    dueDate: detRes.data.dueDate,
    paymentTerms: detRes.data.paymentTerms,
    bankDetails: detRes.data.bankDetails,
    lineItemsCount: detRes.data.lineItems.length,
  });

  // Verify all required assertions
  if (detRes.data.invoiceNumber !== 'INV-2026-00989') {
    throw new Error(`Assertion Failed: invoiceNumber expected "INV-2026-00989", got "${detRes.data.invoiceNumber}"`);
  }
  if (detRes.data.supplierName !== 'DataCore Industrial Supplies Pvt Ltd') {
    throw new Error(`Assertion Failed: supplierName expected "DataCore Industrial Supplies Pvt Ltd", got "${detRes.data.supplierName}"`);
  }
  if (detRes.data.supplierGstin !== '07AADCD7742P1ZQ') {
    throw new Error(`Assertion Failed: supplierGstin expected "07AADCD7742P1ZQ", got "${detRes.data.supplierGstin}"`);
  }
  if (detRes.data.invoiceDate !== '2026-08-31') {
    throw new Error(`Assertion Failed: invoiceDate expected "2026-08-31", got "${detRes.data.invoiceDate}"`);
  }
  if (detRes.data.poNumber !== 'PO-2026-09999') {
    throw new Error(`Assertion Failed: poNumber expected "PO-2026-09999", got "${detRes.data.poNumber}"`);
  }
  if (detRes.data.paymentTerms !== 'Net 30 Days') {
    throw new Error(`Assertion Failed: paymentTerms expected "Net 30 Days", got "${detRes.data.paymentTerms}"`);
  }
  if (detRes.data.dueDate !== null) {
    throw new Error(`Assertion Failed: dueDate must be null when absent, got "${detRes.data.dueDate}"`);
  }
  if (detRes.data.subtotal !== 272000) {
    throw new Error(`Assertion Failed: subtotal expected 272000, got ${detRes.data.subtotal}`);
  }
  if (detRes.data.tax !== 48960) {
    throw new Error(`Assertion Failed: tax expected 48960, got ${detRes.data.tax}`);
  }
  if (detRes.data.amount !== 320960) {
    throw new Error(`Assertion Failed: amount expected 320960, got ${detRes.data.amount}`);
  }
  if (detRes.data.bankDetails?.accountNumber !== null) {
    throw new Error(`Assertion Failed: bankDetails.accountNumber must be null, got "${detRes.data.bankDetails?.accountNumber}"`);
  }
  if (detRes.data.bankDetails?.ifsc !== null) {
    throw new Error(`Assertion Failed: bankDetails.ifsc must be null, got "${detRes.data.bankDetails?.ifsc}"`);
  }
  if (detRes.data.bankDetails?.bankName !== null) {
    throw new Error(`Assertion Failed: bankDetails.bankName must be null, got "${detRes.data.bankDetails?.bankName}"`);
  }

  // Line items assertions
  if (detRes.data.lineItems.length !== 3) {
    throw new Error(`Assertion Failed: lineItems length expected 3, got ${detRes.data.lineItems.length}`);
  }

  const [item1, item2, item3] = detRes.data.lineItems;
  console.log('   Line Item 1:', item1);
  console.log('   Line Item 2:', item2);
  console.log('   Line Item 3:', item3);

  if (item1.quantity !== 4 || item1.unitPrice !== 42000 || item1.taxRate !== 18 || item1.taxAmount !== 30240 || item1.total !== 168000) {
    throw new Error(`Assertion Failed on Line Item 1: ${JSON.stringify(item1)}`);
  }
  if (item2.quantity !== 10 || item2.unitPrice !== 7800 || item2.taxRate !== 18 || item2.taxAmount !== 14040 || item2.total !== 78000) {
    throw new Error(`Assertion Failed on Line Item 2: ${JSON.stringify(item2)}`);
  }
  if (item3.quantity !== 4 || item3.unitPrice !== 6500 || item3.taxRate !== 18 || item3.taxAmount !== 4680 || item3.total !== 26000) {
    throw new Error(`Assertion Failed on Line Item 3: ${JSON.stringify(item3)}`);
  }
  console.log('   ✅ Passed Step 2: Deterministic line items and fields verified 100%.');

  console.log('\n📌 [STEP 3] Testing Full Hybrid Extraction Pipeline (0 AI Calls)...');
  const hybridRes = await hybridExtractionService.extractDocument(
    pdfBuffer,
    'application/pdf',
    {
      documentId: 'doc-test-00989',
      originalFileName: 'INV-2026-00989_WRONG_PO.pdf',
      companyId: testCompanyId,
      userId: testUserId,
    }
  );

  console.log('   Hybrid Result:', {
    extractionMethod: hybridRes.extractionMethod,
    aiAssisted: hybridRes.aiAssisted,
    confidence: hybridRes.confidence,
    documentType: hybridRes.documentType,
  });

  if (hybridRes.extractionMethod !== 'pdf_text' || hybridRes.aiAssisted !== false) {
    throw new Error('FAILED Step 3: Hybrid extraction invoked AI instead of local extraction.');
  }
  console.log('   ✅ Passed Step 3: Hybrid extraction processed locally with 0 AI calls.');

  console.log('\n📌 [STEP 4] Testing End-to-End Document Storage & Processing Pipeline...');
  const storageRes = await documentStorageService.saveFile(testCompanyId, pdfBuffer, 'INV-2026-00989_WRONG_PO.pdf');
  const docRecord = await DocumentModel.create({
    id: `doc-00989-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: testUserId,
    fileName: storageRes.fileName,
    originalFileName: 'INV-2026-00989_WRONG_PO.pdf',
    fileSize: pdfBuffer.length,
    mimeType: 'application/pdf',
    fileHash: documentProcessingService.calculateFileHash(pdfBuffer),
    storagePath: storageRes.storagePath,
    storageReference: storageRes.storageReference,
    documentType: 'invoice',
    processingStatus: 'queued',
    extractionStatus: 'pending',
  });

  const processedDoc = await documentProcessingService.processDocument(
    docRecord.id,
    testCompanyId,
    testUserId
  );

  console.log('   Processed Doc Status:', processedDoc?.extractionStatus);
  console.log('   PO Match Status:', processedDoc?.matchResult?.matchStatus);
  console.log('   PO Match Score:', processedDoc?.matchResult?.matchScore);

  if (processedDoc?.matchResult?.matchStatus !== 'no_match') {
    throw new Error(`FAILED Step 4: matchStatus expected "no_match", got "${processedDoc?.matchResult?.matchStatus}" (PO-2026-09999 must not match PO-2026-00423)`);
  }
  console.log('   ✅ Passed Step 4: PO-2026-09999 correctly returned "no_match" without falling back to unrelated PO.');

  console.log('\n📌 [STEP 5] Checking Persisted Invoice in MongoDB...');
  const savedInvoice = await InvoiceModel.findOne({ companyId: testCompanyId, invoiceNumber: 'INV-2026-00989' }).lean();
  console.log('   Saved Invoice Due Date:', savedInvoice?.dueDate);
  console.log('   Saved Invoice Calculated Due Date:', (savedInvoice as any)?.calculatedDueDate);
  console.log('   Saved Invoice Bank Details:', savedInvoice?.bankDetails);
  console.log('   Saved Invoice Items count:', savedInvoice?.items?.length);

  if (savedInvoice?.dueDate !== null && savedInvoice?.dueDate !== undefined) {
    throw new Error(`Assertion Failed: Saved Invoice dueDate must be null/undefined when absent, got "${savedInvoice?.dueDate}"`);
  }
  if ((savedInvoice as any)?.calculatedDueDate !== '2026-09-30') {
    throw new Error(`Assertion Failed: calculatedDueDate expected "2026-09-30", got "${(savedInvoice as any)?.calculatedDueDate}"`);
  }
  if (savedInvoice?.bankDetails?.accountNumber !== null && savedInvoice?.bankDetails?.accountNumber !== undefined) {
    throw new Error(`Assertion Failed: Saved Invoice bankDetails.accountNumber must be null/undefined, got "${savedInvoice?.bankDetails?.accountNumber}"`);
  }
  if (savedInvoice?.items?.length !== 3) {
    throw new Error(`Assertion Failed: Saved Invoice items count expected 3, got ${savedInvoice?.items?.length}`);
  }
  console.log('   ✅ Passed Step 5: Database record verified clean with zero fabricated values.');

  console.log('\n================================================================');
  console.log('🎉 ALL ASSERTIONS FOR INV-2026-00989 PASSED WITH 0 AI CALLS!');
  console.log('================================================================\n');

  process.exit(0);
}

run00989TestSuite().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
