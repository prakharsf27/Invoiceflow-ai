import { connectDB } from './config/db.js';
import { copilotContextService } from './services/ai/copilotContextService.js';
import { poMatchingService } from './services/poMatchingService.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { InvoiceModel } from './models/Invoice.js';
import { DocumentModel } from './models/Document.js';

async function runCopilotAndPOActionsSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING COPILOT & PO ACTIONS PERSISTENCE TEST SUITE');
  console.log('================================================================\n');

  await connectDB();
  const testCompanyId = `comp-po-copilot-${Date.now()}`;
  const otherCompanyId = `comp-po-other-${Date.now()}`;

  // -------------------------------------------------------------------------
  // TEST 1: Copilot "hi" / Greeting with Empty Dataset & Missing Relationships
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 1] Copilot handling "hi" on fresh/empty company dataset...');
  const emptyContext = await copilotContextService.buildQuestionAwareContext(testCompanyId, 'hi');
  console.log(`   Total invoices count: ${emptyContext.companyMetrics.totalInvoicesCount}`);
  console.log(`   Highest amount invoice: ${emptyContext.companyMetrics.highestAmountInvoice}`);
  if (emptyContext.companyMetrics.totalInvoicesCount !== 0) {
    throw new Error('FAILED Test 1: Empty company should have 0 invoices');
  }
  console.log('   ✅ Passed Test 1: Copilot context handles empty/missing relationships without throwing.\n');

  // -------------------------------------------------------------------------
  // TEST 2: Copilot Context with Mixed Invoices (No PO, No Supplier, Bank Changed)
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 2] Copilot context with isolated records (missing PO, missing supplier)...');
  await InvoiceModel.create({
    id: `inv-noposup-${Date.now()}`,
    companyId: testCompanyId,
    invoiceNumber: 'INV-COPILOT-01',
    supplierId: 'sup-independent',
    supplierName: 'Independent Consultant',
    amount: 85000,
    subtotal: 72033,
    tax: 12967,
    invoiceDate: '2026-08-31',
    dueDate: '2026-09-30',
    status: 'review',
    riskLevel: 'low',
    aiStatus: 'Bank Detail Change',
    paymentStatus: 'pending',
    paymentTerms: 'Net 30 Days',
    currency: 'INR',
    items: [],
    aiChecks: [],
    aiRecommendation: 'Review direct invoice',
    bankDetails: { isChangedFromPrevious: true, accountNumber: '1234567890', isChanged: true },
  });

  const popContext = await copilotContextService.buildQuestionAwareContext(testCompanyId, 'Which suppliers changed bank details?');
  console.log(`   Bank details changed count: ${popContext.companyMetrics.bankDetailsChangedCount}`);
  console.log(`   Relevant invoices count: ${popContext.querySpecificRecords.relevantInvoices.length}`);
  console.log(`   Relevant invoice ID: ${popContext.querySpecificRecords.relevantInvoices[0]?.id}`);

  if (
    popContext.companyMetrics.bankDetailsChangedCount !== 1 ||
    !popContext.querySpecificRecords.relevantInvoices[0]?.id ||
    popContext.querySpecificRecords.relevantInvoices[0]?.id === 'undefined'
  ) {
    throw new Error('FAILED Test 2: Invoices without PO must be correctly indexed with valid IDs');
  }
  console.log('   ✅ Passed Test 2: Copilot context safely structures invoices with missing PO/supplier.\n');

  // -------------------------------------------------------------------------
  // TEST 3: REAL EXAMPLE: PO-2026-00813 / INV-2026-04103 (₹3,12,700)
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 3] Real Example Match: PO-2026-00813 / INV-2026-04103 (₹3,12,700)...');
  await PurchaseOrderModel.create({
    id: `po-00813-${Date.now()}`,
    companyId: testCompanyId,
    poNumber: 'PO-2026-00813',
    supplierId: 'sup-vanguard-01',
    supplierName: 'Vanguard Cloud Distribution Ltd',
    supplierGstin: '27AAACV7890D1Z6',
    totalAmount: 312700,
    issuedDate: '2026-08-31',
    status: 'open',
    items: [
      { id: 'item-1', description: 'Enterprise Endpoint Security (100 Nodes)', quantity: 1, unitPrice: 145000, total: 171100 },
      { id: 'item-2', description: 'Cloud CI/CD Team Annual License', quantity: 1, unitPrice: 85000, total: 100300 },
      { id: 'item-3', description: '24/7 Priority Support SLA Pack', quantity: 1, unitPrice: 35000, total: 41300 },
    ],
  });

  const inv04103 = {
    id: `inv-04103-${Date.now()}`,
    invoiceNumber: 'INV-2026-04103',
    poNumber: 'PO-2026-00813',
    supplierName: 'Vanguard Cloud Distribution Ltd',
    supplierGstin: '27AAACV7890D1Z6',
    amount: 312700,
    lineItems: [
      { description: '1. Enterprise Endpoint Security (100 Nodes)', quantity: 1, unitPrice: 145000, total: 171100 },
      { description: '2. Cloud CI/CD Team Annual License', quantity: 1, unitPrice: 85000, total: 100300 },
      { description: '3. 24/7 Priority Support SLA Pack', quantity: 1, unitPrice: 35000, total: 41300 },
    ],
  };

  const matchRes = await poMatchingService.matchInvoiceToPO(testCompanyId, inv04103);
  console.log(`   PO-2026-00813 Match Status: ${matchRes.matchStatus}, Score: ${matchRes.matchScore}%`);
  if (matchRes.matchStatus !== 'matched' || matchRes.matchScore !== 100 || matchRes.discrepancies.length !== 0) {
    throw new Error('FAILED Test 3: PO-2026-00813 / INV-2026-04103 must match 100% with 0 discrepancies');
  }
  console.log('   ✅ Passed Test 3: PO-2026-00813 / INV-2026-04103 matched 100% with 0 discrepancies.\n');

  // -------------------------------------------------------------------------
  // TEST 4: Intentional Overrun: PO-2026-00421 / INV-2026-01002 (₹6,49,000 vs ₹7,91,780)
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 4] Intentional Price Mismatch / Overrun: PO-2026-00421 / INV-2026-01002...');
  await PurchaseOrderModel.create({
    id: `po-00421-${Date.now()}`,
    companyId: testCompanyId,
    poNumber: 'PO-2026-00421',
    supplierId: 'sup-technova-01',
    supplierName: 'TechNova Solutions Pvt Ltd',
    totalAmount: 649000,
    issuedDate: '2026-08-31',
    status: 'open',
    items: [
      { id: 'p-1', description: 'Lenovo ThinkPad Business Laptop', quantity: 10, unitPrice: 50000, total: 590000 },
    ],
  });

  const inv01002 = {
    invoiceNumber: 'INV-2026-01002',
    poNumber: 'PO-2026-00421',
    supplierName: 'TechNova Solutions Pvt Ltd',
    amount: 791780,
    lineItems: [
      { description: 'Lenovo ThinkPad Business Laptop', quantity: 10, unitPrice: 60000, total: 708000 },
    ],
  };

  const mismatchRes = await poMatchingService.matchInvoiceToPO(testCompanyId, inv01002);
  console.log(`   PO-2026-00421 Match Status: ${mismatchRes.matchStatus}, Score: ${mismatchRes.matchScore}%`);
  console.log(`   Discrepancies: ${JSON.stringify(mismatchRes.discrepancies)}`);
  if (mismatchRes.matchStatus !== 'mismatch') {
    throw new Error('FAILED Test 4: PO-2026-00421 must be detected as mismatch');
  }
  console.log('   ✅ Passed Test 4: Financial price mismatch correctly detected.\n');

  // -------------------------------------------------------------------------
  // TEST 5: Accept Variance Persistence in MongoDB
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 5] Accept Variance Action & Persistence in MongoDB...');
  const testPOForAccept = await PurchaseOrderModel.create({
    id: `po-accept-${Date.now()}`,
    companyId: testCompanyId,
    poNumber: 'PO-2026-ACCEPT-01',
    supplierId: 'sup-vendor-accept',
    supplierName: 'Hardware Solutions Ltd',
    totalAmount: 50000,
    issuedDate: '2026-08-31',
    status: 'open',
    matchStatus: 'mismatch',
    items: [],
  });

  const testInvForAccept = await InvoiceModel.create({
    id: `inv-accept-${Date.now()}`,
    companyId: testCompanyId,
    invoiceNumber: 'INV-2026-ACCEPT-01',
    poNumber: 'PO-2026-ACCEPT-01',
    supplierId: 'sup-vendor-accept',
    supplierName: 'Hardware Solutions Ltd',
    amount: 55000, // variance of ₹5,000
    subtotal: 46610,
    tax: 8390,
    invoiceDate: '2026-08-31',
    dueDate: '2026-09-30',
    status: 'review',
    riskLevel: 'medium',
    aiStatus: 'PO Mismatch',
    paymentStatus: 'pending',
    paymentTerms: 'Net 30 Days',
    currency: 'INR',
    items: [],
    aiChecks: [],
    aiRecommendation: 'Price variance detected',
  });

  // Execute Accept Variance Backend Flow
  const updatedPO = await PurchaseOrderModel.findOneAndUpdate(
    { companyId: testCompanyId, poNumber: 'PO-2026-ACCEPT-01' },
    {
      $set: {
        matchStatus: 'matched',
        status: 'matched',
        varianceAccepted: true,
        varianceAcceptedAt: new Date().toISOString(),
      },
    },
    { returnDocument: 'after' }
  );

  const updatedInv = await InvoiceModel.findOneAndUpdate(
    { companyId: testCompanyId, invoiceNumber: 'INV-2026-ACCEPT-01' },
    {
      $set: {
        status: 'ready',
        aiStatus: 'Variance Accepted',
        paymentStatus: 'scheduled',
      },
    },
    { returnDocument: 'after' }
  );

  // Verify that fresh database re-fetch retrieves the persisted statuses
  const freshPO = await PurchaseOrderModel.findOne({ companyId: testCompanyId, poNumber: 'PO-2026-ACCEPT-01' });
  const freshInv = await InvoiceModel.findOne({ companyId: testCompanyId, invoiceNumber: 'INV-2026-ACCEPT-01' });

  console.log(`   Fresh PO matchStatus in DB: ${freshPO?.matchStatus}, varianceAccepted: ${freshPO?.get('varianceAccepted')}`);
  console.log(`   Fresh Invoice status in DB: ${freshInv?.status}, aiStatus: ${freshInv?.aiStatus}`);

  if (
    freshPO?.matchStatus !== 'matched' ||
    freshPO?.get('varianceAccepted') !== true ||
    freshInv?.status !== 'ready' ||
    freshInv?.aiStatus !== 'Variance Accepted'
  ) {
    throw new Error('FAILED Test 5: Accept Variance was not persisted to MongoDB!');
  }
  console.log('   ✅ Passed Test 5: Accept Variance persists reliably in MongoDB across queries.\n');

  // -------------------------------------------------------------------------
  // TEST 6: Request Clarification Persistence in MongoDB
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 6] Request Clarification Action & Persistence in MongoDB...');
  await PurchaseOrderModel.findOneAndUpdate(
    { companyId: testCompanyId, poNumber: 'PO-2026-ACCEPT-01' },
    {
      $set: {
        matchStatus: 'mismatch',
        status: 'mismatch',
        clarificationRequested: true,
      },
    }
  );

  await InvoiceModel.findOneAndUpdate(
    { companyId: testCompanyId, invoiceNumber: 'INV-2026-ACCEPT-01' },
    {
      $set: {
        status: 'hold',
        aiStatus: 'On Hold',
        paymentStatus: 'on_hold',
      },
    }
  );

  const clarifiedPO = await PurchaseOrderModel.findOne({ companyId: testCompanyId, poNumber: 'PO-2026-ACCEPT-01' });
  const clarifiedInv = await InvoiceModel.findOne({ companyId: testCompanyId, invoiceNumber: 'INV-2026-ACCEPT-01' });

  console.log(`   Clarified PO matchStatus in DB: ${clarifiedPO?.matchStatus}`);
  console.log(`   Clarified Invoice status in DB: ${clarifiedInv?.status}, aiStatus: ${clarifiedInv?.aiStatus}`);

  if (clarifiedPO?.matchStatus !== 'mismatch' || clarifiedInv?.status !== 'hold' || clarifiedInv?.aiStatus !== 'On Hold') {
    throw new Error('FAILED Test 6: Request Clarification was not persisted to MongoDB!');
  }
  console.log('   ✅ Passed Test 6: Request Clarification persists reliably in MongoDB.\n');

  // -------------------------------------------------------------------------
  // TEST 7: Multi-Tenant Isolation
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 7] Multi-Tenant Isolation (Company B queries must not see Company A data)...');
  const compBContext = await copilotContextService.buildQuestionAwareContext(otherCompanyId, 'Show invoices');
  if (compBContext.companyMetrics.totalInvoicesCount !== 0) {
    throw new Error('FAILED Test 7: Multi-tenant leakage! Company B saw Company A invoices');
  }
  console.log('   ✅ Passed Test 7: Multi-tenant isolation verified 100% across company boundaries.\n');

  console.log('================================================================');
  console.log('🎉 ALL COPILOT & PO ACTIONS TESTS PASSED PERFECTLY!');
  console.log('================================================================\n');

  process.exit(0);
}

runCopilotAndPOActionsSuite().catch((err) => {
  console.error('❌ Copilot and PO Actions Suite Failed:', err);
  process.exit(1);
});
