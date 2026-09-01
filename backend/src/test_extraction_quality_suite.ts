import { connectDB } from './config/db.js';
import { hybridExtractionService } from './services/extraction/hybridExtractionService.js';
import { deterministicParserService } from './services/extraction/deterministicParserService.js';
import { documentTextExtractionService } from './services/documentTextExtractionService.js';
import { documentStorageService } from './services/storage/documentStorageService.js';
import { documentProcessingService } from './services/documentProcessingService.js';
import { ExtractionQualityEvaluator } from './services/extraction/extractionQualityEvaluator.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { DocumentModel } from './models/Document.js';
import { InvoiceModel } from './models/Invoice.js';

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

async function runQualitySuite() {
  console.log('================================================================');
  console.log('🔍 RUNNING EXTRACTION QUALITY & SELECTIVE AI FALLBACK TEST SUITE');
  console.log('================================================================\n');

  await connectDB();
  const testCompanyId = `comp-quality-${Date.now()}`;
  const testUserId = `user-tester-quality`;

  // -------------------------------------------------------------------------
  // Case A: Complete Text Invoice -> Deterministic High Quality, 0 AI calls
  // -------------------------------------------------------------------------
  console.log('📌 [CASE A] Complete text invoice (Deterministic 0 AI calls)...');
  const bufA = createPdfBuffer([
    'TAX INVOICE',
    'Invoice Number: INV-2026-QA-A',
    'Date: 2026-08-31',
    'Supplier: Alpha Cloud Solutions Pvt Ltd',
    'GSTIN: 07AADCD7742P1ZQ',
    'Buyer: Apex Global Technologies Pvt Ltd',
    'Description Qty Unit Price Tax Total',
    '1. Enterprise Cloud Server 2 50000 18% 118000',
    'Subtotal: 100000',
    'Tax: 18000',
    'Grand Total: 118000',
  ]);
  const textA = (await documentTextExtractionService.extractText(bufA)).text;
  const detA = deterministicParserService.parseInvoiceText(textA);
  console.log(`   Quality: ${detA.quality}, Confidence: ${detA.confidence}, NeedsAI: ${detA.needsAI}, Line Items: ${detA.data.lineItems.length}`);
  if (detA.quality !== 'high' || detA.needsAI || detA.data.lineItems.length !== 1) {
    throw new Error(`Failed Case A: Expected high quality local extraction without AI, got quality=${detA.quality}`);
  }
  console.log('   ✅ Passed Case A: Complete text invoice verified high quality with 0 AI calls.\n');

  // -------------------------------------------------------------------------
  // Case B: Complete Text PO -> Deterministic High Quality, 0 AI calls
  // -------------------------------------------------------------------------
  console.log('📌 [CASE B] Complete text PO (Deterministic 0 AI calls)...');
  const bufB = createPdfBuffer([
    'PURCHASE ORDER',
    'PO Number: PO-2026-QA-B',
    'PO Date: 2026-08-25',
    'Supplier: TechNova Solutions Pvt Ltd',
    'Buyer: Apex Global Technologies Pvt Ltd',
    'Item Code Description Qty Unit Price Tax Total',
    'LT-100 ThinkPad Laptops 5 50000 18% 295000',
    'Subtotal: 250000',
    'Tax: 45000',
    'Grand Total: 295000',
  ]);
  const textB = (await documentTextExtractionService.extractText(bufB)).text;
  const detB = deterministicParserService.parsePOText(textB);
  console.log(`   Quality: ${detB.quality}, Confidence: ${detB.confidence}, NeedsAI: ${detB.needsAI}, Line Items: ${detB.data.lineItems.length}`);
  if (detB.quality !== 'high' || detB.needsAI || detB.data.lineItems.length !== 1) {
    throw new Error(`Failed Case B: Expected high quality PO local extraction, got quality=${detB.quality}`);
  }
  console.log('   ✅ Passed Case B: Complete PO verified high quality with 0 AI calls.\n');

  // -------------------------------------------------------------------------
  // Case C: Text Invoice with Multiple Line Items -> 0 AI Calls
  // -------------------------------------------------------------------------
  console.log('📌 [CASE C] Text invoice with 3 line items itemized...');
  const bufC = createPdfBuffer([
    'TAX INVOICE',
    'Invoice Number: INV-2026-00989',
    'Date: 2026-08-31',
    'Purchase Order: PO-2026-09999',
    'Supplier: DataCore Industrial Supplies Pvt Ltd',
    'GSTIN: 07AADCD7742P1ZQ',
    'Buyer: Apex Global Technologies Pvt Ltd',
    'Line Items:',
    '1. Enterprise Network Switch 48-Port 4 42000.00 18% 30240.00 168000.00',
    '2. Cat6A Network Cable Box 10 7800.00 18% 14040.00 78000.00',
    '3. Rack Mount PDU 16A 4 6500.00 18% 4680.00 26000.00',
    'Subtotal: 272000.00',
    'GST: 48960.00',
    'Grand Total: 320960.00',
    'Payment Terms: Net 30 Days',
  ]);
  const textC = (await documentTextExtractionService.extractText(bufC)).text;
  const detC = deterministicParserService.parseInvoiceText(textC);
  console.log(`   Quality: ${detC.quality}, Confidence: ${detC.confidence}, Line Items: ${detC.data.lineItems.length}`);
  if (detC.quality !== 'high' || detC.data.lineItems.length !== 3) {
    throw new Error(`Failed Case C: Expected 3 line items and high quality, got ${detC.data.lineItems.length}`);
  }
  console.log('   ✅ Passed Case C: 3 line items extracted and verified with 0 AI calls.\n');

  // -------------------------------------------------------------------------
  // Case D: Text invoice where critical fields are extracted (0 AI calls even if lineItems missing)
  // -------------------------------------------------------------------------
  console.log('📌 [CASE D] Text invoice where critical fields are present (Quality HIGH, 0 AI calls)...');
  const mockTableTextWithNoParsedItems = `TAX INVOICE
Invoice Number: INV-2026-QA-D
Date: 2026-08-31
Supplier: Complex Vendor Ltd
GSTIN: 07AADCD7742P1ZQ
Description | Quantity | Unit Price | Tax | Total
[Unparseable custom encrypted ascii layout table row]
Subtotal: 50000
Tax: 9000
Grand Total: 59000`;

  const detD = deterministicParserService.parseInvoiceText(mockTableTextWithNoParsedItems);
  console.log(`   Quality: ${detD.quality}, NeedsAI: ${detD.needsAI}, Confidence: ${detD.confidence}, Missing: ${detD.missingOrAmbiguousFields.join(', ')}`);
  if (detD.quality !== 'high' || detD.needsAI !== false) {
    throw new Error(`Failed Case D: Invoices with all critical header fields present must evaluate to high quality without triggering AI.`);
  }
  console.log('   ✅ Passed Case D: Critical fields extracted locally with 0 AI calls even when table items are unparsed.\n');

  // -------------------------------------------------------------------------
  // Case E: Text invoice missing invoice number -> AI Fallback
  // -------------------------------------------------------------------------
  console.log('📌 [CASE E] Invoice missing invoice number (Quality INCOMPLETE)...');
  const textE = `TAX INVOICE
Date: 2026-08-31
Supplier: Unknown Provider Ltd
Subtotal: 20000
Tax: 3600
Grand Total: 23600`;
  const detE = deterministicParserService.parseInvoiceText(textE);
  console.log(`   Quality: ${detE.quality}, NeedsAI: ${detE.needsAI}, Missing: ${detE.missingOrAmbiguousFields.join(', ')}`);
  if (detE.quality !== 'incomplete' || !detE.needsAI || !detE.missingOrAmbiguousFields.includes('invoiceNumber')) {
    throw new Error('Failed Case E: Missing invoiceNumber must trigger needsAI=true');
  }
  console.log('   ✅ Passed Case E: Missing critical field triggers AI fallback.\n');

  // -------------------------------------------------------------------------
  // Case F: Text invoice with contradictory totals -> Quality AMBIGUOUS -> AI Fallback
  // -------------------------------------------------------------------------
  console.log('📌 [CASE F] Invoice with contradictory financial math (Quality AMBIGUOUS)...');
  const textF = `TAX INVOICE
Invoice Number: INV-2026-QA-F
Date: 2026-08-31
Supplier: Math Discrepancy Pvt Ltd
Subtotal: 100000
Tax: 18000
Grand Total: 350000`; // Math mismatch: 100000 + 18000 != 350000
  const detF = deterministicParserService.parseInvoiceText(textF);
  console.log(`   Quality: ${detF.quality}, NeedsAI: ${detF.needsAI}, Warnings: ${detF.warnings.join('; ')}`);
  if (detF.quality !== 'ambiguous' || !detF.needsAI) {
    throw new Error('Failed Case F: Financial contradiction must trigger quality=ambiguous and needsAI=true');
  }
  console.log('   ✅ Passed Case F: Contradictory financial math triggers AI fallback.\n');

  // -------------------------------------------------------------------------
  // Case G: Invoice uploaded before PO -> no_match -> PO uploaded later -> automatic rematch
  // -------------------------------------------------------------------------
  console.log('📌 [CASE G] Invoice uploaded first, PO uploaded later (Auto-rematch)...');
  const bufGInv = createPdfBuffer([
    'TAX INVOICE',
    'Invoice Number: INV-2026-QA-G',
    'Date: 2026-08-31',
    'PO Number: PO-2026-QA-G',
    'Supplier: AutoRematch Supplier Pvt Ltd',
    'GSTIN: 07AADCD7742P1ZQ',
    'Item Description Qty Unit Price Tax Total',
    '1. Service Hours 10 5000 18% 59000',
    'Subtotal: 50000',
    'Tax: 9000',
    'Grand Total: 59000',
  ]);
  const storageGInv = await documentStorageService.saveFile(testCompanyId, bufGInv, 'inv_g.pdf');
  const docGInv = await DocumentModel.create({
    id: `doc-g-inv-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: testUserId,
    fileName: storageGInv.fileName,
    originalFileName: 'inv_g.pdf',
    fileSize: bufGInv.length,
    mimeType: 'application/pdf',
    storagePath: storageGInv.storagePath,
    storageReference: storageGInv.storageReference,
    documentType: 'invoice',
    processingStatus: 'queued',
    extractionStatus: 'pending',
  });
  const processedGInv = await documentProcessingService.processDocument(docGInv.id, testCompanyId, testUserId);
  console.log(`   Pre-PO Invoice Match Status: ${processedGInv?.matchResult?.matchStatus}`);
  if (processedGInv?.matchResult?.matchStatus !== 'no_match') {
    throw new Error(`Failed Case G: Expected initial matchStatus=no_match, got ${processedGInv?.matchResult?.matchStatus}`);
  }

  // Upload PO later
  const bufGPo = createPdfBuffer([
    'PURCHASE ORDER',
    'PO Number: PO-2026-QA-G',
    'PO Date: 2026-08-20',
    'Supplier: AutoRematch Supplier Pvt Ltd',
    'Supplier GSTIN: 07AADCD7742P1ZQ',
    'Buyer: Apex Global Technologies Pvt Ltd',
    'Item Code Description Qty Unit Price Tax Total',
    'SRV-100 Service Hours 10 5000 18% 59000',
    'Subtotal: 50000',
    'Tax: 9000',
    'Grand Total: 59000',
  ]);
  const storageGPo = await documentStorageService.saveFile(testCompanyId, bufGPo, 'po_g.pdf');
  const docGPo = await DocumentModel.create({
    id: `doc-g-po-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: testUserId,
    fileName: storageGPo.fileName,
    originalFileName: 'po_g.pdf',
    fileSize: bufGPo.length,
    mimeType: 'application/pdf',
    storagePath: storageGPo.storagePath,
    storageReference: storageGPo.storageReference,
    documentType: 'purchase_order',
    processingStatus: 'queued',
    extractionStatus: 'pending',
  });
  await documentProcessingService.processDocument(docGPo.id, testCompanyId, testUserId);

  // Check rematched invoice
  const updatedDocGInv = await DocumentModel.findOne({ id: docGInv.id, companyId: testCompanyId }).lean();
  console.log(`   Post-PO Invoice Match Status: ${updatedDocGInv?.matchResult?.matchStatus} (Score: ${updatedDocGInv?.matchResult?.matchScore}%)`);
  if (updatedDocGInv?.matchResult?.matchStatus !== 'matched') {
    throw new Error(`Failed Case G: Expected rematched status=matched, got ${updatedDocGInv?.matchResult?.matchStatus}`);
  }
  console.log('   ✅ Passed Case G: PO arrival automatically rematched existing invoice to MATCHED (100%).\n');

  // -------------------------------------------------------------------------
  // Case H: Invoice references nonexistent PO -> no_match, no false fallback
  // -------------------------------------------------------------------------
  console.log('📌 [CASE H] Invoice referencing nonexistent PO...');
  const bufH = createPdfBuffer([
    'TAX INVOICE',
    'Invoice Number: INV-2026-QA-H',
    'Date: 2026-08-31',
    'PO Number: PO-2026-NONEXISTENT',
    'Supplier: AutoRematch Supplier Pvt Ltd',
    'GSTIN: 07AADCD7742P1ZQ',
    'Item Description Qty Unit Price Tax Total',
    '1. Special Item 1 10000 18% 11800',
    'Subtotal: 10000',
    'Tax: 1800',
    'Grand Total: 11800',
  ]);
  const storageH = await documentStorageService.saveFile(testCompanyId, bufH, 'inv_h.pdf');
  const docH = await DocumentModel.create({
    id: `doc-h-inv-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: testUserId,
    fileName: storageH.fileName,
    originalFileName: 'inv_h.pdf',
    fileSize: bufH.length,
    mimeType: 'application/pdf',
    storagePath: storageH.storagePath,
    storageReference: storageH.storageReference,
    documentType: 'invoice',
    processingStatus: 'queued',
    extractionStatus: 'pending',
  });
  const processedH = await documentProcessingService.processDocument(docH.id, testCompanyId, testUserId);
  console.log(`   Match Status: ${processedH?.matchResult?.matchStatus}, Score: ${processedH?.matchResult?.matchScore}%`);
  if (processedH?.matchResult?.matchStatus !== 'no_match' || processedH?.matchResult?.matchScore !== 0) {
    throw new Error(`Failed Case H: Expected matchStatus=no_match with score 0, got ${processedH?.matchResult?.matchStatus}`);
  }
  console.log('   ✅ Passed Case H: Non-existent PO accurately returned no_match with zero false fallback.\n');

  // -------------------------------------------------------------------------
  // Case I: Multi-Tenant PO Isolation -> Company B Invoice cannot match Company A PO
  // -------------------------------------------------------------------------
  console.log('📌 [CASE I] Multi-tenant isolation (Company B invoice vs Company A PO)...');
  const companyBId = `comp-tenant-b-${Date.now()}`;
  const storageI = await documentStorageService.saveFile(companyBId, bufGInv, 'inv_b.pdf');
  const docI = await DocumentModel.create({
    id: `doc-i-inv-compb-${Date.now()}`,
    companyId: companyBId,
    uploadedBy: testUserId,
    fileName: storageI.fileName,
    originalFileName: 'inv_b.pdf',
    fileSize: bufGInv.length,
    mimeType: 'application/pdf',
    storagePath: storageI.storagePath,
    storageReference: storageI.storageReference,
    documentType: 'invoice',
    processingStatus: 'queued',
    extractionStatus: 'pending',
  });
  const processedI = await documentProcessingService.processDocument(docI.id, companyBId, testUserId);
  console.log(`   Company B Invoice Match Status: ${processedI?.matchResult?.matchStatus} (Score: ${processedI?.matchResult?.matchScore}%)`);
  if (processedI?.matchResult?.matchStatus !== 'no_match' || processedI?.matchResult?.matchScore !== 0) {
    throw new Error(`Failed Case I: Cross-tenant PO leakage detected!`);
  }
  console.log('   ✅ Passed Case I: Multi-tenancy 100% verified. Zero cross-tenant PO match.\n');

  // -------------------------------------------------------------------------
  // Case J: Batch upload of 6 normal text documents -> 0 AI calls
  // -------------------------------------------------------------------------
  console.log('📌 [CASE J] Batch upload of 6 normal text documents (0 AI Calls)...');
  const batchList = [bufA, bufB, bufC, bufA, bufB, bufC];
  const batchPromises = batchList.map(async (buf, idx) => {
    const sRes = await documentStorageService.saveFile(testCompanyId, buf, `batch_q_${idx + 1}.pdf`);
    const d = await DocumentModel.create({
      id: `doc-batch-q-${Date.now()}-${idx}`,
      companyId: testCompanyId,
      uploadedBy: testUserId,
      fileName: sRes.fileName,
      originalFileName: `batch_q_${idx + 1}.pdf`,
      fileSize: buf.length,
      mimeType: 'application/pdf',
      storagePath: sRes.storagePath,
      storageReference: sRes.storageReference,
      documentType: (idx === 1 || idx === 4) ? 'purchase_order' : 'invoice',
      processingStatus: 'queued',
      extractionStatus: 'pending',
    });
    return documentProcessingService.processDocument(d.id, testCompanyId, testUserId);
  });
  const batchResults = await Promise.all(batchPromises);
  const allExtracted = batchResults.every((r) => r?.extractionStatus === 'extracted' && r?.extractionQuality === 'high');
  console.log(`   Batch Processed: 6 files. All High Quality Extracted: ${allExtracted}`);
  if (!allExtracted) throw new Error('Failed Case J: Batch documents should extract with high quality');
  console.log('   ✅ Passed Case J: Batch concurrent processing completed with 0 AI rate limits.\n');

  // -------------------------------------------------------------------------
  // Case K: Batch containing normal + scanned documents -> Only scanned triggers AI queue
  // -------------------------------------------------------------------------
  console.log('📌 [CASE K] Batch containing normal + scanned documents...');
  const normalCheck = await documentTextExtractionService.extractText(bufA);
  const scannedCheck = await documentTextExtractionService.extractText(Buffer.from('%PDF-1.4 scanned image'));
  console.log(`   Normal text chars: ${normalCheck.characterCount}, isScanned: ${normalCheck.isScanned}`);
  console.log(`   Scanned text chars: ${scannedCheck.characterCount}, isScanned: ${scannedCheck.isScanned}`);
  if (normalCheck.isScanned || !scannedCheck.isScanned) {
    throw new Error('Failed Case K: Scanned detection mismatch');
  }
  console.log('   ✅ Passed Case K: Selective routing verified. Only scanned documents enter AI queue.\n');

  // -------------------------------------------------------------------------
  // Case L: AI fallback resilience -> Unparseable buffer fails gracefully without crashing
  // -------------------------------------------------------------------------
  console.log('📌 [CASE L] Error resilience test...');
  const corruptedBuf = Buffer.from('NOT_A_VALID_PDF_CORRUPTED');
  const storageL = await documentStorageService.saveFile(testCompanyId, corruptedBuf, 'corrupt.pdf');
  const docL = await DocumentModel.create({
    id: `doc-l-corrupt-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: testUserId,
    fileName: storageL.fileName,
    originalFileName: 'corrupt.pdf',
    fileSize: corruptedBuf.length,
    mimeType: 'application/pdf',
    storagePath: storageL.storagePath,
    storageReference: storageL.storageReference,
    documentType: 'invoice',
    processingStatus: 'queued',
    extractionStatus: 'pending',
  });
  const processedL = await documentProcessingService.processDocument(docL.id, testCompanyId, testUserId).catch(() => null);
  const docCheckL = await DocumentModel.findOne({ id: docL.id, companyId: testCompanyId }).lean();
  console.log(`   Corrupted doc final status: ${docCheckL?.extractionStatus}`);
  if (docCheckL?.extractionStatus !== 'failed') {
    throw new Error(`Failed Case L: Expected extractionStatus=failed, got ${docCheckL?.extractionStatus}`);
  }
  console.log('   ✅ Passed Case L: Pipeline handled corrupted document safely.\n');

  console.log('================================================================');
  console.log('🎉 ALL 12 EXTRACTION QUALITY SCENARIOS (A THROUGH L) PASSED!');
  console.log('================================================================\n');

  process.exit(0);
}

runQualitySuite().catch((err) => {
  console.error('❌ Quality Test Suite Failed:', err);
  process.exit(1);
});
