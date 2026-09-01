import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { deterministicParserService } from './services/extraction/deterministicParserService.js';
import { NormalizationHelper } from './services/extraction/normalizationHelper.js';
import { ExtractionQualityEvaluator } from './services/extraction/extractionQualityEvaluator.js';

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

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    throw new Error(`Assertion failed for: ${testName}`);
  }
}

async function runHeaderTaxIntegritySuite() {
  console.log('================================================================');
  console.log('  INVOICE HEADER TAX & TAX RATE INTEGRITY TEST SUITE');
  console.log('================================================================');

  await setupDB();

  try {
    // -----------------------------------------------------------------
    // TEST 1: Exact Layout for INV-TEST-020
    // -----------------------------------------------------------------
    console.log('\n--- Test 1: INV-TEST-020 Exact Layout ---');
    const inv020Text = `
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
`.trim();

    const res020 = deterministicParserService.parseInvoiceText(inv020Text, 'ocr');
    assert(res020.data.invoiceNumber === 'INV-TEST-020', 'INV-020: Invoice Number extracted');
    assert(res020.data.subtotal === 100000, 'INV-020: Subtotal is 100,000', `got ${res020.data.subtotal}`);
    assert(res020.data.tax === 18000, 'INV-020: Tax is 18,000', `got ${res020.data.tax}`);
    assert(res020.data.amount === 118000, 'INV-020: Total is 118,000', `got ${res020.data.amount}`);
    assert(res020.data.taxRate === 18, 'INV-020: Tax Rate is 18%', `got ${res020.data.taxRate}`);
    assert(res020.quality === 'high', 'INV-020: Quality is HIGH');
    assert(res020.needsAI === false, 'INV-020: 0 AI fallback required');

    // -----------------------------------------------------------------
    // TEST 2: Exact Layout for INV-TEST-021
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: INV-TEST-021 Exact Layout ---');
    const inv021Text = `
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
`.trim();

    const res021 = deterministicParserService.parseInvoiceText(inv021Text, 'ocr');
    assert(res021.data.invoiceNumber === 'INV-TEST-021', 'INV-021: Invoice Number extracted');
    assert(res021.data.subtotal === 110000, 'INV-021: Subtotal is 110,000', `got ${res021.data.subtotal}`);
    assert(res021.data.tax === 19800, 'INV-021: Tax is 19,800', `got ${res021.data.tax}`);
    assert(res021.data.amount === 129800, 'INV-021: Total is 129,800', `got ${res021.data.amount}`);
    assert(res021.data.taxRate === 18, 'INV-021: Tax Rate is 18%', `got ${res021.data.taxRate}`);
    assert(res021.quality === 'high', 'INV-021: Quality is HIGH');
    assert(res021.needsAI === false, 'INV-021: 0 AI fallback required');

    // -----------------------------------------------------------------
    // TEST 3: Percentage Value in Header (GST: 18%) Never Treated As Monetary Tax Amount
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: Percentage in Header Tax (GST: 18%) ---');
    const pctHeaderInvoice = `
Apex Cloud Solutions Pvt. Ltd.
GSTIN: 27AAECA1234F1Z5
Invoice #: INV-TEST-020
Subtotal: ₹1,00,000
GST: 18%
Total: ₹1,18,000
`.trim();

    const resPct = deterministicParserService.parseInvoiceText(pctHeaderInvoice, 'ocr');
    assert(resPct.data.tax !== 18, 'Test 3: Monetary tax is NOT 18 (not treated as raw percentage)');
    assert(resPct.data.tax === 18000, 'Test 3: Monetary tax correctly resolved to 18,000 from subtotal/rate', `got ${resPct.data.tax}`);
    assert(resPct.data.taxRate === 18, 'Test 3: Tax Rate is 18%', `got ${resPct.data.taxRate}`);
    assert(resPct.data.amount === 118000, 'Test 3: Total is 118,000');

    // -----------------------------------------------------------------
    // TEST 4: Both Tax Rate and Tax Amount Appear Near Each Other
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: Both Tax Rate and Tax Amount Near Each Other ---');
    const combinedNearText = `
Apex Cloud Solutions Pvt. Ltd.
GSTIN: 27AAECA1234F1Z5
Invoice #: INV-TEST-020
Subtotal: 100000
Tax Rate: 18%
Tax Amount: 18000
Total Amount: 118000
`.trim();

    const resCombined = deterministicParserService.parseInvoiceText(combinedNearText, 'pdf_text');
    assert(resCombined.data.taxRate === 18, 'Test 4: taxRate = 18%');
    assert(resCombined.data.tax === 18000, 'Test 4: tax = 18000');
    assert(resCombined.data.subtotal === 100000, 'Test 4: subtotal = 100000');
    assert(resCombined.data.amount === 118000, 'Test 4: total = 118000');

    // -----------------------------------------------------------------
    // TEST 5: CGST (9%) + SGST (9%) Breakdown
    // -----------------------------------------------------------------
    console.log('\n--- Test 5: CGST + SGST Breakdown ---');
    const cgstSgstText = `
DataCore Industrial Supplies Pvt Ltd
GSTIN: 29AAFCA8912J1ZQ
Invoice Number: INV-TEST-021
Subtotal: Rs. 110,000.00
CGST @ 9%: Rs. 9,900.00
SGST @ 9%: Rs. 9,900.00
Grand Total: Rs. 129,800.00
`.trim();

    const resCgstSgst = deterministicParserService.parseInvoiceText(cgstSgstText, 'pdf_text');
    assert(resCgstSgst.data.subtotal === 110000, 'Test 5: Subtotal is 110,000');
    assert(resCgstSgst.data.tax === 19800, 'Test 5: Tax is 19,800 (9900 + 9900)', `got ${resCgstSgst.data.tax}`);
    assert(resCgstSgst.data.taxRate === 18, 'Test 5: Tax Rate is 18% (9% + 9%)', `got ${resCgstSgst.data.taxRate}`);
    assert(resCgstSgst.data.amount === 129800, 'Test 5: Total is 129,800');

    // -----------------------------------------------------------------
    // TEST 6: Line-Item Corroboration When Header Tax is Missing or Corrupted
    // -----------------------------------------------------------------
    console.log('\n--- Test 6: Line-Item Corroboration ---');
    const lineItemCorroborateText = `
Apex Cloud Solutions Pvt. Ltd.
GSTIN: 27AAECA1234F1Z5
Invoice #: INV-TEST-020

Description                      Qty    Rate      Tax Rate    Total
Cloud Infrastructure Services    10     10000     18%         118000

Subtotal: 100000
Grand Total: 118000
`.trim();

    const resCorrob = deterministicParserService.parseInvoiceText(lineItemCorroborateText, 'pdf_text');
    assert(resCorrob.data.tax === 18000, 'Test 6: Tax corroborated from line items as 18,000', `got ${resCorrob.data.tax}`);
    assert(resCorrob.data.taxRate === 18, 'Test 6: Tax Rate corroborated as 18%', `got ${resCorrob.data.taxRate}`);
    assert(resCorrob.data.amount === 118000, 'Test 6: Total is 118,000');

    // -----------------------------------------------------------------
    // TEST 7: Conflicting Header Tax Not Silently Accepted (Quality Gate Check)
    // -----------------------------------------------------------------
    console.log('\n--- Test 7: Conflicting Header Tax vs Line-Items & Math ---');
    const conflictingTaxData: any = {
      documentType: 'invoice',
      confidence: 0.85,
      invoiceNumber: 'INV-TEST-020',
      supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
      supplierGstin: '27AAECA1234F1Z5',
      invoiceDate: '2026-09-01',
      subtotal: 100000,
      tax: 5000, // Wildly conflicting header tax
      discount: 0,
      amount: 118000, // Total expects 18,000 tax
      lineItems: [
        {
          description: 'Cloud Infrastructure Services',
          quantity: 10,
          unitPrice: 10000,
          taxRate: 18,
          taxAmount: 18000,
          total: 118000,
        },
      ],
    };

    const evalConflicted = ExtractionQualityEvaluator.evaluateInvoiceQuality('raw text', conflictingTaxData);
    assert(evalConflicted.failedFields.includes('tax'), 'Test 7: Conflicted tax is flagged in failedFields');
    assert(evalConflicted.needsAiFallback === true, 'Test 7: Conflicted tax requires review / AI fallback');

    // -----------------------------------------------------------------
    // TEST 8: Percentage as Monetary Tax Guard in Quality Evaluator
    // -----------------------------------------------------------------
    console.log('\n--- Test 8: Percentage As Tax Guard in Evaluator ---');
    const rawPctTaxData: any = {
      documentType: 'invoice',
      confidence: 0.85,
      invoiceNumber: 'INV-TEST-020',
      supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
      supplierGstin: '27AAECA1234F1Z5',
      invoiceDate: '2026-09-01',
      subtotal: 100000,
      tax: 18, // Corrupted percentage value
      discount: 0,
      amount: 118000,
      lineItems: [],
    };

    const evalRawPct = ExtractionQualityEvaluator.evaluateInvoiceQuality('raw text', rawPctTaxData);
    assert(evalRawPct.failedFields.includes('tax'), 'Test 8: Raw percentage as tax flagged in failedFields');
    assert(evalRawPct.fieldValidationStatus.tax.status === 'invalid', 'Test 8: Tax field status is invalid');

    console.log('\n================================================================');
    console.log('  ALL HEADER TAX INTEGRITY TESTS PASSED PERFECTLY!');
    console.log('================================================================\n');
  } finally {
    await teardownDB();
  }
}

runHeaderTaxIntegritySuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
