import { connectDB } from './config/db.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { InvoiceModel } from './models/Invoice.js';
import { DocumentModel } from './models/Document.js';
import { PaymentModel } from './models/Payment.js';
import { acceptPOVariance, requestPOClarification } from './controllers/purchaseOrderController.js';
import mongoose from 'mongoose';

async function runAcceptVarianceTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING ACCEPT VARIANCE & PO RECONCILIATION TEST SUITE');
  console.log('================================================================\n');

  await connectDB();
  const testCompanyId = `comp-variance-${Date.now()}`;
  const mockReq = (params: any, body: any) => ({
    params,
    body,
    user: { companyId: testCompanyId, userId: 'test-user-01' },
  } as any);

  const mockRes = () => {
    const res: any = {};
    res.statusCode = 200;
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data: any) => {
      res.body = data;
      return res;
    };
    return res;
  };

  // -------------------------------------------------------------------------
  // TEST 1: Normal matched invoice where matchResult already exists
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 1] Normal PO with existing matchResult...');
  const po1 = await PurchaseOrderModel.create({
    id: `po-1-${Date.now()}`,
    companyId: testCompanyId,
    poNumber: 'PO-TEST-001',
    supplierId: 'sup-1',
    supplierName: 'Acme Supplies',
    totalAmount: 10000,
    issuedDate: '2026-09-01',
    status: 'open',
    matchStatus: 'matched',
    items: [],
  });

  const inv1 = await InvoiceModel.create({
    id: `inv-1-${Date.now()}`,
    companyId: testCompanyId,
    invoiceNumber: 'INV-TEST-001',
    poNumber: 'PO-TEST-001',
    supplierId: 'sup-1',
    supplierName: 'Acme Supplies',
    amount: 10000,
    subtotal: 8474.58,
    tax: 1525.42,
    discount: 0,
    currency: 'INR',
    invoiceDate: '2026-09-01',
    status: 'ready',
    paymentStatus: 'scheduled',
    riskLevel: 'low',
    aiStatus: 'Ready',
    aiRecommendation: 'Invoice is clean and matched with approved PO.',
    items: [],
    aiChecks: [{ id: 'po-check', title: '3-Way PO Match', passed: true, type: 'success', detail: '100% matched' }],
  });

  const doc1 = await DocumentModel.create({
    id: `doc-1-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: 'test-user',
    originalFileName: 'inv-001.pdf',
    fileName: 'inv-001.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    documentType: 'invoice',
    storagePath: '/mock/inv-001.pdf',
    storageReference: `ref-1-${Date.now()}`,
    processingStatus: 'processed',
    extractionStatus: 'extracted',
    linkedRecordId: inv1.id,
    matchResult: {
      poNumber: 'PO-TEST-001',
      matchStatus: 'matched',
      matchScore: 100,
      matchedFields: ['PO Number', 'Supplier', 'Amount'],
      discrepancies: [],
    },
  });

  const res1 = mockRes();
  await acceptPOVariance(mockReq({ id: 'PO-TEST-001' }, { invoiceId: inv1.id }), res1);
  if (res1.statusCode !== 200 || !res1.body?.success) {
    throw new Error(`FAILED Test 1: ${res1.body?.message}`);
  }
  console.log('   ✅ Passed Test 1: Handled PO with existing matchResult successfully.\n');

  // -------------------------------------------------------------------------
  // TEST 2: Mismatched invoice where matchResult exists
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 2] Mismatched invoice where matchResult exists...');
  const po2 = await PurchaseOrderModel.create({
    id: `po-2-${Date.now()}`,
    companyId: testCompanyId,
    poNumber: 'PO-TEST-002',
    supplierId: 'sup-2',
    supplierName: 'Global Paper Co',
    totalAmount: 20000,
    issuedDate: '2026-09-01',
    status: 'mismatch',
    matchStatus: 'mismatch',
    items: [],
  });

  const inv2 = await InvoiceModel.create({
    id: `inv-2-${Date.now()}`,
    companyId: testCompanyId,
    invoiceNumber: 'INV-TEST-002',
    poNumber: 'PO-TEST-002',
    supplierId: 'sup-2',
    supplierName: 'Global Paper Co',
    amount: 22000, // ₹2,000 variance
    subtotal: 18644.07,
    tax: 3355.93,
    discount: 0,
    currency: 'INR',
    invoiceDate: '2026-09-01',
    status: 'review',
    paymentStatus: 'pending',
    riskLevel: 'medium',
    aiStatus: 'PO Mismatch',
    aiRecommendation: 'Price variance detected against PO.',
    items: [],
    aiChecks: [{ id: 'po-check', title: '3-Way PO Match', passed: false, type: 'warning', detail: 'Amount variance: ₹2,000' }],
  });

  const doc2 = await DocumentModel.create({
    id: `doc-2-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: 'test-user',
    originalFileName: 'inv-002.pdf',
    fileName: 'inv-002.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    documentType: 'invoice',
    storagePath: '/mock/inv-002.pdf',
    storageReference: `ref-2-${Date.now()}`,
    processingStatus: 'processed',
    extractionStatus: 'extracted',
    linkedRecordId: inv2.id,
    matchResult: {
      poNumber: 'PO-TEST-002',
      matchStatus: 'mismatch',
      matchScore: 70,
      matchedFields: ['PO Number', 'Supplier'],
      discrepancies: ['TOTAL_MISMATCH: ₹2,000 variance'],
    },
  });

  const res2 = mockRes();
  await acceptPOVariance(mockReq({ id: 'PO-TEST-002' }, { invoiceId: inv2.id }), res2);
  if (res2.statusCode !== 200 || !res2.body?.success) {
    throw new Error(`FAILED Test 2: ${res2.body?.message}`);
  }

  const updatedDoc2: any = await DocumentModel.findOne({ id: doc2.id });
  if (updatedDoc2?.matchResult?.matchStatus !== 'matched' || updatedDoc2?.matchResult?.originalMatchScore !== 70) {
    throw new Error('FAILED Test 2: Reconciliation info or original score was not preserved');
  }
  console.log('   ✅ Passed Test 2: Mismatched invoice updated, existing score/fields preserved.\n');

  // -------------------------------------------------------------------------
  // TEST 3: CRITICAL BUG REPRODUCTION - Document where matchResult is NULL
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 3] CRITICAL BUG TEST: Document where matchResult is literally NULL...');
  const po3 = await PurchaseOrderModel.create({
    id: `po-3-${Date.now()}`,
    companyId: testCompanyId,
    poNumber: 'PO-2026-TEST-001',
    supplierId: 'sup-3',
    supplierName: 'Industrial Parts Inc',
    totalAmount: 150000,
    issuedDate: '2026-09-01',
    status: 'mismatch',
    matchStatus: 'mismatch',
    items: [],
  });

  const inv3 = await InvoiceModel.create({
    id: `inv-3-${Date.now()}`,
    companyId: testCompanyId,
    invoiceNumber: 'INV-TEST-018',
    poNumber: 'PO-2026-TEST-001',
    supplierId: 'sup-3',
    supplierName: 'Industrial Parts Inc',
    amount: 155000,
    subtotal: 131355.93,
    tax: 23644.07,
    discount: 0,
    currency: 'INR',
    invoiceDate: '2026-09-01',
    status: 'review',
    paymentStatus: 'pending',
    riskLevel: 'medium',
    aiStatus: 'PO Mismatch',
    aiRecommendation: 'Price variance detected against PO.',
    items: [],
    aiChecks: [{ id: 'po-check', title: '3-Way PO Match', passed: false, type: 'warning', detail: 'PO amount mismatch' }],
  });

  // Specifically create a PO document AND Invoice document with matchResult: null
  const poDoc3: any = await DocumentModel.create({
    id: `doc-po3-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: 'test-user',
    originalFileName: 'po-001.pdf',
    fileName: 'po-001.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    documentType: 'purchase_order',
    storagePath: '/mock/po-001.pdf',
    storageReference: `ref-po3-${Date.now()}`,
    processingStatus: 'processed',
    extractionStatus: 'extracted',
    linkedRecordId: po3.id,
    matchResult: null as any, // <--- THIS USED TO CRASH WITH: Cannot create field 'matchScore' in element {matchResult: null}
  });

  const invDoc3: any = await DocumentModel.create({
    id: `doc-inv3-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: 'test-user',
    originalFileName: 'inv-018.pdf',
    fileName: 'inv-018.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    documentType: 'invoice',
    storagePath: '/mock/inv-018.pdf',
    storageReference: `ref-inv3-${Date.now()}`,
    processingStatus: 'processed',
    extractionStatus: 'extracted',
    linkedRecordId: inv3.id,
    matchResult: null as any, // <--- ALSO NULL
  });

  const res3 = mockRes();
  await acceptPOVariance(mockReq({ id: 'PO-2026-TEST-001' }, { invoiceId: inv3.id }), res3);
  if (res3.statusCode !== 200 || !res3.body?.success) {
    throw new Error(`FAILED Test 3: Still crashed on matchResult: null with error: ${res3.body?.message}`);
  }

  // Verify that matchResult is no longer null and has a valid shape
  const updatedPoDoc3: any = await DocumentModel.findOne({ id: poDoc3.id });
  const updatedInvDoc3: any = await DocumentModel.findOne({ id: invDoc3.id });
  if (!updatedPoDoc3?.matchResult || updatedPoDoc3.matchResult.matchStatus !== 'matched') {
    throw new Error('FAILED Test 3: PO Document matchResult was not safely converted from null to matched object');
  }
  if (!updatedInvDoc3?.matchResult || updatedInvDoc3.matchResult.matchStatus !== 'matched') {
    throw new Error('FAILED Test 3: Invoice Document matchResult was not safely converted from null to matched object');
  }
  console.log('   ✅ Passed Test 3: Handled matchResult: null without throwing! Valid object created.\n');

  // -------------------------------------------------------------------------
  // TEST 4: Document where matchResult is undefined/missing
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 4] Document where matchResult is undefined/missing...');
  const po4 = await PurchaseOrderModel.create({
    id: `po-4-${Date.now()}`,
    companyId: testCompanyId,
    poNumber: 'PO-TEST-004',
    supplierId: 'sup-4',
    supplierName: 'Delta Logistics',
    totalAmount: 30000,
    issuedDate: '2026-09-01',
    status: 'mismatch',
    matchStatus: 'mismatch',
    items: [],
  });

  const inv4 = await InvoiceModel.create({
    id: `inv-4-${Date.now()}`,
    companyId: testCompanyId,
    invoiceNumber: 'INV-TEST-004',
    poNumber: 'PO-TEST-004',
    supplierId: 'sup-4',
    supplierName: 'Delta Logistics',
    amount: 32000,
    subtotal: 27118.64,
    tax: 4881.36,
    discount: 0,
    currency: 'INR',
    invoiceDate: '2026-09-01',
    status: 'review',
    paymentStatus: 'pending',
    riskLevel: 'medium',
    aiStatus: 'PO Mismatch',
    aiRecommendation: 'Price variance detected against PO.',
    items: [],
    aiChecks: [],
  });

  const doc4 = await DocumentModel.create({
    id: `doc-4-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: 'test-user',
    originalFileName: 'inv-004.pdf',
    fileName: 'inv-004.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    documentType: 'invoice',
    storagePath: '/mock/inv-004.pdf',
    storageReference: `ref-4-${Date.now()}`,
    processingStatus: 'processed',
    extractionStatus: 'extracted',
    linkedRecordId: inv4.id,
    // matchResult omitted entirely (undefined)
  });

  const res4 = mockRes();
  await acceptPOVariance(mockReq({ id: 'PO-TEST-004' }, { invoiceId: inv4.id }), res4);
  if (res4.statusCode !== 200 || !res4.body?.success) {
    throw new Error(`FAILED Test 4: ${res4.body?.message}`);
  }

  const updatedDoc4 = await DocumentModel.findOne({ id: doc4.id });
  if (!updatedDoc4?.matchResult || updatedDoc4.matchResult.matchStatus !== 'matched') {
    throw new Error('FAILED Test 4: Undefined matchResult was not initialized');
  }
  console.log('   ✅ Passed Test 4: Undefined matchResult handled safely.\n');

  // -------------------------------------------------------------------------
  // TEST 5 & 6: Accept Variance persists after re-query (simulating page refresh)
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 5 & 6] Verifying persistence across queries (refresh simulation)...');
  const freshPO = await PurchaseOrderModel.findOne({ id: po3.id });
  const freshInv = await InvoiceModel.findOne({ id: inv3.id });

  if (
    freshPO?.matchStatus !== 'matched' ||
    freshPO?.status !== 'matched' ||
    freshPO?.get('varianceAccepted') !== true ||
    freshInv?.status !== 'ready' ||
    freshInv?.aiStatus !== 'Variance Accepted' ||
    freshInv?.paymentStatus !== 'scheduled'
  ) {
    throw new Error('FAILED Test 5 & 6: Changes were not persisted to database');
  }
  console.log('   ✅ Passed Test 5 & 6: Accept variance state successfully persisted in MongoDB.\n');

  // -------------------------------------------------------------------------
  // TEST 7: Re-open does not revert to mismatch
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 7] Verifying PO does not revert to mismatch...');
  const recheckPO = await PurchaseOrderModel.findOne({ poNumber: 'PO-2026-TEST-001' });
  if (recheckPO?.matchStatus !== 'matched' || recheckPO?.varianceAccepted !== true) {
    throw new Error('FAILED Test 7: Re-checked PO reverted to mismatch');
  }
  console.log('   ✅ Passed Test 7: PO maintains matched status.\n');

  // -------------------------------------------------------------------------
  // TEST 8: Amounts remain correct
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 8] Verifying PO amount, invoice amount, and variance remain intact...');
  if (freshPO.totalAmount !== 150000 || freshInv.amount !== 155000) {
    throw new Error('FAILED Test 8: Financial totals were corrupted');
  }
  const varianceAmt = freshInv.amount - freshPO.totalAmount;
  if (varianceAmt !== 5000) {
    throw new Error('FAILED Test 8: Variance amount changed');
  }
  console.log(`   Financial values intact: PO ₹${freshPO.totalAmount}, Inv ₹${freshInv.amount}, Variance ₹${varianceAmt}`);
  console.log('   ✅ Passed Test 8: Financial amounts intact.\n');

  // -------------------------------------------------------------------------
  // TEST 9: Request Clarification still functions
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 9] Request Clarification functionality...');
  const resClarify = mockRes();
  await requestPOClarification(mockReq({ id: 'PO-2026-TEST-001' }, { invoiceId: inv3.id, reason: 'Pricing discrepancy' }), resClarify);
  if (resClarify.statusCode !== 200 || !resClarify.body?.success) {
    throw new Error(`FAILED Test 9: ${resClarify.body?.message}`);
  }
  const clarifiedPO = await PurchaseOrderModel.findOne({ id: po3.id });
  const clarifiedInv = await InvoiceModel.findOne({ id: inv3.id });
  if (clarifiedPO?.matchStatus !== 'mismatch' || clarifiedPO?.get('clarificationRequested') !== true || clarifiedInv?.status !== 'hold') {
    throw new Error('FAILED Test 9: Request clarification did not set hold/mismatch status');
  }
  console.log('   ✅ Passed Test 9: Request clarification placed invoice on hold and reset PO to mismatch.\n');

  // -------------------------------------------------------------------------
  // TEST 10: BUSINESS RULE - Other critical failures are NOT bypassed by Accept Variance
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 10] Business Rule: Invoices with other critical failures (bank changed / math discrepancy) are NOT auto-approved...');
  const poCrit = await PurchaseOrderModel.create({
    id: `po-crit-${Date.now()}`,
    companyId: testCompanyId,
    poNumber: 'PO-CRIT-001',
    supplierId: 'sup-crit',
    supplierName: 'Security Check Vendor',
    totalAmount: 80000,
    issuedDate: '2026-09-01',
    status: 'mismatch',
    matchStatus: 'mismatch',
    items: [],
  });

  const invCrit = await InvoiceModel.create({
    id: `inv-crit-${Date.now()}`,
    companyId: testCompanyId,
    invoiceNumber: 'INV-CRIT-001',
    poNumber: 'PO-CRIT-001',
    supplierId: 'sup-crit',
    supplierName: 'Security Check Vendor',
    amount: 85000,
    subtotal: 72033.90,
    tax: 12966.10,
    discount: 0,
    currency: 'INR',
    invoiceDate: '2026-09-01',
    status: 'critical',
    paymentStatus: 'on_hold',
    riskLevel: 'critical',
    aiStatus: 'Bank Detail Change',
    aiRecommendation: 'Security alert: Bank details changed from vendor profile.',
    bankDetails: {
      accountNumber: '9999999999',
      isChangedFromPrevious: true, // <--- CRITICAL SECURITY ISSUE
    },
    items: [],
    aiChecks: [
      { id: 'check-po', title: '3-Way PO Match', passed: false, type: 'warning', detail: 'PO variance ₹5,000' },
      { id: 'check-bank', title: 'Bank Account Match', passed: false, type: 'critical', detail: 'Bank account changed!' },
    ],
  });

  const resCrit = mockRes();
  await acceptPOVariance(mockReq({ id: 'PO-CRIT-001' }, { invoiceId: invCrit.id }), resCrit);
  if (resCrit.statusCode !== 200 || !resCrit.body?.success) {
    throw new Error(`FAILED Test 10: ${resCrit.body?.message}`);
  }

  const verifiedCritPO = await PurchaseOrderModel.findOne({ id: poCrit.id });
  const verifiedCritInv = await InvoiceModel.findOne({ id: invCrit.id });

  // PO is matched because the variance was accepted
  if (verifiedCritPO?.matchStatus !== 'matched' || verifiedCritPO?.get('varianceAccepted') !== true) {
    throw new Error('FAILED Test 10: PO variance should be accepted');
  }

  // BUT the invoice MUST NOT be marked ready or scheduled! It has a critical bank detail change!
  if (verifiedCritInv?.status === 'ready' || verifiedCritInv?.paymentStatus === 'scheduled') {
    throw new Error('FAILED Test 10: DANGEROUS BYPASS! Invoice with bank details changed was auto-approved/scheduled!');
  }

  if (verifiedCritInv?.status !== 'critical' || verifiedCritInv?.paymentStatus !== 'on_hold') {
    throw new Error(`FAILED Test 10: Expected status critical/on_hold, got ${verifiedCritInv?.status}/${verifiedCritInv?.paymentStatus}`);
  }

  // PO check was marked passed, but bank check MUST STILL BE FAILED
  const bankCheck = (verifiedCritInv.aiChecks || []).find((c: any) => c.id === 'check-bank');
  if (!bankCheck || bankCheck.passed === true) {
    throw new Error('FAILED Test 10: Bank security check was improperly marked as passed!');
  }

  console.log(`   PO Status: ${verifiedCritPO.matchStatus} (Variance Accepted: ${verifiedCritPO.get('varianceAccepted')})`);
  console.log(`   Invoice Status: ${verifiedCritInv.status} (Payment Status: ${verifiedCritInv.paymentStatus}, Bank Check Passed: ${bankCheck.passed})`);
  console.log('   ✅ Passed Test 10: Business rule enforced! Critical bank detail change remains blocked and protected from accidental approval.\n');

  console.log('================================================================');
  console.log('🎉 ALL 10 ACCEPT VARIANCE TESTS PASSED FLAWLESSLY!');
  console.log('================================================================\n');

  await mongoose.disconnect();
}

runAcceptVarianceTestSuite().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
