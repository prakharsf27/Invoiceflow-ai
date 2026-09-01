import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { deterministicParserService } from './services/extraction/deterministicParserService.js';
import { NormalizationHelper } from './services/extraction/normalizationHelper.js';
import { ExtractionQualityEvaluator } from './services/extraction/extractionQualityEvaluator.js';
import { poMatchingService } from './services/poMatchingService.js';
import { documentProcessingService } from './services/documentProcessingService.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { SupplierModel } from './models/Supplier.js';
import { DocumentModel } from './models/Document.js';

let mongod: MongoMemoryServer | null = null;

async function setupDB() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
}

async function teardownDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
  }
}

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${description}`);
    passedCount++;
  } else {
    console.error(`  ❌ [FAIL] ${description}`);
    failedCount++;
  }
}

async function runRealOCRIntegritySuite() {
  console.log('\n================================================================');
  console.log('  REAL-WORLD OCR EXTRACTION & DATA INTEGRITY TEST SUITE (14 SCENARIOS)');
  console.log('================================================================\n');

  await setupDB();

  const companyId = `comp-${Date.now()}`;
  const userId = `user-${Date.now()}`;

  // Seed baseline PO in database for matching tests
  await PurchaseOrderModel.create({
    id: `po-${Date.now()}`,
    companyId,
    poNumber: 'PO-2026-TEST-001',
    supplierId: 'sup-apex',
    supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
    supplierGstin: '27AAECA1234F1Z5',
    totalAmount: 118000,
    issuedDate: '2026-08-15',
    items: [
      {
        id: 'item-1',
        description: 'Cloud Infrastructure Services',
        quantity: 10,
        unitPrice: 10000,
        total: 118000,
      },
    ],
    status: 'open',
  });

  // -------------------------------------------------------------
  // Scenario 1: Clean Text PDF
  // -------------------------------------------------------------
  console.log('--- Scenario 1: Clean Text PDF ---');
  const cleanPdfText = `
TAX INVOICE
Supplier: Apex Cloud Solutions Pvt. Ltd.
GSTIN: 27AAECA1234F1Z5
Invoice Number: INV-TEST-020
Invoice Date: 2026-09-01
Due Date: 2026-10-01
Purchase Order: PO-2026-TEST-001

Line Items:
Item Description | Qty | Unit Price | Tax Rate | Total
Cloud Infrastructure Services | 10 | 10000 | 18% | 118000

Subtotal: 100000
GST: 18000
Total: 118000
`;
  const res1 = deterministicParserService.parseInvoiceText(cleanPdfText, 'pdf_text');
  assert(res1.data.supplierName === 'Apex Cloud Solutions Pvt. Ltd.', 'Scenario 1: Clean supplier name extracted');
  assert(res1.data.invoiceNumber === 'INV-TEST-020', 'Scenario 1: Clean invoice number extracted');
  assert(res1.data.supplierGstin === '27AAECA1234F1Z5', 'Scenario 1: Clean GSTIN extracted');
  assert(res1.data.poNumber === 'PO-2026-TEST-001', 'Scenario 1: Clean PO number extracted');
  assert(res1.data.lineItems.length === 1, 'Scenario 1: Line items parsed');
  assert(res1.data.amount === 118000, 'Scenario 1: Total amount is 118000');
  assert(res1.quality === 'high', 'Scenario 1: Quality is high with 0 AI fallback');

  // -------------------------------------------------------------
  // Scenario 2: Image-Only PDF Text Layout
  // -------------------------------------------------------------
  console.log('\n--- Scenario 2: Image-Only PDF Layout ---');
  const imagePdfText = `
Apex Cloud Solutions Pvt. Ltd.
27AAECA1234F1Z5
Invoice: INV-TEST-020
Date: 2026-09-01
PO: PO-2026-TEST-001

Cloud Infrastructure Services 10 10000 18% 118000
Subtotal: 100000
GST (18%): 18000
Total: 118000
`;
  const res2 = deterministicParserService.parseInvoiceText(imagePdfText, 'ocr');
  assert(res2.data.supplierName === 'Apex Cloud Solutions Pvt. Ltd.', 'Scenario 2: Supplier extracted');
  assert(res2.data.poNumber === 'PO-2026-TEST-001', 'Scenario 2: PO extracted');
  assert(res2.data.lineItems.length === 1, 'Scenario 2: Line items extracted from collapsed row');
  assert(res2.quality === 'high', 'Scenario 2: Quality is high');

  // -------------------------------------------------------------
  // Scenario 3: PNG Screenshot (Real Scanned Format)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 3: PNG Screenshot (Real Screenshot Format) ---');
  const pngScreenshotText = `
Supplier:
Apex Cloud Solutions Pvt. Ltd.

GSTIN:
27AAECA1234F1Z5

Invoice #:
INV-TEST-020

Invoice Date:
2026-09-01

Due Date:
2026-10-01

PO:
PO-2026-TEST-001

Line item:
Cloud Infrastructure Services
Qty: 10
Unit Price: ₹10,000
Tax: 18%
Total: ₹1,18,000

Subtotal:
₹1,00,000

GST:
₹18,000

Total:
₹1,18,000
`;
  const res3 = deterministicParserService.parseInvoiceText(pngScreenshotText, 'ocr');
  assert(res3.data.supplierName === 'Apex Cloud Solutions Pvt. Ltd.', 'Scenario 3: Supplier is "Apex Cloud Solutions Pvt. Ltd."');
  assert(!res3.data.supplierName?.includes('Invoice Date'), 'Scenario 3: Supplier contains no trailing "Invoice Date"');
  assert(res3.data.supplierGstin === '27AAECA1234F1Z5', 'Scenario 3: GSTIN is "27AAECA1234F1Z5"');
  assert(res3.data.invoiceNumber === 'INV-TEST-020', 'Scenario 3: Invoice number is "INV-TEST-020"');
  assert(res3.data.invoiceDate === '2026-09-01', 'Scenario 3: Invoice date is "2026-09-01"');
  assert(res3.data.poNumber === 'PO-2026-TEST-001', 'Scenario 3: PO is "PO-2026-TEST-001"');
  assert(res3.data.poNumber !== 'PPE', 'Scenario 3: PO is NOT garbage "PPE"');
  assert(res3.data.lineItems.length === 1, 'Scenario 3: 1 line item extracted from vertical layout');
  assert(res3.data.lineItems[0].description === 'Cloud Infrastructure Services', 'Scenario 3: Line item description parsed');
  assert(res3.data.lineItems[0].quantity === 10, 'Scenario 3: Line item qty is 10');
  assert(res3.data.lineItems[0].unitPrice === 10000, 'Scenario 3: Line item price is 10000');
  assert(res3.data.subtotal === 100000, 'Scenario 3: Subtotal is 100000');
  assert(res3.data.tax === 18000, 'Scenario 3: Tax is 18000');
  assert(res3.data.amount === 118000, 'Scenario 3: Total is 118000');
  assert(res3.data.taxRate === 18, 'Scenario 3: Tax Rate is 18%');
  assert(res3.quality === 'high', 'Scenario 3: Extraction quality is high with 0 AI calls');

  // -------------------------------------------------------------
  // Scenario 4: JPG Screenshot Format (INV-TEST-021 Exact Layout)
  // -------------------------------------------------------------
  console.log('\n--- Scenario 4: JPG Screenshot Format (INV-TEST-021) ---');
  const jpgScreenshotText = `
DataCore Industrial Supplies Pvt Ltd
GSTIN: 29AAFCA8912J1ZQ
Invoice Number: INV-TEST-021
Invoice Date: 2026-09-21
Due Date: 2026-10-21
PO: PO-2026-TEST-002

Line item:
Industrial Control Server Nodes
Qty: 11
Unit Price: ₹10,000
Tax: 18%
Total: ₹1,29,800

Subtotal: ₹1,10,000
GST @ 18%: ₹19,800
Total Amount: ₹1,29,800
`;
  const res4 = deterministicParserService.parseInvoiceText(jpgScreenshotText, 'ocr');
  assert(res4.data.supplierName === 'DataCore Industrial Supplies Pvt Ltd', 'Scenario 4: Supplier is DataCore Industrial Supplies Pvt Ltd');
  assert(res4.data.invoiceNumber === 'INV-TEST-021', 'Scenario 4: Invoice Number is INV-TEST-021');
  assert(res4.data.invoiceDate === '2026-09-21', 'Scenario 4: Date parsed as 2026-09-21');
  assert(res4.data.poNumber === 'PO-2026-TEST-002', 'Scenario 4: PO parsed as PO-2026-TEST-002');
  assert(res4.data.subtotal === 110000, 'Scenario 4: Subtotal is 110000');
  assert(res4.data.tax === 19800, 'Scenario 4: Tax is 19800');
  assert(res4.data.amount === 129800, 'Scenario 4: Total is 129800');
  assert(res4.data.taxRate === 18, 'Scenario 4: Tax Rate is 18%');
  assert(res4.data.lineItems.length === 1, 'Scenario 4: 1 Line item parsed');
  assert(res4.quality === 'high', 'Scenario 4: High quality');

  // -------------------------------------------------------------
  // Scenario 5: OCR with Merged Adjacent Lines
  // -------------------------------------------------------------
  console.log('\n--- Scenario 5: OCR with Merged Adjacent Lines ---');
  const mergedLinesText = `
Apex Cloud Solutions Pvt. Ltd. voice Date: 2026-09-01
GSTIN: 27AAECA1234F1Z5 PO: PO-2026-TEST-001
Invoice #: INV-TEST-020 Due Date: 2026-10-01

Line item:
Cloud Infrastructure Services
Qty: 10
Unit Price: ₹10,000
Tax: 18%
Total: ₹1,18,000

Subtotal: ₹1,00,000
GST: ₹18,000
Total: ₹1,18,000
`;
  const res5 = deterministicParserService.parseInvoiceText(mergedLinesText, 'ocr');
  assert(res5.data.supplierName === 'Apex Cloud Solutions Pvt. Ltd.', 'Scenario 5: Clean supplier name extracted without "voice Date"');
  assert(!res5.data.supplierName?.includes('voice Date'), 'Scenario 5: Merged label stripped from supplier');
  assert(res5.data.invoiceDate === '2026-09-01', 'Scenario 5: Invoice date parsed from merged line');
  assert(res5.data.poNumber === 'PO-2026-TEST-001', 'Scenario 5: PO number parsed from merged line');
  assert(res5.data.invoiceNumber === 'INV-TEST-020', 'Scenario 5: Invoice number parsed');
  assert(res5.data.lineItems.length === 1, 'Scenario 5: Line item parsed');
  assert(res5.quality === 'high', 'Scenario 5: High quality');

  // -------------------------------------------------------------
  // Scenario 6: OCR with GSTIN Character Confusion
  // -------------------------------------------------------------
  console.log('\n--- Scenario 6: OCR with GSTIN Character Confusion ---');
  const gstinConfusionText = `
Apex Cloud Solutions Pvt. Ltd.
GSTIN: 27 AAECA 1234 F 1 2 5
Invoice #: INV-TEST-020
Invoice Date: 2026-09-01
PO: PO-2026-TEST-001

Cloud Infrastructure Services | 10 | 10000 | 18% | 118000
Subtotal: 100000
Tax: 18000
Total: 118000
`;
  const res6 = deterministicParserService.parseInvoiceText(gstinConfusionText, 'ocr');
  assert(res6.data.supplierGstin === '27AAECA1234F1Z5', 'Scenario 6: Repaired OCR confusion 2->Z and merged spaced GSTIN');
  assert(NormalizationHelper.isValidGSTIN(res6.data.supplierGstin), 'Scenario 6: Resulting GSTIN is structurally valid');

  // -------------------------------------------------------------
  // Scenario 7: OCR with PO Character Confusion & Anti-Garbage Guard
  // -------------------------------------------------------------
  console.log('\n--- Scenario 7: OCR with PO Character Confusion & Anti-Garbage Guard ---');
  const poConfusionText = `
Apex Cloud Solutions Pvt. Ltd.
GSTIN: 27AAECA1234F1Z5
Invoice #: INV-TEST-020
Invoice Date: 2026-09-01
PO: P0-2026-TEST-001

Cloud Infrastructure Services | 10 | 10000 | 18% | 118000
Subtotal: 100000
Tax: 18000
Total: 118000
`;
  const res7 = deterministicParserService.parseInvoiceText(poConfusionText, 'ocr');
  assert(res7.data.poNumber === 'PO-2026-TEST-001', 'Scenario 7: Repaired P0 -> PO in PO number');

  const garbagePoText = `
Apex Cloud Solutions Pvt. Ltd.
GSTIN: 27AAECA1234F1Z5
Invoice #: INV-TEST-020
Invoice Date: 2026-09-01
PO: PPE

Subtotal: 100000
Tax: 18000
Total: 118000
`;
  const res7b = deterministicParserService.parseInvoiceText(garbagePoText, 'ocr');
  assert(res7b.data.poNumber === null, 'Scenario 7b: Garbage PO "PPE" rejected and set to null');
  assert(res7b.quality === 'incomplete', 'Scenario 7b: Unextracted PO flagged as incomplete quality');
  assert(res7b.missingOrAmbiguousFields.includes('poNumber'), 'Scenario 7b: poNumber listed in missing/ambiguous fields');

  // -------------------------------------------------------------
  // Scenario 8: OCR Where Line-Item Columns Collapse
  // -------------------------------------------------------------
  console.log('\n--- Scenario 8: OCR Where Line-Item Columns Collapse ---');
  const collapsedColumnsText = `
Apex Cloud Solutions Pvt. Ltd.
GSTIN: 27AAECA1234F1Z5
Invoice #: INV-TEST-020
Invoice Date: 2026-09-01
PO: PO-2026-TEST-001

Cloud Infrastructure Services 10.00 10000.00 18% 18000.00 118000.00
Subtotal: 100000.00
Tax: 18000.00
Total: 118000.00
`;
  const res8 = deterministicParserService.parseInvoiceText(collapsedColumnsText, 'ocr');
  assert(res8.data.lineItems.length === 1, 'Scenario 8: Extracted 1 line item from collapsed 5-tail line');
  assert(res8.data.lineItems[0].quantity === 10, 'Scenario 8: Qty is 10');
  assert(res8.data.lineItems[0].unitPrice === 10000, 'Scenario 8: Unit Price is 10000');
  assert(res8.data.lineItems[0].total === 118000, 'Scenario 8: Line total is 118000');

  // -------------------------------------------------------------
  // Scenario 9: Missing PO on Invoice & Fallback Matching Audit
  // -------------------------------------------------------------
  console.log('\n--- Scenario 9: Missing PO on Invoice & Fallback Matching Audit ---');
  const missingPoInvoice = {
    invoiceNumber: 'INV-TEST-020',
    supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
    supplierGstin: '27AAECA1234F1Z5',
    amount: 118000,
    lineItems: [{ description: 'Cloud Infrastructure Services', quantity: 10, unitPrice: 10000, total: 118000 }],
  };
  const matchRes9 = await poMatchingService.matchInvoiceToPO(companyId, missingPoInvoice);
  assert(matchRes9.matchStatus === 'partial_match', 'Scenario 9: Supplier fallback suggestion produces partial_match (not autonomous matched)');
  assert(matchRes9.discrepancies.some((d: string) => d.includes('supplier fallback')), 'Scenario 9: Recorded fallback audit trail reason');

  // -------------------------------------------------------------
  // Scenario 10: Wrong / Mismatched PO
  // -------------------------------------------------------------
  console.log('\n--- Scenario 10: Wrong / Mismatched PO ---');
  const wrongPoInvoice = {
    poNumber: 'PO-999-WRONG-001',
    invoiceNumber: 'INV-TEST-020',
    supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
    supplierGstin: '27AAECA1234F1Z5',
    amount: 118000,
  };
  const matchRes10 = await poMatchingService.matchInvoiceToPO(companyId, wrongPoInvoice);
  assert(matchRes10.matchStatus === 'no_match', 'Scenario 10: Wrong PO returns no_match');
  assert(matchRes10.discrepancies.some((d: string) => d.includes('not found')), 'Scenario 10: Discrepancy logged');

  // -------------------------------------------------------------
  // Scenario 11: Quantity Mismatch
  // -------------------------------------------------------------
  console.log('\n--- Scenario 11: Quantity Mismatch ---');
  const qtyMismatchInvoice = {
    poNumber: 'PO-2026-TEST-001',
    invoiceNumber: 'INV-TEST-020',
    supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
    supplierGstin: '27AAECA1234F1Z5',
    amount: 118000,
    lineItems: [{ description: 'Cloud Infrastructure Services', quantity: 15, unitPrice: 10000, total: 118000 }],
  };
  const matchRes11 = await poMatchingService.matchInvoiceToPO(companyId, qtyMismatchInvoice);
  assert(matchRes11.matchStatus === 'mismatch', 'Scenario 11: Quantity mismatch yields mismatch status');
  assert(matchRes11.discrepancies.some((d: string) => d.includes('QUANTITY_MISMATCH')), 'Scenario 11: QUANTITY_MISMATCH discrepancy logged');

  // -------------------------------------------------------------
  // Scenario 12: Price Mismatch
  // -------------------------------------------------------------
  console.log('\n--- Scenario 12: Price Mismatch ---');
  const priceMismatchInvoice = {
    poNumber: 'PO-2026-TEST-001',
    invoiceNumber: 'INV-TEST-020',
    supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
    supplierGstin: '27AAECA1234F1Z5',
    amount: 140000,
    lineItems: [{ description: 'Cloud Infrastructure Services', quantity: 10, unitPrice: 12000, total: 140000 }],
  };
  const matchRes12 = await poMatchingService.matchInvoiceToPO(companyId, priceMismatchInvoice);
  assert(matchRes12.matchStatus === 'mismatch', 'Scenario 12: Price mismatch yields mismatch status');
  assert(matchRes12.discrepancies.some((d: string) => d.includes('PRICE_MISMATCH')), 'Scenario 12: PRICE_MISMATCH discrepancy logged');

  // -------------------------------------------------------------
  // Scenario 13: Tax Mismatch / Missing Line Items in Itemized Table
  // -------------------------------------------------------------
  console.log('\n--- Scenario 13: Table Evidence Without Line Items ---');
  const tableNoItemsText = `
Apex Cloud Solutions Pvt. Ltd.
Invoice #: INV-TEST-020
Invoice Date: 2026-09-01
PO: PO-2026-TEST-001

Description | Qty | Rate | Tax | Amount
[UNREADABLE BLURRED LINE ROW]

Subtotal: 100000
GST: 18000
Total: 118000
`;
  const res13 = deterministicParserService.parseInvoiceText(tableNoItemsText, 'ocr');
  assert(res13.quality === 'incomplete', 'Scenario 13: Missing line items in itemized table flags incomplete quality');
  assert(res13.missingOrAmbiguousFields.includes('lineItems'), 'Scenario 13: lineItems listed in missing fields');
  assert(res13.needsAI === true, 'Scenario 13: Needs AI fallback / human review');

  // -------------------------------------------------------------
  // Scenario 14: Completely Unreadable Image / Corrupted Payload
  // -------------------------------------------------------------
  console.log('\n--- Scenario 14: Completely Unreadable Image ---');
  const unreadableText = `
###@@@%%%***
~~~###
000
`;
  const res14 = deterministicParserService.parseInvoiceText(unreadableText, 'ocr');
  assert(res14.quality === 'incomplete', 'Scenario 14: Unreadable text quality is incomplete');
  assert(res14.confidence === 0.50, 'Scenario 14: Confidence is low (0.50)');
  assert(res14.needsAI === true, 'Scenario 14: Requires review');

  await teardownDB();

  console.log('\n================================================================');
  console.log(`  FINAL RESULTS: ${passedCount} / ${passedCount + failedCount} PASSED (${Math.round(passedCount / (passedCount + failedCount) * 100)}%)`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runRealOCRIntegritySuite().catch((err) => {
  console.error('Error running test suite:', err);
  process.exit(1);
});
