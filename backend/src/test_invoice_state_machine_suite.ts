import { connectDB } from './config/db.js';
import { InvoiceModel } from './models/Invoice.js';
import { approveInvoice, holdInvoice, updateInvoice, findInvoice } from './controllers/invoiceController.js';

function createMockReqRes(params: any = {}, body: any = {}, user: any = { companyId: 'comp-sm-test', userId: 'usr-sm-1' }) {
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

async function runInvoiceStateMachineSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING INVOICE STATE MACHINE & TERMINAL GUARDS TEST SUITE');
  console.log('================================================================\n');

  await connectDB();
  const testCompanyId = `comp-sm-${Date.now()}`;

  // -------------------------------------------------------------------------
  // TEST 1: Transition 1: READY -> ON_HOLD
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 1] Testing transition: READY -> ON_HOLD...');
  const inv1 = await InvoiceModel.create({
    id: `inv-sm-1-${Date.now()}`,
    companyId: testCompanyId,
    invoiceNumber: 'INV-SM-001',
    supplierId: 'sup-1',
    supplierName: 'Supplier One Pvt Ltd',
    amount: 100000,
    subtotal: 84745,
    tax: 15255,
    discount: 0,
    invoiceDate: '2026-08-31',
    dueDate: '2026-09-30',
    status: 'ready',
    paymentStatus: 'pending',
    riskLevel: 'low',
    aiStatus: 'Ready',
    aiRecommendation: 'Invoice ready for review.',
    items: [],
  });

  const { req: req1, res: res1 } = createMockReqRes(
    { id: inv1.id },
    { note: 'Discrepancy observed' },
    { companyId: testCompanyId, userId: 'usr-1' }
  );

  await holdInvoice(req1, res1);
  const code1 = res1.getStatusCode();
  const data1 = res1.getResponseData();

  console.log(`   Status code: ${code1}, Response success: ${data1?.success}, Invoice status: ${data1?.data?.status}`);
  if (code1 !== 200 || !data1?.success || data1?.data?.status !== 'hold') {
    throw new Error(`FAILED Test 1: Expected status=hold, received ${data1?.data?.status}`);
  }

  // Verify directly from MongoDB
  const saved1 = await findInvoice(testCompanyId, inv1.id);
  if (saved1?.status !== 'hold' || saved1?.paymentStatus !== 'on_hold') {
    throw new Error(`FAILED Test 1: MongoDB status mismatch. Expected hold, got ${saved1?.status}`);
  }
  console.log('   ✅ Passed Test 1: READY successfully transitions to ON_HOLD in DB.\n');

  // -------------------------------------------------------------------------
  // TEST 2: Duplicate Hold on an already ON_HOLD invoice (Idempotent handling)
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 2] Testing duplicate hold on already ON_HOLD invoice...');
  const { req: req2, res: res2 } = createMockReqRes(
    { id: inv1.id },
    {},
    { companyId: testCompanyId, userId: 'usr-1' }
  );

  await holdInvoice(req2, res2);
  const code2 = res2.getStatusCode();
  const data2 = res2.getResponseData();

  console.log(`   Status code: ${code2}, message: "${data2?.message}", status: ${data2?.data?.status}`);
  if (code2 !== 200 || data2?.data?.status !== 'hold') {
    throw new Error('FAILED Test 2: Duplicate hold should succeed idempotently');
  }
  console.log('   ✅ Passed Test 2: Duplicate hold handled idempotently without corrupting record.\n');

  // -------------------------------------------------------------------------
  // TEST 3: Transition 2: ON_HOLD -> APPROVED
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 3] Testing transition: ON_HOLD -> APPROVED...');
  const { req: req3, res: res3 } = createMockReqRes(
    { id: inv1.id },
    {},
    { companyId: testCompanyId, userId: 'usr-1' }
  );

  await approveInvoice(req3, res3);
  const code3 = res3.getStatusCode();
  const data3 = res3.getResponseData();

  console.log(`   Status code: ${code3}, Response success: ${data3?.success}, status: ${data3?.data?.status}`);
  if (code3 !== 200 || !data3?.success || data3?.data?.status !== 'approved') {
    throw new Error(`FAILED Test 3: Expected status=approved, received ${data3?.data?.status}`);
  }

  const saved3 = await findInvoice(testCompanyId, inv1.id);
  if (saved3?.status !== 'approved' || saved3?.aiStatus !== 'Approved') {
    throw new Error(`FAILED Test 3: MongoDB record is not approved. Got ${saved3?.status}`);
  }
  console.log('   ✅ Passed Test 3: ON_HOLD successfully transitions to APPROVED in DB.\n');

  // -------------------------------------------------------------------------
  // TEST 4: Terminal Guard: APPROVED -> ON_HOLD must be REJECTED (HTTP 400)
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 4] Testing terminal guard: APPROVED -> ON_HOLD rejection...');
  const { req: req4, res: res4 } = createMockReqRes(
    { id: inv1.id },
    {},
    { companyId: testCompanyId, userId: 'usr-1' }
  );

  await holdInvoice(req4, res4);
  const code4 = res4.getStatusCode();
  const data4 = res4.getResponseData();

  console.log(`   Status code: ${code4}, Error message: "${data4?.message}"`);
  if (code4 !== 400 || data4?.success !== false) {
    throw new Error(`FAILED Test 4: Expected 400 rejection for putting approved invoice on hold, received ${code4}`);
  }

  // Verify MongoDB status remained approved
  const saved4 = await findInvoice(testCompanyId, inv1.id);
  if (saved4?.status !== 'approved') {
    throw new Error(`FAILED Test 4: MongoDB status was corrupted! Got ${saved4?.status}`);
  }
  console.log('   ✅ Passed Test 4: APPROVED -> ON_HOLD was strictly rejected with 400 and state remained APPROVED.\n');

  // -------------------------------------------------------------------------
  // TEST 5: Terminal Guard: APPROVED -> READY via updateInvoice must be REJECTED (HTTP 400)
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 5] Testing terminal guard: APPROVED -> READY reversion rejection...');
  const { req: req5, res: res5 } = createMockReqRes(
    { id: inv1.id },
    { status: 'ready' },
    { companyId: testCompanyId, userId: 'usr-1' }
  );

  await updateInvoice(req5, res5);
  const code5 = res5.getStatusCode();
  const data5 = res5.getResponseData();

  console.log(`   Status code: ${code5}, Error message: "${data5?.message}"`);
  if (code5 !== 400 || data5?.success !== false) {
    throw new Error(`FAILED Test 5: Expected 400 rejection for reverting approved invoice to ready, received ${code5}`);
  }

  const saved5 = await findInvoice(testCompanyId, inv1.id);
  if (saved5?.status !== 'approved') {
    throw new Error(`FAILED Test 5: MongoDB status was corrupted! Got ${saved5?.status}`);
  }
  console.log('   ✅ Passed Test 5: APPROVED -> READY reversion was strictly rejected with 400.\n');

  // -------------------------------------------------------------------------
  // TEST 6: Duplicate Approval on already APPROVED invoice (Idempotent handling)
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 6] Testing duplicate approval on already APPROVED invoice...');
  const { req: req6, res: res6 } = createMockReqRes(
    { id: inv1.id },
    {},
    { companyId: testCompanyId, userId: 'usr-1' }
  );

  await approveInvoice(req6, res6);
  const code6 = res6.getStatusCode();
  const data6 = res6.getResponseData();

  console.log(`   Status code: ${code6}, message: "${data6?.message}", status: ${data6?.data?.status}`);
  if (code6 !== 200 || data6?.data?.status !== 'approved') {
    throw new Error('FAILED Test 6: Duplicate approval should succeed idempotently');
  }
  console.log('   ✅ Passed Test 6: Duplicate approval handled idempotently and remained APPROVED.\n');

  // -------------------------------------------------------------------------
  // TEST 7: Transition 3: Direct READY -> APPROVED
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 7] Testing direct transition: READY -> APPROVED...');
  const inv2 = await InvoiceModel.create({
    id: `inv-sm-2-${Date.now()}`,
    companyId: testCompanyId,
    invoiceNumber: 'INV-SM-002',
    supplierId: 'sup-2',
    supplierName: 'Supplier Two Pvt Ltd',
    amount: 250000,
    subtotal: 211864,
    tax: 38136,
    discount: 0,
    invoiceDate: '2026-08-31',
    dueDate: '2026-09-30',
    status: 'ready',
    paymentStatus: 'pending',
    riskLevel: 'low',
    aiStatus: 'Ready',
    aiRecommendation: 'Invoice ready for review.',
    items: [],
  });

  const { req: req7, res: res7 } = createMockReqRes(
    { id: inv2.invoiceNumber }, // Lookup by human-readable invoiceNumber
    {},
    { companyId: testCompanyId, userId: 'usr-1' }
  );

  await approveInvoice(req7, res7);
  const code7 = res7.getStatusCode();
  const data7 = res7.getResponseData();

  console.log(`   Status code: ${code7}, status: ${data7?.data?.status}`);
  if (code7 !== 200 || data7?.data?.status !== 'approved') {
    throw new Error('FAILED Test 7: Direct approval failed');
  }

  const saved7 = await findInvoice(testCompanyId, inv2.id);
  if (saved7?.status !== 'approved') {
    throw new Error('FAILED Test 7: Direct approval not persisted in MongoDB');
  }
  console.log('   ✅ Passed Test 7: Direct READY -> APPROVED verified in MongoDB.\n');

  console.log('================================================================');
  console.log('🎉 ALL INVOICE STATE MACHINE TESTS PASSED (7/7)!');
  console.log('================================================================\n');

  process.exit(0);
}

runInvoiceStateMachineSuite().catch((err) => {
  console.error('❌ State machine test failed:', err);
  process.exit(1);
});
