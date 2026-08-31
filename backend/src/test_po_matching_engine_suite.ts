import { connectDB } from './config/db.js';
import { poMatchingService, POMatchingNormalizer } from './services/poMatchingService.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';

async function runPOMatchingEngineSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING COMPREHENSIVE PO MATCHING ENGINE REGRESSION SUITE');
  console.log('================================================================\n');

  await connectDB();
  const companyId = `comp-po-match-${Date.now()}`;

  // -------------------------------------------------------------------------
  // TEST 1: PERFECT MATCH
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 1] Perfect Match (Same supplier, Same PO, Same items, Same totals)...');
  await PurchaseOrderModel.create({
    id: `po-rec-1-${Date.now()}`,
    companyId,
    poNumber: 'PO-2026-PERFECT-01',
    supplierId: 'sup-perfect',
    supplierName: 'Apex Cloud Solutions Pvt Ltd',
    supplierGstin: '27AADCA1234M1Z2',
    totalAmount: 118000,
    issuedDate: '2026-08-31',
    status: 'open',
    items: [
      {
        id: 'item-1',
        description: 'Cloud Server Instance',
        quantity: 2,
        unitPrice: 50000,
        total: 118000,
      },
    ],
  });

  const invoice1 = {
    invoiceNumber: 'INV-2026-PERFECT-01',
    poNumber: 'PO-2026-PERFECT-01',
    supplierName: 'Apex Cloud Solutions Pvt Ltd',
    supplierGstin: '27AADCA1234M1Z2',
    amount: 118000,
    lineItems: [
      {
        description: 'Cloud Server Instance',
        quantity: 2,
        unitPrice: 50000,
        taxRate: 18,
        taxAmount: 18000,
        total: 118000,
      },
    ],
  };

  const res1 = await poMatchingService.matchInvoiceToPO(companyId, invoice1);
  console.log(`   Result 1: status="${res1.matchStatus}", score=${res1.matchScore}%, discrepancies=${res1.discrepancies.length}`);
  if (res1.matchStatus !== 'matched' || res1.matchScore !== 100 || res1.discrepancies.length !== 0) {
    throw new Error('FAILED Test 1: Perfect match must return status="matched", score=100%, discrepancies=0');
  }
  console.log('   ✅ Passed Test 1: 100% Match with zero variance.\n');

  // -------------------------------------------------------------------------
  // TEST 2: PRICE MISMATCH
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 2] Price Mismatch (PO unit price = ₹60,000, Invoice unit price = ₹63,000)...');
  await PurchaseOrderModel.create({
    id: `po-rec-2-${Date.now()}`,
    companyId,
    poNumber: 'PO-2026-PRICE-02',
    supplierId: 'sup-price',
    supplierName: 'Delta Electronics Pvt Ltd',
    totalAmount: 70800,
    issuedDate: '2026-08-31',
    status: 'open',
    items: [
      {
        id: 'item-2',
        description: 'Enterprise Router 24-Port',
        quantity: 1,
        unitPrice: 60000,
        total: 70800,
      },
    ],
  });

  const invoice2 = {
    invoiceNumber: 'INV-2026-PRICE-02',
    poNumber: 'PO-2026-PRICE-02',
    supplierName: 'Delta Electronics Pvt Ltd',
    amount: 74340,
    lineItems: [
      {
        description: 'Enterprise Router 24-Port',
        quantity: 1,
        unitPrice: 63000,
        taxRate: 18,
        taxAmount: 11340,
        total: 74340,
      },
    ],
  };

  const res2 = await poMatchingService.matchInvoiceToPO(companyId, invoice2);
  console.log(`   Result 2: status="${res2.matchStatus}", score=${res2.matchScore}%, discrepancies=${JSON.stringify(res2.discrepancies)}`);
  const hasPriceMismatch = res2.discrepancies.some((d) => d.includes('PRICE_MISMATCH') || d.includes('unit price variance'));
  if (res2.matchStatus !== 'mismatch' || !hasPriceMismatch) {
    throw new Error('FAILED Test 2: Price mismatch must return status="mismatch" and explicit price discrepancy');
  }
  console.log('   ✅ Passed Test 2: Price mismatch correctly detected.\n');

  // -------------------------------------------------------------------------
  // TEST 3: QUANTITY MISMATCH
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 3] Quantity Mismatch (PO qty = 10, Invoice qty = 12)...');
  await PurchaseOrderModel.create({
    id: `po-rec-3-${Date.now()}`,
    companyId,
    poNumber: 'PO-2026-QTY-03',
    supplierId: 'sup-qty',
    supplierName: 'Alpha Cables Ltd',
    totalAmount: 11800,
    issuedDate: '2026-08-31',
    status: 'open',
    items: [
      {
        id: 'item-3',
        description: 'Patch Cord 2m',
        quantity: 10,
        unitPrice: 1000,
        total: 11800,
      },
    ],
  });

  const invoice3 = {
    invoiceNumber: 'INV-2026-QTY-03',
    poNumber: 'PO-2026-QTY-03',
    supplierName: 'Alpha Cables Ltd',
    amount: 14160,
    lineItems: [
      {
        description: 'Patch Cord 2m',
        quantity: 12,
        unitPrice: 1000,
        taxRate: 18,
        taxAmount: 2160,
        total: 14160,
      },
    ],
  };

  const res3 = await poMatchingService.matchInvoiceToPO(companyId, invoice3);
  console.log(`   Result 3: status="${res3.matchStatus}", score=${res3.matchScore}%, discrepancies=${JSON.stringify(res3.discrepancies)}`);
  const hasQtyMismatch = res3.discrepancies.some((d) => d.includes('QUANTITY_MISMATCH') || d.includes('quantity variance'));
  if (res3.matchStatus !== 'mismatch' || !hasQtyMismatch) {
    throw new Error('FAILED Test 3: Quantity mismatch must return status="mismatch" and explicit quantity discrepancy');
  }
  console.log('   ✅ Passed Test 3: Quantity mismatch correctly detected.\n');

  // -------------------------------------------------------------------------
  // TEST 4: TOTAL MISMATCH
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 4] Total Amount Mismatch (PO total = ₹100,000, Invoice total = ₹105,000)...');
  await PurchaseOrderModel.create({
    id: `po-rec-4-${Date.now()}`,
    companyId,
    poNumber: 'PO-2026-TOTAL-04',
    supplierId: 'sup-tot',
    supplierName: 'Sigma Networks Pvt Ltd',
    totalAmount: 100000,
    issuedDate: '2026-08-31',
    status: 'open',
    items: [
      {
        id: 'item-4',
        description: 'Managed Network SLA',
        quantity: 1,
        unitPrice: 100000,
        total: 100000,
      },
    ],
  });

  const invoice4 = {
    invoiceNumber: 'INV-2026-TOTAL-04',
    poNumber: 'PO-2026-TOTAL-04',
    supplierName: 'Sigma Networks Pvt Ltd',
    amount: 105000,
    lineItems: [
      {
        description: 'Managed Network SLA',
        quantity: 1,
        unitPrice: 105000,
        total: 105000,
      },
    ],
  };

  const res4 = await poMatchingService.matchInvoiceToPO(companyId, invoice4);
  console.log(`   Result 4: status="${res4.matchStatus}", score=${res4.matchScore}%, discrepancies=${JSON.stringify(res4.discrepancies)}`);
  const hasTotalMismatch = res4.discrepancies.some((d) => d.includes('TOTAL_MISMATCH') || d.includes('Total amount variance'));
  if (res4.matchStatus !== 'mismatch' || !hasTotalMismatch) {
    throw new Error('FAILED Test 4: Total mismatch must return status="mismatch" and explicit total discrepancy');
  }
  console.log('   ✅ Passed Test 4: Total amount mismatch correctly detected.\n');

  // -------------------------------------------------------------------------
  // TEST 5: SUPPLIER MISMATCH
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 5] Supplier Mismatch (Different supplier on invoice vs PO)...');
  await PurchaseOrderModel.create({
    id: `po-rec-5-${Date.now()}`,
    companyId,
    poNumber: 'PO-2026-SUP-05',
    supplierId: 'sup-orig',
    supplierName: 'Original Vendor Pvt Ltd',
    totalAmount: 50000,
    issuedDate: '2026-08-31',
    status: 'open',
    items: [
      {
        id: 'item-5',
        description: 'IT Consulting Support',
        quantity: 1,
        unitPrice: 50000,
        total: 50000,
      },
    ],
  });

  const invoice5 = {
    invoiceNumber: 'INV-2026-SUP-05',
    poNumber: 'PO-2026-SUP-05',
    supplierName: 'Completely Fraudulent Vendor LLC',
    amount: 50000,
    lineItems: [
      {
        description: 'IT Consulting Support',
        quantity: 1,
        unitPrice: 50000,
        total: 50000,
      },
    ],
  };

  const res5 = await poMatchingService.matchInvoiceToPO(companyId, invoice5);
  console.log(`   Result 5: status="${res5.matchStatus}", score=${res5.matchScore}%, discrepancies=${JSON.stringify(res5.discrepancies)}`);
  const hasSupplierMismatch = res5.discrepancies.some((d) => d.includes('SUPPLIER_MISMATCH'));
  if (res5.matchStatus !== 'mismatch' || !hasSupplierMismatch) {
    throw new Error('FAILED Test 5: Supplier mismatch must return status="mismatch" and SUPPLIER_MISMATCH discrepancy');
  }
  console.log('   ✅ Passed Test 5: Supplier mismatch correctly detected.\n');

  // -------------------------------------------------------------------------
  // TEST 6: FORMATTING DIFFERENCES
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 6] Formatting Differences (PO total = "₹3,12,700", Invoice total = "312700")...');
  await PurchaseOrderModel.create({
    id: `po-rec-6-${Date.now()}`,
    companyId,
    poNumber: 'PO-2026-FMT-06',
    supplierId: 'sup-fmt',
    supplierName: 'Vanguard Cloud Distribution Ltd',
    totalAmount: 312700,
    issuedDate: '2026-08-31',
    status: 'open',
    items: [
      {
        id: 'item-6',
        description: '1. Enterprise Endpoint Security (100 Nodes)',
        quantity: 1,
        unitPrice: 145000,
        total: 171100,
      },
    ],
  });

  const invoice6 = {
    invoiceNumber: 'INV-2026-FMT-06',
    poNumber: 'PO-2026-FMT-06',
    supplierName: 'Vanguard Cloud Distribution Pvt Ltd', // Slight suffix difference
    amount: '₹3,12,700', // Formatted currency string
    lineItems: [
      {
        description: 'Enterprise Endpoint Security (100 Nodes)', // Numbering stripped
        quantity: '1', // String quantity
        unitPrice: '₹1,45,000', // Formatted string price
        taxRate: '18%',
        total: '171100',
      },
    ],
  };

  const res6 = await poMatchingService.matchInvoiceToPO(companyId, invoice6);
  console.log(`   Result 6: status="${res6.matchStatus}", score=${res6.matchScore}%, discrepancies=${res6.discrepancies.length}`);
  if (res6.matchStatus !== 'matched' || res6.matchScore !== 100) {
    throw new Error(`FAILED Test 6: Formatted values must be normalized cleanly to 100% matched, got status=${res6.matchStatus}, score=${res6.matchScore}%`);
  }
  console.log('   ✅ Passed Test 6: Formatting differences normalized to 100% MATCH.\n');

  // -------------------------------------------------------------------------
  // TEST 7: REAL PRODUCTION BUG: PO-2026-00813 / INV-2026-04103
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 7] REAL PRODUCTION CASE: PO-2026-00813 / INV-2026-04103...');
  await PurchaseOrderModel.create({
    id: `po-rec-7-${Date.now()}`,
    companyId,
    poNumber: 'PO-2026-00813',
    supplierId: 'sup-vanguard-00813',
    supplierName: 'Vanguard Cloud Distribution Ltd',
    supplierGstin: '27AAACV7890D1Z6',
    totalAmount: 312700,
    issuedDate: '2026-08-31',
    status: 'open',
    items: [
      {
        id: 'po-item-1',
        description: 'Enterprise Endpoint Security (100 Nodes)',
        quantity: 1,
        unitPrice: 145000,
        total: 171100,
      },
      {
        id: 'po-item-2',
        description: 'Cloud CI/CD Team Annual License',
        quantity: 1,
        unitPrice: 85000,
        total: 100300,
      },
      {
        id: 'po-item-3',
        description: '24/7 Priority Support SLA Pack',
        quantity: 1,
        unitPrice: 35000,
        total: 41300,
      },
    ],
  });

  const invoice7 = {
    id: 'inv-real-04103',
    invoiceNumber: 'INV-2026-04103',
    poNumber: 'PO-2026-00813',
    supplierName: 'Vanguard Cloud Distribution Ltd',
    supplierGstin: '27AAACV7890D1Z6',
    amount: 312700,
    subtotal: 265000,
    tax: 47700,
    lineItems: [
      {
        description: '1. Enterprise Endpoint Security (100 Nodes)',
        quantity: 1,
        unitPrice: 145000,
        taxRate: 18,
        taxAmount: 26100,
        total: 171100,
      },
      {
        description: '2. Cloud CI/CD Team Annual License',
        quantity: 1,
        unitPrice: 85000,
        taxRate: 18,
        taxAmount: 15300,
        total: 100300,
      },
      {
        description: '3. 24/7 Priority Support SLA Pack',
        quantity: 1,
        unitPrice: 35000,
        taxRate: 18,
        taxAmount: 6300,
        total: 41300,
      },
    ],
  };

  const res7 = await poMatchingService.matchInvoiceToPO(companyId, invoice7);
  console.log(`   Result 7: status="${res7.matchStatus}", score=${res7.matchScore}%, discrepancies=${res7.discrepancies.length}`);
  console.log(`   Matched Fields: ${res7.matchedFields.join(', ')}`);

  if (res7.matchStatus !== 'matched' || res7.matchScore !== 100 || res7.discrepancies.length !== 0) {
    throw new Error(`FAILED Test 7: PO-2026-00813 / INV-2026-04103 must return status="matched", score=100%, discrepancies=0, got status=${res7.matchStatus}, score=${res7.matchScore}%, discrepancies=${JSON.stringify(res7.discrepancies)}`);
  }
  console.log('   ✅ Passed Test 7: PO-2026-00813 / INV-2026-04103 matched 100% with 0 discrepancies!\n');

  // -------------------------------------------------------------------------
  // TEST 8: SECOND REAL PRODUCTION CASE: PO-2026-00814 / INV-2026-04104
  // -------------------------------------------------------------------------
  console.log('📌 [TEST 8] SECOND REAL PRODUCTION CASE: PO-2026-00814 / INV-2026-04104 (₹2,59,600)...');
  await PurchaseOrderModel.create({
    id: `po-rec-8-${Date.now()}`,
    companyId,
    poNumber: 'PO-2026-00814',
    supplierId: 'sup-vanguard-00814',
    supplierName: 'Vanguard Cloud Distribution Ltd',
    supplierGstin: '27AAACV7890D1Z6',
    totalAmount: 259600,
    issuedDate: '2026-08-31',
    status: 'open',
    items: [
      {
        id: 'po-item-81',
        description: 'Managed Kubernetes Cluster Dedicated Node',
        quantity: 2,
        unitPrice: 110000,
        total: 259600,
      },
    ],
  });

  const invoice8 = {
    id: 'inv-real-04104',
    invoiceNumber: 'INV-2026-04104',
    poNumber: 'PO-2026-00814',
    supplierName: 'Vanguard Cloud Distribution Ltd',
    supplierGstin: '27AAACV7890D1Z6',
    amount: 259600,
    subtotal: 220000,
    tax: 39600,
    lineItems: [
      {
        description: 'Managed Kubernetes Cluster Dedicated Node',
        quantity: 2,
        unitPrice: 110000,
        taxRate: 18,
        taxAmount: 39600,
        total: 259600,
      },
    ],
  };

  const res8 = await poMatchingService.matchInvoiceToPO(companyId, invoice8);
  console.log(`   Result 8: status="${res8.matchStatus}", score=${res8.matchScore}%, discrepancies=${res8.discrepancies.length}`);

  if (res8.matchStatus !== 'matched' || res8.matchScore !== 100 || res8.discrepancies.length !== 0) {
    throw new Error(`FAILED Test 8: PO-2026-00814 / INV-2026-04104 must return status="matched", score=100%`);
  }
  console.log('   ✅ Passed Test 8: PO-2026-00814 / INV-2026-04104 matched 100% with 0 discrepancies!\n');

  console.log('================================================================');
  console.log('🎉 ALL 8 PO MATCHING ENGINE REGRESSION TESTS PASSED PERFECTLY!');
  console.log('================================================================\n');

  process.exit(0);
}

runPOMatchingEngineSuite().catch((err) => {
  console.error('❌ PO Matching Engine Suite Failed:', err);
  process.exit(1);
});
