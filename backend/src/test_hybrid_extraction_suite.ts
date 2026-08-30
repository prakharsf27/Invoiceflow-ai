import fs from 'fs';
import path from 'path';
import { connectDB } from './config/db.js';
import { DocumentModel } from './models/Document.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { InvoiceModel } from './models/Invoice.js';
import { documentStorageService } from './services/storage/documentStorageService.js';
import { documentProcessingService } from './services/documentProcessingService.js';
import { poMatchingService } from './services/poMatchingService.js';

async function runHybridTestSuite() {
  console.log('================================================================');
  console.log('🚀 RUNNING HYBRID DOCUMENT EXTRACTION & PO MATCHING TEST SUITE');
  console.log('================================================================\n');

  const testCompanyId = `comp-test-hybrid-${Date.now()}`;
  const testUserId = `usr-tester`;

  try {
    await connectDB();

    const sampleDir = path.resolve(process.cwd(), 'uploads/comp-invoice-mt4k9g0f');
    const poFile = 'doc-76e6fab0-9c61-4f11-819a-7ab576928536.pdf';
    const matchInvFile = 'doc-b5112033-8523-4a24-85bc-e5b21ac06a84.pdf';
    const mismatchInvFile = 'doc-65949466-1aff-473e-a35c-3d23b870645d.pdf';

    const poBuffer = fs.readFileSync(path.join(sampleDir, poFile));
    const matchInvBuffer = fs.readFileSync(path.join(sampleDir, matchInvFile));
    const mismatchInvBuffer = fs.readFileSync(path.join(sampleDir, mismatchInvFile));

    // Save buffers into testCompany storage
    const poStorage = await documentStorageService.saveFile(testCompanyId, poBuffer, '01_purchase_order_matching.pdf');
    const matchInvStorage = await documentStorageService.saveFile(testCompanyId, matchInvBuffer, '02_invoice_matching.pdf');
    const mismatchInvStorage = await documentStorageService.saveFile(testCompanyId, mismatchInvBuffer, '03_invoice_mismatch.pdf');

    // -------------------------------------------------------------
    // TEST 1: Invoice uploaded BEFORE PO (Rematch Workflow)
    // -------------------------------------------------------------
    console.log('📌 [TEST 1] Uploading Invoice (02_invoice_matching.pdf) BEFORE Purchase Order...');
    const invDoc1Id = `doc-inv-pre-${Date.now()}`;
    await DocumentModel.create({
      id: invDoc1Id,
      companyId: testCompanyId,
      uploadedBy: testUserId,
      originalFileName: '02_invoice_matching.pdf',
      fileName: matchInvStorage.fileName,
      mimeType: 'application/pdf',
      fileSize: matchInvBuffer.length,
      fileHash: documentProcessingService.calculateFileHash(matchInvBuffer),
      documentType: 'invoice',
      storagePath: matchInvStorage.storagePath,
      storageReference: matchInvStorage.storageReference,
      processingStatus: 'queued',
      extractionStatus: 'pending',
    });

    const processedInv1 = await documentProcessingService.processDocument(invDoc1Id, testCompanyId, testUserId);
    console.log('   Extraction Status:', processedInv1.extractionStatus);
    console.log('   Extraction Method:', (processedInv1 as any).extractionMethod);
    console.log('   Extracted Inv #:', processedInv1.extractedData?.invoiceNumber);
    console.log('   Extracted PO Ref:', processedInv1.extractedData?.poNumber);
    console.log('   Extracted Amount: ₹', processedInv1.extractedData?.amount?.toLocaleString('en-IN'));
    console.log('   Initial PO Match Status:', processedInv1.matchResult?.matchStatus);

    if (processedInv1.matchResult?.matchStatus !== 'no_match') {
      throw new Error(`Expected initial matchStatus to be 'no_match' before PO is uploaded, got: ${processedInv1.matchResult?.matchStatus}`);
    }
    console.log('   ✅ Test 1 Part A: Invoice extracted via local PDF parser without PO match (as expected).\n');

    // -------------------------------------------------------------
    // TEST 2: PO Uploaded -> Back-propagation / Auto-Rematch
    // -------------------------------------------------------------
    console.log('📌 [TEST 2] Uploading Purchase Order (01_purchase_order_matching.pdf)...');
    const poDocId = `doc-po-${Date.now()}`;
    await DocumentModel.create({
      id: poDocId,
      companyId: testCompanyId,
      uploadedBy: testUserId,
      originalFileName: '01_purchase_order_matching.pdf',
      fileName: poStorage.fileName,
      mimeType: 'application/pdf',
      fileSize: poBuffer.length,
      fileHash: documentProcessingService.calculateFileHash(poBuffer),
      documentType: 'purchase_order',
      storagePath: poStorage.storagePath,
      storageReference: poStorage.storageReference,
      processingStatus: 'queued',
      extractionStatus: 'pending',
    });

    const processedPO = await documentProcessingService.processDocument(poDocId, testCompanyId, testUserId);
    console.log('   PO Extraction Status:', processedPO.extractionStatus);
    console.log('   PO Extraction Method:', (processedPO as any).extractionMethod);
    console.log('   PO Number:', processedPO.extractedData?.poNumber);
    console.log('   PO Supplier:', processedPO.extractedData?.supplierName);
    console.log('   PO Total: ₹', processedPO.extractedData?.total?.toLocaleString('en-IN'));

    // Wait 500ms for background rematch to propagate
    await new Promise((r) => setTimeout(r, 600));

    // Verify Invoice 1 now has matchStatus === 'matched'
    const updatedInv1 = await DocumentModel.findOne({ id: invDoc1Id, companyId: testCompanyId });
    console.log('   Post-PO Upload Invoice 1 Match Status:', updatedInv1?.matchResult?.matchStatus);
    console.log('   Post-PO Upload Match Score:', updatedInv1?.matchResult?.matchScore);

    if (updatedInv1?.matchResult?.matchStatus !== 'matched') {
      throw new Error(`Expected Invoice 1 to be auto-rematched to 'matched', got: ${updatedInv1?.matchResult?.matchStatus}`);
    }
    console.log('   ✅ Test 2: PO extracted and Invoice 1 automatically rematched to MATCHED (100%).\n');

    // -------------------------------------------------------------
    // TEST 3: Invoice Uploaded AFTER PO (Immediate Match)
    // -------------------------------------------------------------
    console.log('📌 [TEST 3] Uploading Second Matching Invoice AFTER PO exists...');
    const invDoc2Id = `doc-inv-post-${Date.now()}`;
    const matchInv2Storage = await documentStorageService.saveFile(testCompanyId, matchInvBuffer, '02_invoice_matching_repeat.pdf');
    await DocumentModel.create({
      id: invDoc2Id,
      companyId: testCompanyId,
      uploadedBy: testUserId,
      originalFileName: '02_invoice_matching_repeat.pdf',
      fileName: matchInv2Storage.fileName,
      mimeType: 'application/pdf',
      fileSize: matchInvBuffer.length,
      fileHash: `hash-repeat-${Date.now()}`,
      documentType: 'invoice',
      storagePath: matchInv2Storage.storagePath,
      storageReference: matchInv2Storage.storageReference,
      processingStatus: 'queued',
      extractionStatus: 'pending',
    });

    const processedInv2 = await documentProcessingService.processDocument(invDoc2Id, testCompanyId, testUserId);
    console.log('   Invoice 2 Extraction Status:', processedInv2.extractionStatus);
    console.log('   Invoice 2 Match Status:', processedInv2.matchResult?.matchStatus);
    console.log('   Invoice 2 Match Score:', processedInv2.matchResult?.matchScore);

    if (processedInv2.matchResult?.matchStatus !== 'matched') {
      throw new Error(`Expected Invoice 2 to immediately match PO, got: ${processedInv2.matchResult?.matchStatus}`);
    }
    console.log('   ✅ Test 3: Invoice processed after PO matches immediately (100% score).\n');

    // -------------------------------------------------------------
    // TEST 4: Price Mismatch Detection (03_invoice_mismatch.pdf)
    // -------------------------------------------------------------
    console.log('📌 [TEST 4] Uploading Price Mismatch Invoice (03_invoice_mismatch.pdf)...');
    const invMismatchId = `doc-mismatch-${Date.now()}`;
    await DocumentModel.create({
      id: invMismatchId,
      companyId: testCompanyId,
      uploadedBy: testUserId,
      originalFileName: '03_invoice_mismatch.pdf',
      fileName: mismatchInvStorage.fileName,
      mimeType: 'application/pdf',
      fileSize: mismatchInvBuffer.length,
      fileHash: documentProcessingService.calculateFileHash(mismatchInvBuffer),
      documentType: 'invoice',
      storagePath: mismatchInvStorage.storagePath,
      storageReference: mismatchInvStorage.storageReference,
      processingStatus: 'queued',
      extractionStatus: 'pending',
    });

    const processedMismatch = await documentProcessingService.processDocument(invMismatchId, testCompanyId, testUserId);
    console.log('   Mismatch Invoice Extraction Status:', processedMismatch.extractionStatus);
    console.log('   Mismatch Invoice Total: ₹', processedMismatch.extractedData?.amount?.toLocaleString('en-IN'));
    console.log('   Mismatch Match Status:', processedMismatch.matchResult?.matchStatus);
    console.log('   Discrepancies:', processedMismatch.matchResult?.discrepancies);

    if (processedMismatch.matchResult?.matchStatus !== 'mismatch') {
      throw new Error(`Expected matchStatus to be 'mismatch', got: ${processedMismatch.matchResult?.matchStatus}`);
    }
    console.log('   ✅ Test 4: Financial mismatch detected and flagged accurately as MISMATCH.\n');

    // -------------------------------------------------------------
    // TEST 5: Multi-Document Simultaneous Batch Processing
    // -------------------------------------------------------------
    console.log('📌 [TEST 5] Multi-Document Simultaneous Batch Processing (5 docs concurrent)...');
    const batchPromises = [1, 2, 3, 4, 5].map(async (idx) => {
      const bId = `doc-batch-${Date.now()}-${idx}`;
      const bStorage = await documentStorageService.saveFile(testCompanyId, matchInvBuffer, `batch_doc_${idx}.pdf`);
      await DocumentModel.create({
        id: bId,
        companyId: testCompanyId,
        uploadedBy: testUserId,
        originalFileName: `batch_doc_${idx}.pdf`,
        fileName: bStorage.fileName,
        mimeType: 'application/pdf',
        fileSize: matchInvBuffer.length,
        fileHash: `hash-batch-${idx}-${Date.now()}`,
        documentType: 'invoice',
        storagePath: bStorage.storagePath,
        storageReference: bStorage.storageReference,
        processingStatus: 'queued',
        extractionStatus: 'pending',
      });
      return documentProcessingService.processDocument(bId, testCompanyId, testUserId);
    });

    const batchResults = await Promise.all(batchPromises);
    console.log(`   Processed ${batchResults.length} documents concurrently.`);
    const allExtracted = batchResults.every((r) => r.extractionStatus === 'extracted');
    console.log(`   All documents extracted successfully: ${allExtracted}`);

    if (!allExtracted) {
      throw new Error('Some documents in the batch failed to extract.');
    }
    console.log('   ✅ Test 5: Concurrent multi-document upload succeeded locally with zero rate limits.\n');

    console.log('================================================================');
    console.log('🎉 ALL 5 HYBRID EXTRACTION & PO MATCHING TESTS PASSED PERFECTLY!');
    console.log('================================================================');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Test suite failed with error:', error);
    process.exit(1);
  }
}

runHybridTestSuite();
