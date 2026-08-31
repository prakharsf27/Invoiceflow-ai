import { connectDB } from './config/db.js';
import { InvoiceModel } from './models/Invoice.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { PaymentModel } from './models/Payment.js';
import { DocumentModel } from './models/Document.js';
import { approveInvoice, holdInvoice, updateInvoice, getInvoiceById } from './controllers/invoiceController.js';
import { acceptPOVariance, requestPOClarification, getPOById } from './controllers/purchaseOrderController.js';

// Mock Express Request and Response
function createMockReqRes(params: any = {}, body: any = {}, user: any = { companyId: 'comp-workflow-test', userId: 'usr-1' }) {
  const req: any = {
    params,
    body,
    user,
    headers: {},
  };

  let statusCode = 200;
  let responseData: any = null;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseData = data;
      return res;
    },
    getStatusCode() {
      return statusCode;
    },
    getResponseData() {
      return responseData;
    },
  };

  return { req, res };
}

async function runInvoiceWorkflowPersistenceSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING INVOICE WORKFLOW & DATABASE PERSISTENCE TEST SUITE');
  console.log('================================================================\n');

  await connectDB();
  const testCompanyId = `comp-workflow-${Date.now()}`;

  // Seed test records
  const seedInvoice = await InvoiceModel.create({
    id: `inv-real-04103-${Date.now()}`,
    companyId: testCompanyId,
    invoiceNumber: 'INV-2026-04103',
    supplierId: 'sup-vanguard-01',
    supplierName: 'Vanguard Cloud Distribution Ltd',
    amount: 312700,
    subtotal: 265000,
    tax: 47700,
    discount: 0,
    invoiceDate: '2026-08-31',
    dueDate: '2026-09-30',
    poNumber: 'PO-2026-00813',
    status: 'review',
    paymentStatus: 'pending',
    riskLevel: 'medium',
    aiStatus: 'Needs Review',
    items: [
      { id: 'it-1', description: 'Enterprise Endpoint Security', quantity: 1, unitPrice: 145000, taxRate: 18, taxAmount: 26100, total: 171100 },
      { id: 'it-2', description: 'Cloud CI/CD Team Annual License', quantity: 1, unitPrice: 85000, taxRate: 18, taxAmount: 15300, total: 100300 },
      { id: 'it-3', description: '24/7 Priority Support SLA Pack', quantity: 1, unitPrice: 35000, taxRate: 18, taxAmount: 6300, total: 41300 },
    ],
    aiChecks: [
      { id: 'chk-1', title: 'Line Item Math', passed: true, type: 'success', detail: 'Math verified' },
      { id: 'chk-2', title: 'PO Association', passed: false, type: 'warning', detail: 'Pending manual approval' },
    ],
    aiRecommendation: 'Review and approve invoice.',
  });

  const seedPO = await PurchaseOrderModel.create({
    id: `po-real-00813-${Date.now()}`,
    companyId: testCompanyId,
    poNumber: 'PO-2026-00813',
    supplierId: 'sup-vanguard-01',
    supplierName: 'Vanguard Cloud Distribution Ltd',
    totalAmount: 312700,
    issuedDate: '2026-08-31',
    status: 'open',
    matchStatus: 'mismatch',
    items: [],
  });

  const seedDoc: any = await DocumentModel.create({
    id: `doc-real-04103-${Date.now()}`,
    companyId: testCompanyId,
    uploadedBy: 'usr-1',
    originalFileName: 'INV-2026-04103.pdf',
    fileName: 'stored-04103.pdf',
    storagePath: `uploads/stored-04103-${Date.now()}.pdf`,
    storageReference: `local-storage-ref-${Date.now()}`,
    fileSize: 1024,
    mimeType: 'application/pdf',
    fileHash: `hash-${Date.now()}`,
    documentType: 'invoice',
    processingStatus: 'processed',
    extractionStatus: 'extracted',
    linkedRecordId: seedInvoice.id,
    extractedData: {
      invoiceNumber: 'INV-2026-04103',
      poNumber: 'PO-2026-00813',
      supplierName: 'Vanguard Cloud Distribution Ltd',
      amount: 312700,
    },
    matchResult: {
      matchStatus: 'mismatch',
      matchScore: 60,
      matchedFields: [],
      discrepancies: ['Initial review pending'],
    },
  });

  console.log(`   Seeded Invoice: ${seedInvoice.invoiceNumber} (${seedInvoice.id})`);
  console.log(`   Seeded PO: ${seedPO.poNumber} (${seedPO.id})`);
  console.log(`   Seeded Doc: ${seedDoc.originalFileName} (${seedDoc.id})\n`);

  // -------------------------------------------------------------------------
  // TEST 1: Approve existing invoice (INV-2026-04103)
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 1] Testing approveInvoice endpoint with existing invoice...');
  const { req: req1, res: res1 } = createMockReqRes(
    { id: 'INV-2026-04103' },
    {},
    { companyId: testCompanyId, userId: 'usr-admin' }
  );

  await approveInvoice(req1, res1);
  const code1 = res1.getStatusCode();
  const data1 = res1.getResponseData();

  console.log(`   Status code: ${code1}`);
  console.log(`   Response success: ${data1?.success}, message: "${data1?.message}"`);
  console.log(`   Returned invoice status: ${data1?.data?.status}, paymentStatus: ${data1?.data?.paymentStatus}, aiStatus: ${data1?.data?.aiStatus}`);

  if (code1 !== 200 || !data1?.success || data1?.data?.status !== 'ready' || data1?.data?.paymentStatus !== 'scheduled') {
    throw new Error(`FAILED Test 1: Expected 200 with status="ready", received code=${code1}`);
  }

  // Verify payment record was created / synchronized in MongoDB
  const paymentInDb = await PaymentModel.findOne({ companyId: testCompanyId, invoiceNumber: 'INV-2026-04103' });
  console.log(`   Payment record in MongoDB: status=${paymentInDb?.status}, amount=₹${paymentInDb?.amount}`);
  if (!paymentInDb || paymentInDb.status !== 'scheduled') {
    throw new Error('FAILED Test 1: Payment record was not created/scheduled in MongoDB');
  }
  console.log('   ✅ Passed Test 1: Invoice approval succeeds, updates fields and creates scheduled payment.\n');

  // -------------------------------------------------------------------------
  // TEST 2: Refresh/re-fetch invoice directly from database
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 2] Testing database persistence across fresh query (Simulating browser refresh)...');
  const freshInv = await InvoiceModel.findOne({ companyId: testCompanyId, invoiceNumber: 'INV-2026-04103' });
  console.log(`   Fresh Invoice in DB: status=${freshInv?.status}, paymentStatus=${freshInv?.paymentStatus}, aiStatus=${freshInv?.aiStatus}, riskLevel=${freshInv?.riskLevel}`);
  console.log(`   All AI Checks passed: ${freshInv?.aiChecks?.every((c) => c.passed)}`);

  if (
    freshInv?.status !== 'ready' ||
    freshInv?.paymentStatus !== 'scheduled' ||
    freshInv?.aiStatus !== 'Approved' ||
    !freshInv?.aiChecks?.every((c) => c.passed)
  ) {
    throw new Error('FAILED Test 2: Database record does not retain approved state on fresh query');
  }
  console.log('   ✅ Passed Test 2: Database persistence verified 100% across fresh queries.\n');

  // -------------------------------------------------------------------------
  // TEST 3: Accept PO variance (PO-2026-00813)
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 3] Testing acceptPOVariance endpoint...');
  const { req: req3, res: res3 } = createMockReqRes(
    { id: 'PO-2026-00813' },
    { invoiceId: seedInvoice.id },
    { companyId: testCompanyId, userId: 'usr-admin' }
  );

  await acceptPOVariance(req3, res3);
  const code3 = res3.getStatusCode();
  const data3 = res3.getResponseData();

  console.log(`   Status code: ${code3}`);
  console.log(`   Response success: ${data3?.success}, message: "${data3?.message}"`);
  console.log(`   PO matchStatus: ${data3?.data?.purchaseOrder?.matchStatus}, varianceAccepted: ${data3?.data?.purchaseOrder?.varianceAccepted}`);
  console.log(`   Linked Invoice status: ${data3?.data?.invoice?.status}, aiStatus: ${data3?.data?.invoice?.aiStatus}`);

  if (code3 !== 200 || !data3?.success || data3?.data?.purchaseOrder?.matchStatus !== 'matched') {
    throw new Error(`FAILED Test 3: Expected 200 with matchStatus="matched", received code=${code3}`);
  }
  console.log('   ✅ Passed Test 3: Accept PO variance endpoint successfully executed.\n');

  // -------------------------------------------------------------------------
  // TEST 4: Refresh/re-fetch PO & Document from database
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 4] Testing PO & Document database persistence across fresh query...');
  const freshPO = await PurchaseOrderModel.findOne({ companyId: testCompanyId, poNumber: 'PO-2026-00813' });
  const freshDoc = await DocumentModel.findOne({ companyId: testCompanyId, id: seedDoc.id });

  console.log(`   Fresh PO in DB: matchStatus=${freshPO?.matchStatus}, status=${freshPO?.status}, varianceAccepted=${freshPO?.get('varianceAccepted')}`);
  console.log(`   Fresh Doc in DB: matchStatus=${freshDoc?.matchResult?.matchStatus}, matchScore=${freshDoc?.matchResult?.matchScore}`);

  if (
    freshPO?.matchStatus !== 'matched' ||
    freshPO?.get('varianceAccepted') !== true ||
    freshDoc?.matchResult?.matchStatus !== 'matched'
  ) {
    throw new Error('FAILED Test 4: PO or Document did not persist matched status in MongoDB');
  }
  console.log('   ✅ Passed Test 4: PO and Document persistence verified 100% in MongoDB.\n');

  // -------------------------------------------------------------------------
  // TEST 5: Invalid Invoice ID error handling
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 5] Testing error handling with non-existent invoice ID...');
  const { req: req5, res: res5 } = createMockReqRes(
    { id: 'INV-NON-EXISTENT-99999' },
    {},
    { companyId: testCompanyId, userId: 'usr-admin' }
  );

  await approveInvoice(req5, res5);
  const code5 = res5.getStatusCode();
  const data5 = res5.getResponseData();

  console.log(`   Status code: ${code5}, message: "${data5?.message}"`);
  if (code5 !== 404 || data5?.success !== false) {
    throw new Error(`FAILED Test 5: Expected 404 for invalid invoice ID, received code=${code5}`);
  }
  console.log('   ✅ Passed Test 5: Non-existent invoice returns proper 404 error without false success.\n');

  // -------------------------------------------------------------------------
  // TEST 6: Invalid PO ID error handling
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 6] Testing error handling with non-existent PO ID...');
  const { req: req6, res: res6 } = createMockReqRes(
    { id: 'PO-NON-EXISTENT-99999' },
    {},
    { companyId: testCompanyId, userId: 'usr-admin' }
  );

  await acceptPOVariance(req6, res6);
  const code6 = res6.getStatusCode();
  const data6 = res6.getResponseData();

  console.log(`   Status code: ${code6}, message: "${data6?.message}"`);
  if (code6 !== 404 || data6?.success !== false) {
    throw new Error(`FAILED Test 6: Expected 404 for invalid PO ID, received code=${code6}`);
  }
  console.log('   ✅ Passed Test 6: Non-existent PO returns proper 404 error without false success.\n');

  // -------------------------------------------------------------------------
  // TEST 7: Request Clarification endpoint & database persistence
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 7] Testing requestPOClarification and hold status persistence...');
  const { req: req7, res: res7 } = createMockReqRes(
    { id: 'PO-2026-00813' },
    { invoiceId: seedInvoice.id, reason: 'Discrepancy in SLA license rate' },
    { companyId: testCompanyId, userId: 'usr-admin' }
  );

  await requestPOClarification(req7, res7);
  const code7 = res7.getStatusCode();
  const data7 = res7.getResponseData();

  console.log(`   Status code: ${code7}, message: "${data7?.message}"`);
  const clarifiedPO = await PurchaseOrderModel.findOne({ companyId: testCompanyId, poNumber: 'PO-2026-00813' });
  const clarifiedInv = await InvoiceModel.findOne({ companyId: testCompanyId, invoiceNumber: 'INV-2026-04103' });

  console.log(`   Clarified PO in DB: matchStatus=${clarifiedPO?.matchStatus}, clarificationRequested=${clarifiedPO?.get('clarificationRequested')}`);
  console.log(`   Clarified Invoice in DB: status=${clarifiedInv?.status}, aiStatus=${clarifiedInv?.aiStatus}, paymentStatus=${clarifiedInv?.paymentStatus}`);

  if (
    clarifiedPO?.matchStatus !== 'mismatch' ||
    clarifiedPO?.get('clarificationRequested') !== true ||
    clarifiedInv?.status !== 'hold' ||
    clarifiedInv?.paymentStatus !== 'on_hold'
  ) {
    throw new Error('FAILED Test 7: Request clarification did not place records on hold in MongoDB');
  }
  console.log('   ✅ Passed Test 7: Request Clarification places PO and Invoice on hold in MongoDB.\n');

  console.log('================================================================');
  console.log('🎉 ALL INVOICE WORKFLOW & PERSISTENCE TESTS PASSED (7/7)!');
  console.log('================================================================\n');

  process.exit(0);
}

runInvoiceWorkflowPersistenceSuite().catch((err) => {
  console.error('❌ Invoice Workflow & Persistence Suite Failed:', err);
  process.exit(1);
});
