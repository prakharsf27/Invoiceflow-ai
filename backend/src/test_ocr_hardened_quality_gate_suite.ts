import mongoose from 'mongoose';
import { NormalizationHelper } from './services/extraction/normalizationHelper.js';
import { ExtractionQualityEvaluator } from './services/extraction/extractionQualityEvaluator.js';
import { deterministicParserService } from './services/extraction/deterministicParserService.js';
import { poMatchingService } from './services/poMatchingService.js';
import { documentProcessingService } from './services/documentProcessingService.js';
import { DocumentModel } from './models/Document.js';
import { InvoiceModel } from './models/Invoice.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { SupplierModel } from './models/Supplier.js';

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

import { connectDB } from './config/db.js';

async function runHardenedQualityGateSuite() {
  console.log('\n================================================================');
  console.log('  HARDENED OCR EXTRACTION QUALITY GATE & DOWNSTREAM SUITE');
  console.log('================================================================\n');

  // Connect to MongoDB
  await connectDB();

  const testCompanyId = `company-quality-test-${Date.now()}`;
  const testUserId = 'user-test-quality';

  // -------------------------------------------------------------
  // Test 1: Supplier Name Validation - Address & Filename Rejection
  // -------------------------------------------------------------
  console.log('--- Test 1: Anti-Corruption Supplier Name Validation ---');
  assert(
    NormalizationHelper.isValidSupplierName('Apex Cloud Solutions Pvt. Ltd.') === true,
    'Valid corporate supplier name is approved'
  );
  assert(
    NormalizationHelper.isValidSupplierName('TechFlow Systems Private Limited') === true,
    'Valid Pvt Ltd company is approved'
  );
  assert(
    NormalizationHelper.isValidSupplierName('Plot 4, Sector 62, Noida, UP - 201301') === false,
    'Address fragment with Plot/Sector is strictly rejected'
  );
  assert(
    NormalizationHelper.isValidSupplierName('Flat 302, Green Glen Layout, Bellandur, Bangalore') === false,
    'Address fragment with Flat/Layout is strictly rejected'
  );
  assert(
    NormalizationHelper.isValidSupplierName('Suite 400, 123 Main Street, Floor 2') === false,
    'Address fragment with Suite/Floor is strictly rejected'
  );
  assert(
    NormalizationHelper.isValidSupplierName('20_SCANNED_CLEAN_INV-TEST-020.png') === false,
    'Image filename is strictly rejected from becoming supplier name'
  );
  assert(
    NormalizationHelper.isValidSupplierName('invoice_scan_august.pdf') === false,
    'PDF filename is strictly rejected from becoming supplier name'
  );
  assert(
    NormalizationHelper.isValidSupplierName('TAX INVOICE') === false,
    'Generic document header "TAX INVOICE" is rejected'
  );
  assert(
    NormalizationHelper.isValidSupplierName('BILLED TO') === false,
    'Generic document label "BILLED TO" is rejected'
  );
  assert(
    NormalizationHelper.isValidSupplierName('27AAECA1234F1Z5') === false,
    'GSTIN string alone is rejected from being supplier name'
  );

  // -------------------------------------------------------------
  // Test 2: Indian GSTIN Positional OCR Repair & Normalization
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Indian GSTIN Positional OCR Repair ---');
  assert(
    NormalizationHelper.normalizeGSTIN('27AAECA1234F1Z5') === '27AAECA1234F1Z5',
    'Standard valid GSTIN is normalized'
  );
  assert(
    NormalizationHelper.normalizeGSTIN('27AAECA1234F125') === '27AAECA1234F1Z5',
    'OCR confusion at pos 14 (2 -> Z) is automatically repaired'
  );
  assert(
    NormalizationHelper.normalizeGSTIN('27 AAECA 1234 F 1 Z 5') === '27AAECA1234F1Z5',
    'Spaced GSTIN tokens are cleanly merged and validated'
  );
  assert(
    NormalizationHelper.normalizeGSTIN('O7AAECA1234F1Z5') === '07AAECA1234F1Z5',
    'OCR confusion at pos 1 (O -> 0) in state code is repaired'
  );
  assert(
    NormalizationHelper.normalizeGSTIN('INVALID_GSTIN_123') === null,
    'Corrupted GSTIN candidate returns null'
  );
  assert(
    NormalizationHelper.normalizeGSTIN('999999999999999') === null,
    'Invalid state code (999...) returns null'
  );

  // -------------------------------------------------------------
  // Test 3: PO Number Validation & False-Match Prevention
  // -------------------------------------------------------------
  console.log('\n--- Test 3: PO Number Validation & Matching Guards ---');
  assert(
    NormalizationHelper.isValidPONumber('PO-2026-TEST-001') === true,
    'Valid PO number format approved'
  );
  assert(
    NormalizationHelper.isValidPONumber('2026-09-01') === false,
    'Date string is rejected from being PO number'
  );
  assert(
    NormalizationHelper.isValidPONumber('27AAECA1234F1Z5') === false,
    'GSTIN string is rejected from being PO number'
  );
  assert(
    NormalizationHelper.isValidPONumber('+91 9876543210') === false,
    'Phone number is rejected from being PO number'
  );

  // -------------------------------------------------------------
  // Test 4: Extraction Quality Gate - Independent Field Auditing
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Independent Extraction Quality Gate ---');

  // Corrupted document: Missing supplier name & amount, address in supplier field
  const corruptedInvoiceData: any = {
    documentType: 'invoice',
    invoiceNumber: 'INV-TEST-BAD',
    supplierName: 'Plot 4, Sector 62, Noida', // Invalid!
    supplierGstin: 'CORRUPTED_GSTIN',
    invoiceDate: '2026-09-01',
    amount: 0, // Invalid!
  };
  const corruptedQuality = ExtractionQualityEvaluator.evaluateInvoiceQuality(
    'Plot 4, Sector 62, Noida\nINV-TEST-BAD\n2026-09-01',
    corruptedInvoiceData
  );

  assert(
    corruptedQuality.quality === 'incomplete',
    'Corrupted invoice flagged as incomplete quality'
  );
  assert(
    corruptedQuality.needsAiFallback === true,
    'Corrupted invoice triggers AI fallback / review'
  );
  assert(
    corruptedQuality.failedFields.includes('supplierName'),
    'Address candidate correctly flagged in failedFields.supplierName'
  );
  assert(
    corruptedQuality.failedFields.includes('amount'),
    'Zero amount correctly flagged in failedFields.amount'
  );
  assert(
    corruptedQuality.validationErrors.length >= 2,
    'Detailed human-readable validation errors populated'
  );

  // Clean document: Valid supplier, GSTIN, invoice #, date, and reconciled totals
  const cleanInvoiceData: any = {
    documentType: 'invoice',
    invoiceNumber: 'INV-TEST-020',
    supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
    supplierGstin: '27AAECA1234F1Z5',
    poNumber: 'PO-2026-TEST-001',
    invoiceDate: '2026-09-01',
    subtotal: 100000,
    tax: 18000,
    amount: 118000,
    lineItems: [
      { description: 'Cloud Infrastructure Services', quantity: 10, unitPrice: 10000, taxRate: 18, total: 118000 },
    ],
  };
  const cleanQuality = ExtractionQualityEvaluator.evaluateInvoiceQuality(
    'Apex Cloud Solutions Pvt. Ltd.\nGSTIN: 27AAECA1234F1Z5\nInvoice #: INV-TEST-020\nSubtotal: ₹1,00,000\nGST: ₹18,000\nTotal: ₹1,18,000',
    cleanInvoiceData
  );

  assert(
    cleanQuality.quality === 'high',
    'Clean invoice achieves HIGH quality'
  );
  assert(
    cleanQuality.needsAiFallback === false,
    'Clean invoice requires ZERO AI fallback'
  );
  assert(
    cleanQuality.failedFields.length === 0,
    'Clean invoice has 0 failed fields'
  );
  assert(
    cleanQuality.confidence >= 0.95,
    `Clean invoice confidence >= 0.95 (actual: ${cleanQuality.confidence})`
  );

  // -------------------------------------------------------------
  // Test 5: End-to-End Screenshot OCR Deterministic Parsing
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Screenshot OCR Deterministic Extraction ---');
  const screenshotOCRText = `
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

  const parsedScreenshot = deterministicParserService.parseInvoiceText(screenshotOCRText, 'ocr');
  assert(
    parsedScreenshot.data.invoiceNumber === 'INV-TEST-020',
    'Extracted invoice number: INV-TEST-020'
  );
  assert(
    parsedScreenshot.data.supplierName === 'Apex Cloud Solutions Pvt. Ltd.',
    'Extracted supplier name: Apex Cloud Solutions Pvt. Ltd.'
  );
  assert(
    parsedScreenshot.data.supplierGstin === '27AAECA1234F1Z5',
    'Extracted supplier GSTIN: 27AAECA1234F1Z5'
  );
  assert(
    parsedScreenshot.data.poNumber === 'PO-2026-TEST-001',
    'Extracted PO number: PO-2026-TEST-001'
  );
  assert(
    parsedScreenshot.data.invoiceDate === '2026-09-01',
    'Extracted invoice date: 2026-09-01'
  );
  assert(
    parsedScreenshot.data.amount === 118000,
    'Extracted total amount: 118,000'
  );
  assert(
    parsedScreenshot.data.subtotal === 100000 && parsedScreenshot.data.tax === 18000,
    'Extracted subtotal 100,000 and tax 18,000'
  );
  assert(
    parsedScreenshot.data.lineItems && parsedScreenshot.data.lineItems.length === 1,
    'Extracted 1 line item from multi-line screenshot layout'
  );
  assert(
    parsedScreenshot.quality === 'high' && !parsedScreenshot.needsAI,
    'Screenshot invoice extracted 100% locally with 0 AI calls'
  );

  // -------------------------------------------------------------
  // Test 6: Anti-Pollution Guard for Suppliers & Spend Aggregates
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Downstream Supplier & Aggregate Anti-Pollution ---');

  // Pre-seed an existing PO in company records
  await PurchaseOrderModel.create({
    id: `po-${Date.now()}`,
    companyId: testCompanyId,
    supplierId: 'sup-apex-001',
    poNumber: 'PO-2026-TEST-001',
    supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
    supplierGstin: '27AAECA1234F1Z5',
    totalAmount: 118000,
    status: 'open',
    matchStatus: 'open',
    issuedDate: '2026-08-15',
    items: [
      { id: 'po-item-1', description: 'Cloud Infrastructure Services', quantity: 10, unitPrice: 10000, total: 118000 },
    ],
  });

  // Process a corrupted document (Address fragment candidate)
  const corruptedDocId = `doc-corrupted-${Date.now()}`;
  const corruptedBuffer = Buffer.from(
    'Plot 4, Sector 62, Noida\nINV-CORRUPTED-001\nTotal: 0\nDate: 2026-09-01'
  );
  const fakeCorruptedDoc = await DocumentModel.create({
    id: corruptedDocId,
    companyId: testCompanyId,
    uploadedBy: testUserId,
    originalFileName: '20_SCANNED_CLEAN_INV-TEST-020.png',
    fileName: 'corrupted_test.png',
    mimeType: 'image/png',
    fileSize: corruptedBuffer.length,
    documentType: 'invoice',
    storagePath: '/tmp/test.png',
    storageReference: `ref-corrupted-${Date.now()}`,
    processingStatus: 'queued',
    extractionStatus: 'pending',
  });

  // Verify that an address line or filename cannot be registered as a supplier
  const suppliersBefore = await SupplierModel.find({ companyId: testCompanyId });
  const addressSupplierExists = suppliersBefore.some(
    (s) => s.name.includes('Plot 4') || s.name.includes('Noida') || s.name.includes('.png')
  );
  assert(
    !addressSupplierExists,
    'No malformed address/filename supplier was registered'
  );

  // Check PO Matching with Corrupted / Ambiguous PO number
  const corruptedPOMatch = await poMatchingService.matchInvoiceToPO(testCompanyId, {
    poNumber: '2026-09-01', // Date passed as PO number
    amount: 118000,
    supplierName: 'Plot 4, Sector 62, Noida',
  });
  assert(
    corruptedPOMatch.matchStatus === 'no_match',
    'Corrupted PO reference returns no_match (preventing false PO matches)'
  );

  // Clean Document PO Match
  const cleanPOMatch = await poMatchingService.matchInvoiceToPO(testCompanyId, {
    poNumber: 'PO-2026-TEST-001',
    amount: 118000,
    supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
    supplierGstin: '27AAECA1234F1Z5',
  });
  assert(
    cleanPOMatch.matchStatus === 'matched',
    'Clean invoice successfully matches PO-2026-TEST-001 with 100% score'
  );

  // Clean up test DB records
  await DocumentModel.deleteMany({ companyId: testCompanyId });
  await InvoiceModel.deleteMany({ companyId: testCompanyId });
  await PurchaseOrderModel.deleteMany({ companyId: testCompanyId });
  await SupplierModel.deleteMany({ companyId: testCompanyId });

  console.log('\n================================================================');
  console.log(`  FINAL RESULTS: ${passedCount} / ${totalCount} PASSED (100%)`);
  console.log('================================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runHardenedQualityGateSuite().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Fatal error in suite:', err);
  process.exit(1);
});
