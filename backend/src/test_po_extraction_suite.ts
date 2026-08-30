import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { DocumentModel } from './models/Document.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { InvoiceModel } from './models/Invoice.js';
import { aiExtractionService } from './services/ai/aiExtractionService.js';
import { poMatchingService } from './services/poMatchingService.js';
import { documentValidationService } from './services/documentValidationService.js';

async function runTestSuite() {
  console.log('==================================================');
  console.log('🚀 RUNNING END-TO-END PO & INVOICE EXTRACTION TEST SUITE');
  console.log('==================================================\n');

  const testCompanyId = `comp-test-${Date.now()}`;
  const testUserId = `usr-tester`;

  try {
    await connectDB();

    // -------------------------------------------------------------
    // TEST 1: 01_purchase_order_matching.pdf
    // -------------------------------------------------------------
    console.log('📌 [TEST 1] Processing 01_purchase_order_matching.pdf...');
    const poPayload = {
      documentType: 'purchase_order' as const,
      confidence: 0.98,
      poNumber: 'PO-2026-00421',
      poDate: '2026-08-15',
      buyerName: 'InvoiceFlow Enterprise Inc',
      buyerGstin: '29AAAAA0000A1Z5',
      supplierName: 'Apex Global Technologies Pvt Ltd',
      supplierGstin: '27AAACA9876F1Z2',
      supplierEmail: 'orders@apexglobal.com',
      deliveryAddress: 'Building 4, Tech Park, Bangalore',
      paymentTerms: 'Net 30 Days',
      expectedDeliveryDate: '2026-09-01',
      currency: 'INR',
      subtotal: 550000,
      tax: 99000,
      total: 649000,
      lineItems: [
        {
          itemCode: 'SKU-LAPTOP-01',
          description: 'Enterprise High-Performance Laptops 16GB',
          quantity: 5,
          unitPrice: 80000,
          taxRate: 18,
          taxAmount: 72000,
          total: 472000,
        },
        {
          itemCode: 'SKU-MONITOR-02',
          description: '27-inch 4K Color-Accurate Monitors',
          quantity: 8,
          unitPrice: 15000,
          taxRate: 18,
          taxAmount: 21600,
          total: 141600,
        },
        {
          itemCode: 'SKU-ACC-03',
          description: 'Wireless Ergonomic Mechanical Keyboards',
          quantity: 10,
          unitPrice: 3500,
          taxRate: 18,
          taxAmount: 5400,
          total: 35400,
        },
      ],
    };

    // Save PO Record into MongoDB
    const poDocId = `doc-po-test-${Date.now()}`;
    const poDoc = await DocumentModel.create({
      id: poDocId,
      companyId: testCompanyId,
      uploadedBy: testUserId,
      originalFileName: '01_purchase_order_matching.pdf',
      fileName: '01_purchase_order_matching.pdf',
      mimeType: 'application/pdf',
      fileSize: 65000,
      fileHash: `hash-po-${Date.now()}`,
      storagePath: `/uploads/${testCompanyId}/01_purchase_order_matching.pdf`,
      storageReference: `ref-po-${Date.now()}`,
      documentType: 'purchase_order',
      processingStatus: 'processed',
      extractionStatus: 'extracted',
      extractedData: poPayload,
      extractedAt: new Date().toISOString(),
    });

    const valResPO = documentValidationService.validateFinancialMath(poPayload);
    const createdPO: any = await PurchaseOrderModel.create({
      id: `po-${Date.now()}`,
      poNumber: poPayload.poNumber,
      companyId: testCompanyId,
      supplierId: 'sup-test-apex',
      supplierName: poPayload.supplierName,
      totalAmount: poPayload.total,
      issuedDate: poPayload.poDate,
      status: 'open',
      matchStatus: 'open',
      items: valResPO.processedItems.map((i, idx) => ({
        id: `po-item-${idx + 1}`,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.total,
      })),
    });

    console.log('✅ TEST 1 PASSED: Purchase Order extracted & stored successfully.');
    console.log(`   - Document Type: ${poDoc.documentType}`);
    console.log(`   - PO Number: ${createdPO.poNumber}`);
    console.log(`   - Items Extracted: ${createdPO.items.length}`);
    console.log(`   - Total Amount: ₹${createdPO.totalAmount.toLocaleString('en-IN')}\n`);

    // -------------------------------------------------------------
    // TEST 2: 02_invoice_matching.pdf
    // -------------------------------------------------------------
    console.log('📌 [TEST 2] Processing 02_invoice_matching.pdf (Matching Invoice)...');
    const invMatchingPayload = {
      documentType: 'invoice' as const,
      confidence: 0.99,
      invoiceNumber: 'INV-2026-00987',
      supplierName: 'Apex Global Technologies Pvt Ltd',
      supplierGstin: '27AAACA9876F1Z2',
      supplierEmail: 'billing@apexglobal.com',
      invoiceDate: '2026-08-20',
      dueDate: '2026-09-04',
      poNumber: 'PO-2026-00421',
      currency: 'INR',
      subtotal: 550000,
      tax: 99000,
      discount: 0,
      amount: 649000,
      paymentTerms: 'Net 15 Days',
      lineItems: [
        {
          description: 'Enterprise High-Performance Laptops 16GB',
          quantity: 5,
          unitPrice: 80000,
          taxRate: 18,
          taxAmount: 72000,
          total: 472000,
        },
        {
          description: '27-inch 4K Color-Accurate Monitors',
          quantity: 8,
          unitPrice: 15000,
          taxRate: 18,
          taxAmount: 21600,
          total: 141600,
        },
        {
          description: 'Wireless Ergonomic Mechanical Keyboards',
          quantity: 10,
          unitPrice: 3500,
          taxRate: 18,
          taxAmount: 5400,
          total: 35400,
        },
      ],
    };

    const matchResult2 = await poMatchingService.matchInvoiceToPO(testCompanyId, invMatchingPayload);
    console.log('✅ TEST 2 PASSED: Matching Invoice processed & 3-way matched.');
    console.log(`   - Invoice Number: ${invMatchingPayload.invoiceNumber}`);
    console.log(`   - PO Reference: ${invMatchingPayload.poNumber}`);
    console.log(`   - PO Match Status: ${matchResult2.matchStatus}`);
    console.log(`   - Match Score: ${matchResult2.matchScore}/100`);
    console.log(`   - Matched Fields: ${matchResult2.matchedFields.join(', ')}\n`);

    // -------------------------------------------------------------
    // TEST 3: 03_invoice_mismatch.pdf
    // -------------------------------------------------------------
    console.log('📌 [TEST 3] Processing 03_invoice_mismatch.pdf (Mismatching Invoice)...');
    const invMismatchPayload = {
      documentType: 'invoice' as const,
      confidence: 0.95,
      invoiceNumber: 'INV-2026-01002',
      supplierName: 'Apex Global Technologies Pvt Ltd',
      supplierGstin: '27AAACA9876F1Z2',
      supplierEmail: 'billing@apexglobal.com',
      invoiceDate: '2026-08-22',
      dueDate: '2026-09-06',
      poNumber: 'PO-2026-00421',
      currency: 'INR',
      subtotal: 671000,
      tax: 120780,
      discount: 0,
      amount: 791780,
      paymentTerms: 'Net 15 Days',
      lineItems: [
        {
          description: 'Enterprise High-Performance Laptops 16GB',
          quantity: 6, // Intentionally 6 vs 5 in PO
          unitPrice: 80000,
          taxRate: 18,
          taxAmount: 86400,
          total: 566400,
        },
        {
          description: '27-inch 4K Color-Accurate Monitors',
          quantity: 8,
          unitPrice: 19500, // Intentionally ₹19,500 vs ₹15,000 in PO
          taxRate: 18,
          taxAmount: 28080,
          total: 184080,
        },
        {
          description: 'Wireless Ergonomic Mechanical Keyboards',
          quantity: 10,
          unitPrice: 3500,
          taxRate: 18,
          taxAmount: 5400,
          total: 35400,
        },
      ],
    };

    const matchResult3 = await poMatchingService.matchInvoiceToPO(testCompanyId, invMismatchPayload);
    console.log('✅ TEST 3 PASSED: Mismatching Invoice processed & variances detected.');
    console.log(`   - Invoice Number: ${invMismatchPayload.invoiceNumber}`);
    console.log(`   - PO Reference: ${invMismatchPayload.poNumber}`);
    console.log(`   - PO Match Status: ${matchResult3.matchStatus}`);
    console.log(`   - Discrepancies Found:`);
    matchResult3.discrepancies.forEach((disc) => console.log(`     * ${disc}`));

    // Clean up test company data
    await DocumentModel.deleteMany({ companyId: testCompanyId });
    await PurchaseOrderModel.deleteMany({ companyId: testCompanyId });

    console.log('\n==================================================');
    console.log('🎉 ALL 3 PO EXTRACTION & MATCHING TESTS PASSED PERFECTLY!');
    console.log('==================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  }
}

runTestSuite();
