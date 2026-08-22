import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { InvoiceModel } from './models/Invoice.js';
import { PurchaseOrderModel } from './models/PurchaseOrder.js';
import { SupplierModel } from './models/Supplier.js';
import { PaymentModel } from './models/Payment.js';
import { ExceptionModel } from './models/Exception.js';

dotenv.config();

const mockInvoices = [
  {
    id: 'inv-0092',
    invoiceNumber: 'INV-0092',
    supplierId: 'sup-metro',
    supplierName: 'Metro Components',
    supplierGstin: '27AABCM4589F1ZQ',
    supplierEmail: 'billing@metrocomponents.in',
    supplierPhone: '+91 98201 44521',
    amount: 840000,
    currency: 'INR',
    subtotal: 711864,
    tax: 128136,
    discount: 0,
    invoiceDate: '2026-08-18',
    dueDate: '2026-09-02',
    poNumber: 'PO-8291',
    aiStatus: 'PO Mismatch',
    status: 'critical',
    paymentStatus: 'pending',
    riskLevel: 'high',
    paymentTerms: 'Net 15 Days',
    bankDetails: {
      accountNumber: '984400210009812',
      ifsc: 'HDFC0001042',
      bankName: 'HDFC Bank, Mumbai Main',
      isChangedFromPrevious: false,
    },
    items: [
      {
        id: 'item-1',
        description: 'Industrial Precision Steel Bearings Type-A',
        quantity: 500,
        unitPrice: 950,
        taxRate: 18,
        taxAmount: 85500,
        total: 560500,
        poItemMatched: true,
      },
      {
        id: 'item-2',
        description: 'Hydraulic Seals & O-Rings Kit (Bulk)',
        quantity: 120,
        unitPrice: 1950,
        taxRate: 18,
        taxAmount: 42120,
        total: 276120,
        poItemMatched: false,
      },
    ],
    aiChecks: [
      { id: 'c1', title: 'Supplier GSTIN Matched', passed: true, type: 'success', detail: 'Matches official GST portal record' },
      { id: 'c2', title: 'Invoice Number Valid & Unique', passed: true, type: 'success', detail: 'Format conforms to tax guidelines' },
      { id: 'c3', title: 'Calculations & Taxes Verified', passed: true, type: 'success', detail: '18% GST correctly computed across items' },
      { id: 'c4', title: 'PO Pricing Variance Detected', passed: false, type: 'critical', detail: 'Line item 2 billed at ₹1,950 vs PO rate ₹1,533. Total variance: +₹50,000' },
      { id: 'c5', title: 'Bank Account Consistency', passed: true, type: 'success', detail: 'Matches bank account on file since Jan 2026' },
    ],
    aiRecommendation: 'Request clarification from the supplier before approving this invoice. The line item rate exceeds PO-8291 approved rate by ₹50,000.',
    evidence: [
      {
        title: 'Total Amount Comparison',
        invoiceValue: '₹8,40,000',
        referenceValue: '₹7,90,000 (PO-8291)',
        difference: '+₹50,000 (6.3% Overrun)',
        explanation: 'Invoice exceeds the authorized limit in purchase order PO-8291 created on Aug 02, 2026.',
      },
      {
        title: 'Line Item Rate Variance',
        invoiceValue: '₹1,950 / unit (Hydraulic Seals)',
        referenceValue: '₹1,533 / unit (Agreed Rate)',
        difference: '+₹417 / unit (+27.2%)',
        explanation: 'Unit price higher than pre-negotiated catalog pricing.',
      },
    ],
  },
  {
    id: 'inv-82731',
    invoiceNumber: 'INV-82731',
    supplierId: 'sup-abc',
    supplierName: 'ABC Supplies',
    supplierGstin: '29ABCDE1234F2Z5',
    supplierEmail: 'accounts@abcsupplies.co.in',
    supplierPhone: '+91 80 4123 9000',
    amount: 482000,
    currency: 'INR',
    subtotal: 408474,
    tax: 73526,
    discount: 0,
    invoiceDate: '2026-08-19',
    dueDate: '2026-09-04',
    poNumber: 'PO-7740',
    aiStatus: 'Possible Duplicate',
    status: 'review',
    paymentStatus: 'on_hold',
    riskLevel: 'medium',
    paymentTerms: 'Net 30 Days',
    bankDetails: {
      accountNumber: '001205001234',
      ifsc: 'ICIC0000012',
      bankName: 'ICICI Bank, Indiranagar',
      isChangedFromPrevious: false,
    },
    items: [
      {
        id: 'item-3',
        description: 'Corrugated Packaging Cartons 40x30x30cm (1000 pack)',
        quantity: 10,
        unitPrice: 40847.4,
        taxRate: 18,
        taxAmount: 73526,
        total: 482000,
        poItemMatched: true,
      },
    ],
    aiChecks: [
      { id: 'c6', title: 'Supplier Matched', passed: true, type: 'success', detail: 'Verified active supplier' },
      { id: 'c7', title: 'Duplicate Pattern Detected', passed: false, type: 'warning', detail: '87% similarity with INV-0081 settled on Aug 05' },
      { id: 'c8', title: 'Line Items Match Recent Bill', passed: false, type: 'warning', detail: 'Identical quantities and item codes submitted 14 days ago' },
    ],
    similarityScore: 87,
    similarInvoiceId: 'INV-0081',
    aiRecommendation: 'Hold payment and verify with warehouse manager whether a second shipment of corrugated cartons was actually received.',
    evidence: [
      {
        title: 'Duplicate Similarity Score',
        invoiceValue: 'INV-82731 (₹4,82,000)',
        referenceValue: 'INV-0081 (₹4,82,000 on Aug 05)',
        difference: '87% Match Score',
        explanation: 'Identical bill amount, line items, and delivery address. Only PO reference has minor timestamp offset.',
      },
    ],
  },
  {
    id: 'inv-6621',
    invoiceNumber: 'INV-6621',
    supplierId: 'sup-nova',
    supplierName: 'Nova Traders',
    supplierGstin: '07AAACN9182C1ZG',
    supplierEmail: 'finance@novatraders.com',
    supplierPhone: '+91 11 2874 5500',
    amount: 215000,
    currency: 'INR',
    subtotal: 182203,
    tax: 32797,
    discount: 0,
    invoiceDate: '2026-08-20',
    dueDate: '2026-08-23',
    poNumber: 'PO-9012',
    aiStatus: 'Bank Detail Change',
    status: 'critical',
    paymentStatus: 'pending',
    riskLevel: 'high',
    paymentTerms: 'Net 3 Days',
    bankDetails: {
      accountNumber: '50200088999812',
      ifsc: 'HDFC0000240',
      bankName: 'HDFC Bank, Connaught Place',
      isChangedFromPrevious: true,
      previousAccountNumber: '00210100001234',
    },
    items: [
      {
        id: 'item-4',
        description: 'Raw Polymer Resin Pellets Grade B (500kg drums)',
        quantity: 4,
        unitPrice: 45550.75,
        taxRate: 18,
        taxAmount: 32797,
        total: 215000,
        poItemMatched: true,
      },
    ],
    aiChecks: [
      { id: 'c9', title: 'Supplier Identity Verified', passed: true, type: 'success', detail: 'GSTIN valid and active' },
      { id: 'c10', title: 'Bank Account Changed', passed: false, type: 'critical', detail: 'Bank account changed from XXXX1234 to XXXX9812 without prior written mandate' },
      { id: 'c11', title: 'Due Date Imminent', passed: false, type: 'warning', detail: 'Payment due in 2 days' },
    ],
    aiRecommendation: 'High security risk: Call verified phone number of Nova Traders CFO to confirm bank change before routing payment to the new account.',
    evidence: [
      {
        title: 'Bank Account Discrepancy',
        invoiceValue: 'HDFC Bank - A/C ending in 9812',
        referenceValue: 'State Bank of India - A/C ending in 1234 (Historical)',
        difference: 'New Unverified Beneficiary',
        explanation: 'The remitting account on the invoice differs from all 6 previously cleared invoices for Nova Traders.',
      },
    ],
  },
  {
    id: 'inv-1044',
    invoiceNumber: 'INV-1044',
    supplierId: 'sup-delta',
    supplierName: 'Delta Supplies',
    supplierGstin: '33AABCD7721E1Z0',
    supplierEmail: 'contact@deltasupplies.co',
    supplierPhone: '+91 44 2499 1800',
    amount: 125000,
    currency: 'INR',
    subtotal: 105932,
    tax: 19068,
    discount: 0,
    invoiceDate: '2026-07-28',
    dueDate: '2026-08-13',
    poNumber: 'PO-6510',
    aiStatus: 'Overdue',
    status: 'overdue',
    paymentStatus: 'overdue',
    riskLevel: 'medium',
    paymentTerms: 'Immediate',
    bankDetails: {
      accountNumber: '920020045671190',
      ifsc: 'UTIB0000045',
      bankName: 'Axis Bank, Chennai',
      isChangedFromPrevious: false,
    },
    items: [
      {
        id: 'item-5',
        description: 'Factory Safety Helmets & High-Vis Vests Pack',
        quantity: 50,
        unitPrice: 2118.64,
        taxRate: 18,
        taxAmount: 19068,
        total: 125000,
        poItemMatched: true,
      },
    ],
    aiChecks: [
      { id: 'c12', title: 'All Verifications Passed', passed: true, type: 'success', detail: 'Goods received note (GRN) confirmed' },
      { id: 'c13', title: 'Payment Overdue', passed: false, type: 'critical', detail: 'Past due date by 8 days' },
    ],
    aiRecommendation: 'Release payment immediately to avoid late payment penalty and preserve supplier credit rating.',
    evidence: [
      {
        title: 'Aging Analysis',
        invoiceValue: 'Due Date: 13 Aug 2026',
        referenceValue: 'Today: 21 Aug 2026',
        difference: '8 Days Overdue',
        explanation: 'Invoice is currently incurring vendor escalation warning.',
      },
    ],
  },
  {
    id: 'inv-4401',
    invoiceNumber: 'INV-4401',
    supplierId: 'sup-abc',
    supplierName: 'ABC Supplies',
    supplierGstin: '29ABCDE1234F2Z5',
    supplierEmail: 'accounts@abcsupplies.co.in',
    supplierPhone: '+91 80 4123 9000',
    amount: 240000,
    currency: 'INR',
    subtotal: 203390,
    tax: 36610,
    discount: 0,
    invoiceDate: '2026-08-17',
    dueDate: '2026-09-01',
    poNumber: 'PO-8812',
    aiStatus: 'Ready',
    status: 'ready',
    paymentStatus: 'scheduled',
    riskLevel: 'low',
    paymentTerms: 'Net 15 Days',
    bankDetails: {
      accountNumber: '001205001234',
      ifsc: 'ICIC0000012',
      bankName: 'ICICI Bank, Indiranagar',
      isChangedFromPrevious: false,
    },
    items: [
      {
        id: 'item-6',
        description: 'Standard Kraft Paper Rolls (50 GSM, 100m)',
        quantity: 200,
        unitPrice: 1016.95,
        taxRate: 18,
        taxAmount: 36610,
        total: 240000,
        poItemMatched: true,
      },
    ],
    aiChecks: [
      { id: 'c14', title: 'Supplier Matched & Verified', passed: true, type: 'success', detail: 'GSTIN, PAN & MSME status verified' },
      { id: 'c15', title: '3-Way PO Match Successful', passed: true, type: 'success', detail: '100% matched with PO-8812 and GRN-4190' },
      { id: 'c16', title: 'Bank Account Reconciled', passed: true, type: 'success', detail: 'Confirmed active account' },
      { id: 'c17', title: 'Taxes & Math Exact', passed: true, type: 'success', detail: 'Zero calculation discrepancy' },
    ],
    aiRecommendation: 'Invoice is 100% clean and pre-cleared by AI. Safe for one-click payment execution.',
    evidence: [
      {
        title: '3-Way Match Verification',
        invoiceValue: '₹2,40,000',
        referenceValue: '₹2,40,000 (PO-8812)',
        difference: '₹0 Discrepancy (100% Match)',
        explanation: 'All line items, tax components, and delivery receipts match the approved procurement request.',
      },
    ],
  },
  {
    id: 'inv-5519',
    invoiceNumber: 'INV-5519',
    supplierId: 'sup-precision',
    supplierName: 'Precision Tech Tools',
    supplierGstin: '24AAACP4412B1Z8',
    supplierEmail: 'invoices@precisiontech.in',
    supplierPhone: '+91 79 6612 3300',
    amount: 320000,
    currency: 'INR',
    subtotal: 271186,
    tax: 48814,
    discount: 0,
    invoiceDate: '2026-08-16',
    dueDate: '2026-09-05',
    poNumber: 'PO-8990',
    aiStatus: 'Ready',
    status: 'ready',
    paymentStatus: 'scheduled',
    riskLevel: 'low',
    paymentTerms: 'Net 20 Days',
    bankDetails: {
      accountNumber: '110045892314',
      ifsc: 'SBIN0004120',
      bankName: 'SBI SME Branch, Ahmedabad',
      isChangedFromPrevious: false,
    },
    items: [
      {
        id: 'item-7',
        description: 'Carbide End Mills 4-Flute 12mm',
        quantity: 40,
        unitPrice: 6779.65,
        taxRate: 18,
        taxAmount: 48814,
        total: 320000,
        poItemMatched: true,
      },
    ],
    aiChecks: [
      { id: 'c18', title: 'PO Matched Exactly', passed: true, type: 'success', detail: 'PO-8990 fully validated' },
      { id: 'c19', title: 'Zero Risk Detected', passed: true, type: 'success', detail: 'Clean credit record across 18 past invoices' },
    ],
    aiRecommendation: 'Pre-approved for batch payment on scheduled due date.',
    evidence: [],
  },
];

const mockPurchaseOrders = [
  {
    id: 'po-8291',
    poNumber: 'PO-8291',
    supplierId: 'sup-metro',
    supplierName: 'Metro Components',
    totalAmount: 790000,
    issuedDate: '2026-08-02',
    status: 'mismatch',
    items: [
      { id: 'po-item-1', description: 'Industrial Precision Steel Bearings Type-A', quantity: 500, unitPrice: 950, total: 475000 },
      { id: 'po-item-2', description: 'Hydraulic Seals & O-Rings Kit (Bulk)', quantity: 120, unitPrice: 1533, total: 183960 },
    ],
  },
  {
    id: 'po-8812',
    poNumber: 'PO-8812',
    supplierId: 'sup-abc',
    supplierName: 'ABC Supplies',
    totalAmount: 240000,
    issuedDate: '2026-08-10',
    status: 'matched',
    items: [
      { id: 'po-item-3', description: 'Standard Kraft Paper Rolls (50 GSM, 100m)', quantity: 200, unitPrice: 1016.95, total: 203390 },
    ],
  },
  {
    id: 'po-7740',
    poNumber: 'PO-7740',
    supplierId: 'sup-abc',
    supplierName: 'ABC Supplies',
    totalAmount: 482000,
    issuedDate: '2026-08-12',
    status: 'partial',
    items: [
      { id: 'po-item-4', description: 'Corrugated Packaging Cartons 40x30x30cm (1000 pack)', quantity: 10, unitPrice: 40847.4, total: 408474 },
    ],
  },
];

const mockSuppliers = [
  {
    id: 'sup-abc',
    name: 'ABC Supplies',
    gstin: '29ABCDE1234F2Z5',
    email: 'accounts@abcsupplies.co.in',
    phone: '+91 80 4123 9000',
    totalSpend: 1840000,
    outstandingAmount: 240000,
    invoiceCount: 28,
    riskLevel: 'low',
    lastInvoiceDate: '2026-08-19',
    status: 'active',
    bankAccounts: [
      { accountNumber: '001205001234', bankName: 'ICICI Bank, Indiranagar', ifsc: 'ICIC0000012', isPrimary: true, addedDate: '2025-04-10' },
    ],
    recentAlerts: ['Possible duplicate invoice submitted (INV-82731 vs INV-0081)'],
  },
  {
    id: 'sup-metro',
    name: 'Metro Components',
    gstin: '27AABCM4589F1ZQ',
    email: 'billing@metrocomponents.in',
    phone: '+91 98201 44521',
    totalSpend: 3450000,
    outstandingAmount: 840000,
    invoiceCount: 14,
    riskLevel: 'high',
    lastInvoiceDate: '2026-08-18',
    status: 'under_review',
    bankAccounts: [
      { accountNumber: '984400210009812', bankName: 'HDFC Bank, Mumbai Main', ifsc: 'HDFC0001042', isPrimary: true, addedDate: '2026-01-15' },
    ],
    recentAlerts: ['PO variance exceeded threshold (+₹50,000 on INV-0092)'],
  },
  {
    id: 'sup-nova',
    name: 'Nova Traders',
    gstin: '07AAACN9182C1ZG',
    email: 'finance@novatraders.com',
    phone: '+91 11 2874 5500',
    totalSpend: 1280000,
    outstandingAmount: 215000,
    invoiceCount: 9,
    riskLevel: 'high',
    lastInvoiceDate: '2026-08-20',
    status: 'under_review',
    bankAccounts: [
      { accountNumber: '50200088999812', bankName: 'HDFC Bank, Connaught Place', ifsc: 'HDFC0000240', isPrimary: true, addedDate: '2026-08-20' },
      { accountNumber: '00210100001234', bankName: 'SBI, Delhi Main', ifsc: 'SBIN0000691', isPrimary: false, addedDate: '2025-08-01' },
    ],
    recentAlerts: ['Bank details changed on August 20. Previous invoices used a different bank account.'],
  },
  {
    id: 'sup-delta',
    name: 'Delta Supplies',
    gstin: '33AABCD7721E1Z0',
    email: 'contact@deltasupplies.co',
    phone: '+91 44 2499 1800',
    totalSpend: 890000,
    outstandingAmount: 125000,
    invoiceCount: 6,
    riskLevel: 'medium',
    lastInvoiceDate: '2026-07-28',
    status: 'active',
    bankAccounts: [
      { accountNumber: '920020045671190', bankName: 'Axis Bank, Chennai', ifsc: 'UTIB0000045', isPrimary: true, addedDate: '2025-11-20' },
    ],
    recentAlerts: ['Invoice INV-1044 is 8 days overdue.'],
  },
  {
    id: 'sup-precision',
    name: 'Precision Tech Tools',
    gstin: '24AAACP4412B1Z8',
    email: 'invoices@precisiontech.in',
    phone: '+91 79 6612 3300',
    totalSpend: 2450000,
    outstandingAmount: 320000,
    invoiceCount: 18,
    riskLevel: 'low',
    lastInvoiceDate: '2026-08-16',
    status: 'active',
    bankAccounts: [
      { accountNumber: '110045892314', bankName: 'SBI SME Branch, Ahmedabad', ifsc: 'SBIN0004120', isPrimary: true, addedDate: '2025-06-12' },
    ],
  },
];

const mockExceptions = [
  {
    id: 'exc-1',
    invoiceId: 'inv-0092',
    invoiceNumber: 'INV-0092',
    supplierName: 'Metro Components',
    amount: 840000,
    issueType: 'po_mismatch',
    severity: 'critical',
    title: 'PO mismatch: invoice is ₹50,000 above approved PO',
    description: 'PO-8291 was approved for ₹7,90,000. Line item "Hydraulic Seals" is billed at ₹1,950 vs approved ₹1,533.',
    varianceAmount: 50000,
    aiRecommendation: 'Request clarification from the supplier before approving this invoice.',
    createdAtStr: '2026-08-18T10:30:00Z',
    status: 'pending',
  },
  {
    id: 'exc-2',
    invoiceId: 'inv-82731',
    invoiceNumber: 'INV-82731',
    supplierName: 'ABC Supplies',
    amount: 482000,
    issueType: 'duplicate',
    severity: 'review',
    title: 'Possible duplicate invoice (87% similarity)',
    description: 'Matches amounts, line items, and addresses of INV-0081 settled on Aug 05.',
    aiRecommendation: 'Verify physical goods receipt note with the store keeper before approving.',
    createdAtStr: '2026-08-19T14:15:00Z',
    status: 'pending',
  },
  {
    id: 'exc-3',
    invoiceId: 'inv-6621',
    invoiceNumber: 'INV-6621',
    supplierName: 'Nova Traders',
    amount: 215000,
    issueType: 'bank_change',
    severity: 'critical',
    title: 'Bank details changed from previous invoices',
    description: 'Invoice remits to newly added HDFC bank account instead of verified SBI account ending in 1234.',
    aiRecommendation: 'Perform mandatory vendor bank re-verification by phone.',
    createdAtStr: '2026-08-20T09:00:00Z',
    status: 'pending',
  },
  {
    id: 'exc-4',
    invoiceId: 'inv-1044',
    invoiceNumber: 'INV-1044',
    supplierName: 'Delta Supplies',
    amount: 125000,
    issueType: 'overdue',
    severity: 'critical',
    title: 'Payment overdue by 8 days',
    description: 'Invoice was due on August 13, 2026. Vendor escalation alert active.',
    aiRecommendation: 'Execute immediate settlement to preserve vendor terms.',
    createdAtStr: '2026-08-21T08:00:00Z',
    status: 'pending',
  },
];

const mockPayments = [
  { id: 'pay-1', invoiceId: 'inv-0092', invoiceNumber: 'INV-0092', supplierName: 'Metro Components', amount: 840000, dueDate: '2026-09-02', status: 'pending', bankName: 'HDFC Bank, Mumbai Main', accountEnding: '9812', poNumber: 'PO-8291' },
  { id: 'pay-2', invoiceId: 'inv-82731', invoiceNumber: 'INV-82731', supplierName: 'ABC Supplies', amount: 482000, dueDate: '2026-09-04', status: 'on_hold', bankName: 'ICICI Bank, Indiranagar', accountEnding: '1234', poNumber: 'PO-7740' },
  { id: 'pay-3', invoiceId: 'inv-6621', invoiceNumber: 'INV-6621', supplierName: 'Nova Traders', amount: 215000, dueDate: '2026-08-23', status: 'pending', bankName: 'HDFC Bank, Connaught Place', accountEnding: '9812', poNumber: 'PO-9012' },
  { id: 'pay-4', invoiceId: 'inv-1044', invoiceNumber: 'INV-1044', supplierName: 'Delta Supplies', amount: 125000, dueDate: '2026-08-13', status: 'overdue', bankName: 'Axis Bank, Chennai', accountEnding: '1190', poNumber: 'PO-6510' },
  { id: 'pay-5', invoiceId: 'inv-4401', invoiceNumber: 'INV-4401', supplierName: 'ABC Supplies', amount: 240000, dueDate: '2026-09-01', status: 'scheduled', scheduledDate: '2026-09-01', bankName: 'ICICI Bank, Indiranagar', accountEnding: '1234', poNumber: 'PO-8812' },
  { id: 'pay-6', invoiceId: 'inv-5519', invoiceNumber: 'INV-5519', supplierName: 'Precision Tech Tools', amount: 320000, dueDate: '2026-09-05', status: 'scheduled', scheduledDate: '2026-09-05', bankName: 'SBI SME Branch, Ahmedabad', accountEnding: '2314', poNumber: 'PO-8990' },
  { id: 'pay-7', invoiceId: 'inv-0081', invoiceNumber: 'INV-0081', supplierName: 'ABC Supplies', amount: 482000, dueDate: '2026-08-05', status: 'paid', paidDate: '2026-08-05', paymentMethod: 'NEFT - HDFC Bank', bankName: 'ICICI Bank, Indiranagar', accountEnding: '1234' },
];

export const seedDatabase = async () => {
  await connectDB();

  console.log('🌱 Seeding MongoDB database...');

  await InvoiceModel.deleteMany({});
  await InvoiceModel.insertMany(mockInvoices);
  console.log(`✅ Inserted ${mockInvoices.length} invoices`);

  await PurchaseOrderModel.deleteMany({});
  await PurchaseOrderModel.insertMany(mockPurchaseOrders);
  console.log(`✅ Inserted ${mockPurchaseOrders.length} purchase orders`);

  await SupplierModel.deleteMany({});
  await SupplierModel.insertMany(mockSuppliers);
  console.log(`✅ Inserted ${mockSuppliers.length} suppliers`);

  await ExceptionModel.deleteMany({});
  await ExceptionModel.insertMany(mockExceptions);
  console.log(`✅ Inserted ${mockExceptions.length} exceptions`);

  await PaymentModel.deleteMany({});
  await PaymentModel.insertMany(mockPayments);
  console.log(`✅ Inserted ${mockPayments.length} payments`);

  console.log('🚀 Database seeding completed successfully!');
  await mongoose.disconnect();
  process.exit(0);
};

seedDatabase();
