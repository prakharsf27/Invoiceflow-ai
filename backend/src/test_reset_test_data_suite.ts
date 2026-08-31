import mongoose from 'mongoose';
import { InvoiceModel } from './models/Invoice.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { SupplierModel } from './models/Supplier.js';
import { PaymentModel } from './models/Payment.js';
import { ExceptionModel } from './models/Exception.js';
import { DocumentModel } from './models/Document.js';
import { UserModel } from './models/User.js';
import { CompanyModel } from './models/Company.js';
import { resetTestData } from './controllers/companyController.js';

const runResetTestDataSuite = async () => {
  console.log('================================================================');
  console.log('🧪 RUNNING RESET TEST DATA & WORKSPACE ISOLATION SUITE');
  console.log('================================================================\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/invoiceflow';
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  } catch (err) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }

  const testCompanyA = `comp-reset-a-${Date.now()}`;
  const testCompanyB = `comp-reset-b-${Date.now()}`;

  // 1. Create Company and User for Company A
  await CompanyModel.create({
    id: testCompanyA,
    name: 'Test Org Alpha',
    ownerId: 'usr-owner-a',
    settings: { autoClearanceThreshold: 500000 },
  });

  await UserModel.create({
    id: 'usr-owner-a',
    email: 'owner-a@example.com',
    passwordHash: 'hashed_pw',
    name: 'Alice Owner',
    role: 'owner',
    companyId: testCompanyA,
    companyName: 'Test Org Alpha',
    isActive: true,
  });

  // 2. Seed Transactional Data for Company A
  await InvoiceModel.create([
    {
      id: `inv-a-1-${Date.now()}`,
      companyId: testCompanyA,
      invoiceNumber: 'INV-A-001',
      supplierName: 'Alpha Supplies',
      amount: 150000,
      subtotal: 125000,
      tax: 25000,
      status: 'ready',
      paymentStatus: 'scheduled',
      aiStatus: 'Ready',
      invoiceDate: '2026-08-01',
      dueDate: '2026-08-30',
    },
    {
      id: `inv-a-2-${Date.now()}`,
      companyId: testCompanyA,
      invoiceNumber: 'INV-A-002',
      supplierName: 'Alpha Supplies',
      amount: 85000,
      subtotal: 70000,
      tax: 15000,
      status: 'hold',
      paymentStatus: 'on_hold',
      aiStatus: 'On Hold',
      invoiceDate: '2026-08-05',
      dueDate: '2026-09-05',
    },
  ]);

  await PurchaseOrderModel.create({
    id: `po-a-1-${Date.now()}`,
    companyId: testCompanyA,
    poNumber: 'PO-A-001',
    supplierId: 'sup-a-1',
    supplierName: 'Alpha Supplies',
    totalAmount: 150000,
    matchStatus: 'matched',
    status: 'matched',
    items: [],
  });

  await SupplierModel.create({
    id: `sup-a-1-${Date.now()}`,
    companyId: testCompanyA,
    name: 'Alpha Supplies',
    gstin: '29ABCDE1234F1Z5',
    email: 'alpha@example.com',
    phone: '+91 99999 11111',
    totalSpend: 235000,
    outstandingAmount: 235000,
    invoiceCount: 2,
    riskLevel: 'low',
    lastInvoiceDate: '2026-08-05',
    status: 'active',
    bankAccounts: [],
  });

  await PaymentModel.create({
    id: `pay-a-1-${Date.now()}`,
    companyId: testCompanyA,
    invoiceId: 'inv-a-1',
    invoiceNumber: 'INV-A-001',
    supplierName: 'Alpha Supplies',
    amount: 150000,
    status: 'scheduled',
    scheduledDate: '2026-08-30',
  });

  await ExceptionModel.create({
    id: `exc-a-1-${Date.now()}`,
    companyId: testCompanyA,
    invoiceId: 'inv-a-2',
    invoiceNumber: 'INV-A-002',
    supplierName: 'Alpha Supplies',
    type: 'rate_variance',
    status: 'pending',
    severity: 'medium',
    description: 'Tax rate disparity',
  });

  await DocumentModel.create({
    id: `doc-a-1-${Date.now()}`,
    companyId: testCompanyA,
    uploadedBy: 'usr-owner-a',
    originalFileName: 'inv-001.pdf',
    fileName: 'doc-stored-001.pdf',
    mimeType: 'application/pdf',
    fileSize: 10240,
    documentType: 'invoice',
    storagePath: `${testCompanyA}/doc-stored-001.pdf`,
    storageReference: 'ref-001',
    processingStatus: 'processed',
    extractionStatus: 'extracted',
  });

  // 3. Seed Company B data (Tenant Isolation Check)
  await InvoiceModel.create({
    id: `inv-b-1-${Date.now()}`,
    companyId: testCompanyB,
    invoiceNumber: 'INV-B-001',
    supplierName: 'Beta Logistics',
    amount: 500000,
    status: 'ready',
    paymentStatus: 'scheduled',
    aiStatus: 'Ready',
    invoiceDate: '2026-08-10',
    dueDate: '2026-09-10',
  });

  console.log('📌 [TEST 1] Verifying seeded data counts before reset...');
  const beforeInvoices = await InvoiceModel.countDocuments({ companyId: testCompanyA });
  const beforePOs = await PurchaseOrderModel.countDocuments({ companyId: testCompanyA });
  const beforeSuppliers = await SupplierModel.countDocuments({ companyId: testCompanyA });
  const beforePayments = await PaymentModel.countDocuments({ companyId: testCompanyA });
  const beforeExceptions = await ExceptionModel.countDocuments({ companyId: testCompanyA });
  const beforeDocs = await DocumentModel.countDocuments({ companyId: testCompanyA });

  console.log(`   Seeded Company A: Invoices=${beforeInvoices}, POs=${beforePOs}, Suppliers=${beforeSuppliers}, Payments=${beforePayments}, Exceptions=${beforeExceptions}, Docs=${beforeDocs}`);
  if (beforeInvoices !== 2 || beforePOs !== 1 || beforeSuppliers !== 1 || beforePayments !== 1 || beforeExceptions !== 1 || beforeDocs !== 1) {
    throw new Error('Initial seeding count mismatch for Company A.');
  }
  console.log('   ✅ Passed Test 1: Initial workspace records seeded.\n');

  console.log('📌 [TEST 2] Executing resetTestData controller for Company A...');
  const mockReq: any = {
    user: {
      userId: 'usr-owner-a',
      companyId: testCompanyA,
      role: 'owner',
    },
  };

  let resStatusCode = 200;
  let resJsonData: any = null;

  const mockRes: any = {
    status: (code: number) => {
      resStatusCode = code;
      return mockRes;
    },
    json: (data: any) => {
      resJsonData = data;
      return mockRes;
    },
  };

  await resetTestData(mockReq, mockRes);

  console.log(`   Response Status: ${resStatusCode}, Success: ${resJsonData?.success}`);
  console.log('   Deleted Summary:', resJsonData?.deletedCounts);

  if (resStatusCode !== 200 || !resJsonData?.success) {
    throw new Error(`resetTestData failed with status ${resStatusCode}: ${JSON.stringify(resJsonData)}`);
  }
  console.log('   ✅ Passed Test 2: resetTestData controller executed successfully.\n');

  console.log('📌 [TEST 3] Verifying 100% clean zero state for Company A in MongoDB...');
  const afterInvoices = await InvoiceModel.countDocuments({ companyId: testCompanyA });
  const afterPOs = await PurchaseOrderModel.countDocuments({ companyId: testCompanyA });
  const afterSuppliers = await SupplierModel.countDocuments({ companyId: testCompanyA });
  const afterPayments = await PaymentModel.countDocuments({ companyId: testCompanyA });
  const afterExceptions = await ExceptionModel.countDocuments({ companyId: testCompanyA });
  const afterDocs = await DocumentModel.countDocuments({ companyId: testCompanyA });

  console.log(`   Company A Post-Reset: Invoices=${afterInvoices}, POs=${afterPOs}, Suppliers=${afterSuppliers}, Payments=${afterPayments}, Exceptions=${afterExceptions}, Docs=${afterDocs}`);

  if (afterInvoices !== 0 || afterPOs !== 0 || afterSuppliers !== 0 || afterPayments !== 0 || afterExceptions !== 0 || afterDocs !== 0) {
    throw new Error('Transactional records were not completely wiped for Company A.');
  }
  console.log('   ✅ Passed Test 3: All transactional records for Company A wiped to exactly 0.\n');

  console.log('📌 [TEST 4] Verifying User account and Company settings are preserved...');
  const preservedCompany = await CompanyModel.findOne({ id: testCompanyA });
  const preservedUser = await UserModel.findOne({ id: 'usr-owner-a' });

  if (!preservedCompany || preservedCompany.name !== 'Test Org Alpha') {
    throw new Error('Company workspace record was accidentally modified or deleted.');
  }
  if (!preservedUser || preservedUser.email !== 'owner-a@example.com') {
    throw new Error('User authentication record was accidentally modified or deleted.');
  }
  console.log(`   Preserved Company: ${preservedCompany.name} (id: ${preservedCompany.id})`);
  console.log(`   Preserved User: ${preservedUser.name} (${preservedUser.email})`);
  console.log('   ✅ Passed Test 4: User account and workspace settings preserved intact.\n');

  console.log('📌 [TEST 5] Verifying Multi-Tenant Isolation (Company B data untouched)...');
  const companyBInvoices = await InvoiceModel.countDocuments({ companyId: testCompanyB });
  console.log(`   Company B Invoices remaining: ${companyBInvoices}`);

  if (companyBInvoices !== 1) {
    throw new Error('Multi-tenant breach: Company B data was affected by Company A reset!');
  }
  console.log('   ✅ Passed Test 5: Company B records 100% untouched and isolated.\n');

  console.log('================================================================');
  console.log('🎉 ALL RESET TEST DATA SUITE TESTS PASSED PERFECTLY (5/5)!');
  console.log('================================================================\n');

  await mongoose.disconnect();
};

runResetTestDataSuite().catch((err) => {
  console.error('❌ Test suite error:', err);
  process.exit(1);
});
