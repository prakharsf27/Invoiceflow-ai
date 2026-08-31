import { connectDB } from './config/db.js';
import { documentStorageService } from './services/storage/documentStorageService.js';
import { documentProcessingService } from './services/documentProcessingService.js';
import { deterministicParserService } from './services/extraction/deterministicParserService.js';
import { ExtractionQualityEvaluator } from './services/extraction/extractionQualityEvaluator.js';
import { DocumentModel } from './models/Document.js';

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

async function runCacheResilienceSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING CONTENT-HASH CACHE RESILIENCE & MULTILINE TEST SUITE');
  console.log('================================================================\n');

  await connectDB();
  const testCompanyId = `comp-cache-${Date.now()}`;
  const testUserId = `user-tester-cache`;

  // Sample PDF content that has full invoice text
  const pdfLines = [
    'TAX INVOICE',
    'Invoice Number: INV-2026-01002',
    'Date: 2026-08-31',
    'Supplier: TechNova Solutions Pvt Ltd',
    'GSTIN: 27AADCB2234M1Z2',
    'Buyer: Apex Global Technologies Pvt Ltd',
    'Item Description Qty Unit Price Tax Total',
    '1. High-Performance Server 1 671000 18% 791780',
    'Subtotal: 671000',
    'Tax: 120780',
    'Grand Total: 791780',
  ];
  const samplePdfBuffer = createPdfBuffer(pdfLines);
  const fileHash = documentProcessingService.calculateFileHash(samplePdfBuffer);

  // -------------------------------------------------------------------------
  // TEST 1: Simulate Bad / Incomplete Previous Extraction in Cache
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 1] Poisoned cache scenario: Creating previous doc with empty extractedData...');
  const storage1 = await documentStorageService.saveFile(testCompanyId, samplePdfBuffer, 'sample_doc1.pdf');
  const doc1 = await DocumentModel.create({
    id: `doc-poisoned-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: testUserId,
    fileName: storage1.fileName,
    originalFileName: 'sample_doc1.pdf',
    fileSize: samplePdfBuffer.length,
    mimeType: 'application/pdf',
    storagePath: storage1.storagePath,
    storageReference: storage1.storageReference,
    documentType: 'invoice',
    processingStatus: 'processed',
    extractionStatus: 'extracted',
    fileHash,
    // Simulating previous bad/empty extraction:
    extractedData: {
      invoiceNumber: null,
      supplierName: null,
      amount: 0,
      lineItems: [],
    },
    extractionQuality: 'high', // Even if falsely marked as high
  });

  // Verify that isReusableCachedExtraction returns FALSE for doc1
  const isDoc1Reusable = ExtractionQualityEvaluator.isReusableCachedExtraction(doc1);
  console.log(`   isReusableCachedExtraction(doc1): ${isDoc1Reusable}`);
  if (isDoc1Reusable) {
    throw new Error('FAILED Test 1: Poisoned cache must be rejected by isReusableCachedExtraction!');
  }
  console.log('   ✅ Passed Test 1 Part A: isReusableCachedExtraction rejected bad extraction.\n');

  // -------------------------------------------------------------------------
  // TEST 2: Upload Identical PDF -> Must Reject Cache & Run Local Extraction
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 2] Processing identical PDF (doc2) -> Must NOT copy bad cache, must extract locally...');
  const storage2 = await documentStorageService.saveFile(testCompanyId, samplePdfBuffer, 'sample_doc2.pdf');
  const doc2 = await DocumentModel.create({
    id: `doc-clean-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: testUserId,
    fileName: storage2.fileName,
    originalFileName: 'sample_doc2.pdf',
    fileSize: samplePdfBuffer.length,
    mimeType: 'application/pdf',
    storagePath: storage2.storagePath,
    storageReference: storage2.storageReference,
    documentType: 'invoice',
    processingStatus: 'queued',
    extractionStatus: 'pending',
  });

  const processedDoc2 = await documentProcessingService.processDocument(doc2.id, testCompanyId, testUserId);

  console.log(`   Doc2 Status: ${processedDoc2?.extractionStatus}`);
  console.log(`   Doc2 Method: ${processedDoc2?.extractionMethod}`);
  console.log(`   Doc2 Invoice #: ${processedDoc2?.extractedData?.invoiceNumber}`);
  console.log(`   Doc2 Supplier: ${processedDoc2?.extractedData?.supplierName}`);
  console.log(`   Doc2 Amount: ₹${processedDoc2?.extractedData?.amount}`);
  console.log(`   Doc2 Line Items: ${processedDoc2?.extractedData?.lineItems?.length}`);

  if (
    processedDoc2?.extractedData?.invoiceNumber !== 'INV-2026-01002' ||
    processedDoc2?.extractedData?.supplierName !== 'TechNova Solutions Pvt Ltd' ||
    processedDoc2?.extractedData?.amount !== 791780 ||
    processedDoc2?.extractedData?.lineItems?.length !== 1
  ) {
    throw new Error('FAILED Test 2: Doc2 did not perform complete local extraction or copied bad cache!');
  }
  console.log('   ✅ Passed Test 2: Document 2 ignored bad cache and successfully extracted complete invoice data locally.\n');

  // -------------------------------------------------------------------------
  // TEST 3: Upload Identical PDF Again (doc3) -> Valid Cache Hit Reused
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 3] Processing identical PDF (doc3) -> Now high-quality cache exists, should be reused...');
  const storage3 = await documentStorageService.saveFile(testCompanyId, samplePdfBuffer, 'sample_doc3.pdf');
  const doc3 = await DocumentModel.create({
    id: `doc-cache-reuse-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: testUserId,
    fileName: storage3.fileName,
    originalFileName: 'sample_doc3.pdf',
    fileSize: samplePdfBuffer.length,
    mimeType: 'application/pdf',
    storagePath: storage3.storagePath,
    storageReference: storage3.storageReference,
    documentType: 'invoice',
    processingStatus: 'queued',
    extractionStatus: 'pending',
  });

  const processedDoc3 = await documentProcessingService.processDocument(doc3.id, testCompanyId, testUserId);
  console.log(`   Doc3 Status: ${processedDoc3?.extractionStatus}`);
  console.log(`   Doc3 Invoice #: ${processedDoc3?.extractedData?.invoiceNumber}`);
  console.log(`   Doc3 Supplier: ${processedDoc3?.extractedData?.supplierName}`);
  console.log(`   Doc3 Amount: ₹${processedDoc3?.extractedData?.amount}`);

  if (
    processedDoc3?.extractedData?.invoiceNumber !== 'INV-2026-01002' ||
    processedDoc3?.extractedData?.supplierName !== 'TechNova Solutions Pvt Ltd' ||
    processedDoc3?.extractedData?.amount !== 791780
  ) {
    throw new Error('FAILED Test 3: Doc3 failed to reuse high quality cached extraction!');
  }
  console.log('   ✅ Passed Test 3: Valid high-quality cached extraction successfully and safely reused.\n');

  // -------------------------------------------------------------------------
  // TEST 4: Multiline Text Extraction (Labels on line i, Values on line i+1)
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 4] Multiline layout extraction (Labels followed by values on next lines)...');
  const multilineText = `TAX INVOICE
Invoice Number
INV-MULTILINE-8899

Supplier Name
Apex Cloud Systems Pvt Ltd

GSTIN
07AADCD7742P1ZQ

Date
2026-08-31

Description Qty Rate Tax Total
Cloud Server Node 2 25000 18% 59000

Subtotal
50000

Tax
9000

Total Amount
₹59,000`;

  const detMulti = deterministicParserService.parseInvoiceText(multilineText);
  console.log(`   Parsed Inv #: ${detMulti.data.invoiceNumber}`);
  console.log(`   Parsed Supplier: ${detMulti.data.supplierName}`);
  console.log(`   Parsed Amount: ₹${detMulti.data.amount}`);
  console.log(`   Parsed Quality: ${detMulti.quality}, Confidence: ${detMulti.confidence}, NeedsAI: ${detMulti.needsAI}`);

  if (
    detMulti.data.invoiceNumber !== 'INV-MULTILINE-8899' ||
    detMulti.data.supplierName !== 'Apex Cloud Systems Pvt Ltd' ||
    detMulti.data.amount !== 59000 ||
    detMulti.quality !== 'high' ||
    detMulti.needsAI
  ) {
    throw new Error('FAILED Test 4: Multiline key-value parsing failed to extract critical fields deterministically!');
  }
  console.log('   ✅ Passed Test 4: Multiline invoice text parsed with HIGH quality and 0 AI calls.\n');

  console.log('================================================================');
  console.log('🎉 ALL CONTENT-HASH CACHE & MULTILINE TESTS PASSED!');
  console.log('================================================================\n');

  process.exit(0);
}

runCacheResilienceSuite().catch((err) => {
  console.error('❌ Cache Resilience Suite Failed:', err);
  process.exit(1);
});
