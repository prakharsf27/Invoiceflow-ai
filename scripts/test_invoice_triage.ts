import { getInvoiceAIJudgment } from '../src/lib/invoiceTriage';
import type { Invoice, PurchaseOrder } from '../src/types';

const mockPOs: PurchaseOrder[] = [
  {
    id: 'po-020',
    poNumber: 'PO-2026-TEST-020',
    supplierId: 'sup-apex',
    supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
    totalAmount: 118000,
    issuedDate: '2026-08-10',
    status: 'matched',
    matchStatus: 'matched',
    items: [],
  },
  {
    id: 'po-021',
    poNumber: 'PO-2026-TEST-021',
    supplierId: 'sup-datacore',
    supplierName: 'DataCore Industrial Supplies Pvt Ltd',
    totalAmount: 536364,
    issuedDate: '2026-08-05',
    status: 'mismatch',
    matchStatus: 'mismatch',
    items: [],
  },
  {
    id: 'po-8812',
    poNumber: 'PO-8812',
    supplierId: 'sup-abc',
    supplierName: 'ABC Supplies',
    totalAmount: 240000,
    issuedDate: '2026-08-10',
    status: 'matched',
    matchStatus: 'matched',
    items: [],
  },
  {
    id: 'po-8291',
    poNumber: 'PO-8291',
    supplierId: 'sup-metro',
    supplierName: 'Metro Components',
    totalAmount: 790000,
    issuedDate: '2026-08-02',
    status: 'mismatch',
    matchStatus: 'mismatch',
    items: [],
  },
];

console.log('================================================================');
console.log('🧪 RUNNING INVOICE INBOX AI TRIAGE & REASON VERIFICATION SUITE');
console.log('================================================================\n');

// Case 1: INV-TEST-020 (100% PO Match)
console.log('📌 [TEST 1] INV-TEST-020 (Reconciled match)...');
const inv020: Invoice = {
  id: 'inv-020',
  invoiceNumber: 'INV-TEST-020',
  supplierId: 'sup-apex',
  supplierName: 'Apex Cloud Solutions Pvt. Ltd.',
  poNumber: 'PO-2026-TEST-020',
  amount: 118000,
  currency: 'INR',
  subtotal: 100000,
  tax: 18000,
  discount: 0,
  invoiceDate: '2026-08-20',
  dueDate: '2026-09-10',
  status: 'ready',
  aiStatus: 'Ready',
  paymentStatus: 'scheduled',
  riskLevel: 'low',
  paymentTerms: 'Net 20 Days',
  items: [],
  aiChecks: [{ id: 'c1', title: '3-Way PO Match', passed: true, type: 'success', detail: '100% matched' }],
  aiRecommendation: 'Ready for payment',
  evidence: [],
};
const res020 = getInvoiceAIJudgment(inv020, mockPOs);
console.log('   Result:', res020);
if (res020.badgeLabel !== 'READY' || res020.reason !== '100% PO MATCH' || res020.category !== 'matched') {
  throw new Error('Case 1 Failed: ' + JSON.stringify(res020));
}
console.log('   ✅ Passed Test 1: INV-TEST-020 → READY / 100% PO MATCH\n');

// Case 2: INV-TEST-021 (PO Overrun +10%)
console.log('📌 [TEST 2] INV-TEST-021 (PO Overrun)...');
const inv021: Invoice = {
  id: 'inv-021',
  invoiceNumber: 'INV-TEST-021',
  supplierId: 'sup-datacore',
  supplierName: 'DataCore Industrial Supplies Pvt Ltd',
  poNumber: 'PO-2026-TEST-021',
  amount: 590000,
  currency: 'INR',
  subtotal: 500000,
  tax: 90000,
  discount: 0,
  invoiceDate: '2026-08-21',
  dueDate: '2026-09-04',
  status: 'critical',
  aiStatus: 'PO Mismatch',
  paymentStatus: 'pending',
  riskLevel: 'high',
  paymentTerms: 'Net 14 Days',
  items: [],
  aiChecks: [{ id: 'c1', title: 'PO Total Variance Detected', passed: false, type: 'critical', detail: 'PO Overrun +10%' }],
  aiRecommendation: 'Overrun detected',
  evidence: [{ title: 'Total Comparison', invoiceValue: '₹5,90,000', referenceValue: '₹5,36,364', difference: '+10% Overrun', explanation: 'Overrun detected' }],
};
const res021 = getInvoiceAIJudgment(inv021, mockPOs);
console.log('   Result:', res021);
if (res021.badgeLabel !== 'MISMATCH' || res021.reason !== 'PO OVERRUN +10%' || res021.category !== 'mismatch') {
  throw new Error('Case 2 Failed: ' + JSON.stringify(res021));
}
console.log('   ✅ Passed Test 2: INV-TEST-021 → MISMATCH / PO OVERRUN +10%\n');

// Case 3: INV-TEST-018 (Missing PO)
console.log('📌 [TEST 3] INV-TEST-018 (Missing PO reference)...');
const inv018: Invoice = {
  id: 'inv-018',
  invoiceNumber: 'INV-TEST-018',
  supplierId: 'sup-precision',
  supplierName: 'Precision Engineering Works',
  poNumber: '',
  amount: 175000,
  currency: 'INR',
  subtotal: 148305,
  tax: 26695,
  discount: 0,
  invoiceDate: '2026-08-22',
  dueDate: '2026-09-12',
  status: 'review',
  aiStatus: 'Needs Review',
  paymentStatus: 'pending',
  riskLevel: 'medium',
  paymentTerms: 'Net 21 Days',
  items: [],
  aiChecks: [{ id: 'c1', title: 'PO Check', passed: false, type: 'warning', detail: 'No PO reference' }],
  aiRecommendation: 'Missing PO reference',
  evidence: [],
};
const res018 = getInvoiceAIJudgment(inv018, mockPOs);
console.log('   Result:', res018);
if (res018.badgeLabel !== 'REVIEW' || res018.reason !== 'MISSING PO' || res018.category !== 'missing_po') {
  throw new Error('Case 3 Failed: ' + JSON.stringify(res018));
}
console.log('   ✅ Passed Test 3: INV-TEST-018 → REVIEW / MISSING PO\n');

// Case 4: INV-TEST-016 (Tax / Math Discrepancy)
console.log('📌 [TEST 4] INV-TEST-016 (Tax / Math Discrepancy)...');
const inv016: Invoice = {
  id: 'inv-016',
  invoiceNumber: 'INV-TEST-016',
  supplierId: 'sup-bharat',
  supplierName: 'Bharat Logistics Hub',
  poNumber: 'PO-2026-TEST-016',
  amount: 135000,
  currency: 'INR',
  subtotal: 100000,
  tax: 18000,
  discount: 0,
  invoiceDate: '2026-08-23',
  dueDate: '2026-09-08',
  status: 'review',
  aiStatus: 'Math Discrepancy',
  paymentStatus: 'pending',
  riskLevel: 'high',
  paymentTerms: 'Net 15 Days',
  items: [],
  aiChecks: [{ id: 'math-1', title: 'Math & Tax Computations', passed: false, type: 'critical', detail: 'Subtotal + Tax does not equal Total' }],
  aiRecommendation: 'Math discrepancy detected',
  evidence: [],
};
const res016 = getInvoiceAIJudgment(inv016, mockPOs);
console.log('   Result:', res016);
if (res016.badgeLabel !== 'REVIEW' || res016.reason !== 'TAX / MATH DISCREPANCY' || res016.category !== 'tax_math') {
  throw new Error('Case 4 Failed: ' + JSON.stringify(res016));
}
console.log('   ✅ Passed Test 4: INV-TEST-016 → REVIEW / TAX / MATH DISCREPANCY\n');

// Case 5: INV-TEST-019 (PO Not Found)
console.log('📌 [TEST 5] INV-TEST-019 (PO Not Found in procurement system)...');
const inv019: Invoice = {
  id: 'inv-019',
  invoiceNumber: 'INV-TEST-019',
  supplierId: 'sup-omnitech',
  supplierName: 'OmniTech Components',
  poNumber: 'PO-2026-TEST-019',
  amount: 210000,
  currency: 'INR',
  subtotal: 177966,
  tax: 32034,
  discount: 0,
  invoiceDate: '2026-08-24',
  dueDate: '2026-09-14',
  status: 'review',
  aiStatus: 'Needs Review',
  paymentStatus: 'pending',
  riskLevel: 'medium',
  paymentTerms: 'Net 21 Days',
  items: [],
  aiChecks: [{ id: 'po-1', title: 'PO Match', passed: false, type: 'warning', detail: 'PO not found in database' }],
  aiRecommendation: 'PO not found',
  evidence: [],
};
const res019 = getInvoiceAIJudgment(inv019, mockPOs);
console.log('   Result:', res019);
if (res019.badgeLabel !== 'REVIEW' || res019.reason !== 'PO NOT FOUND' || res019.category !== 'missing_po') {
  throw new Error('Case 5 Failed: ' + JSON.stringify(res019));
}
console.log('   ✅ Passed Test 5: INV-TEST-019 → REVIEW / PO NOT FOUND\n');

// Case 6: Edge Case (Requirement 7): Prefer specific Tax Discrepancy over generic "PO Mismatch"
console.log('📌 [TEST 6] Prefer specific Tax Discrepancy over generic "PO Mismatch"...');
const invEdgeTaxMismatch: Invoice = {
  id: 'inv-edge-1',
  invoiceNumber: 'INV-EDGE-01',
  supplierId: 'sup-metro',
  supplierName: 'Metro Components',
  poNumber: 'PO-8291',
  amount: 840000,
  currency: 'INR',
  subtotal: 700000,
  tax: 100000,
  discount: 0,
  invoiceDate: '2026-08-18',
  dueDate: '2026-09-02',
  status: 'critical',
  aiStatus: 'PO Mismatch', // Generic label from backend
  paymentStatus: 'pending',
  riskLevel: 'high',
  paymentTerms: 'Net 15 Days',
  items: [],
  aiChecks: [
    { id: 'c-tax', title: 'Tax Calculation', passed: false, type: 'critical', detail: 'Tax mismatch: calculated ₹126,000 vs invoice ₹100,000' },
    { id: 'c-po', title: 'PO Match', passed: false, type: 'critical', detail: 'Amount variance' }
  ],
  aiRecommendation: 'Tax error',
  evidence: [],
};
const resEdgeTax = getInvoiceAIJudgment(invEdgeTaxMismatch, mockPOs);
console.log('   Result:', resEdgeTax);
if (resEdgeTax.reason !== 'TAX / MATH DISCREPANCY' || resEdgeTax.category !== 'tax_math') {
  throw new Error('Case 6 Failed: Expected TAX / MATH DISCREPANCY, got ' + resEdgeTax.reason);
}
console.log('   ✅ Passed Test 6: Specific tax/math discrepancy preferred over generic PO Mismatch\n');

// Case 7: PO Underrun -5%
console.log('📌 [TEST 7] PO Underrun -5% calculation...');
const invUnderrun: Invoice = {
  id: 'inv-under',
  invoiceNumber: 'INV-UNDER-01',
  supplierId: 'sup-metro',
  supplierName: 'Metro Components',
  poNumber: 'PO-8291', // PO total is 790,000
  amount: 750500, // 5% underrun (790000 * 0.95 = 750500)
  currency: 'INR',
  subtotal: 636017,
  tax: 114483,
  discount: 0,
  invoiceDate: '2026-08-18',
  dueDate: '2026-09-02',
  status: 'critical',
  aiStatus: 'PO Mismatch',
  paymentStatus: 'pending',
  riskLevel: 'high',
  paymentTerms: 'Net 15 Days',
  items: [],
  aiChecks: [],
  aiRecommendation: 'Underrun',
  evidence: [],
};
const resUnder = getInvoiceAIJudgment(invUnderrun, mockPOs);
console.log('   Result:', resUnder);
if (resUnder.reason !== 'PO UNDERRUN -5%' || resUnder.category !== 'mismatch') {
  throw new Error('Case 7 Failed: Expected PO UNDERRUN -5%, got ' + resUnder.reason);
}
console.log('   ✅ Passed Test 7: PO Underrun correctly identified and calculated\n');

// Case 8: Bank Detail Changed Critical Alert
console.log('📌 [TEST 8] Bank Detail Changed...');
const invBank: Invoice = {
  id: 'inv-bank',
  invoiceNumber: 'INV-BANK-01',
  supplierId: 'sup-abc',
  supplierName: 'ABC Supplies',
  poNumber: 'PO-8812',
  amount: 240000,
  currency: 'INR',
  subtotal: 203390,
  tax: 36610,
  discount: 0,
  invoiceDate: '2026-08-19',
  dueDate: '2026-09-01',
  status: 'critical',
  aiStatus: 'Bank Detail Change',
  paymentStatus: 'pending',
  riskLevel: 'high',
  paymentTerms: 'Net 30 Days',
  items: [],
  bankDetails: {
    accountNumber: '998877665544',
    ifsc: 'HDFC0001042',
    bankName: 'HDFC Bank, Mumbai',
    isChangedFromPrevious: true,
  },
  aiChecks: [{ id: 'b1', title: 'Bank Account Changed', passed: false, type: 'critical', detail: 'Bank account changed' }],
  aiRecommendation: 'Bank change detected',
  evidence: [],
};
const resBank = getInvoiceAIJudgment(invBank, mockPOs);
console.log('   Result:', resBank);
if (resBank.badgeLabel !== 'CRITICAL' || resBank.reason !== 'BANK DETAIL CHANGE' || resBank.category !== 'review') {
  throw new Error('Case 8 Failed: Expected CRITICAL / BANK DETAIL CHANGE, got ' + JSON.stringify(resBank));
}
console.log('   ✅ Passed Test 8: Bank Detail Change correctly flagged as CRITICAL\n');

// Case 9: Accepted Variance
console.log('📌 [TEST 9] Variance Accepted Reconciled...');
const invVariance: Invoice = {
  id: 'inv-var',
  invoiceNumber: 'INV-VAR-01',
  supplierId: 'sup-metro',
  supplierName: 'Metro Components',
  poNumber: 'PO-8291',
  amount: 840000,
  currency: 'INR',
  subtotal: 711864,
  tax: 128136,
  discount: 0,
  invoiceDate: '2026-08-18',
  dueDate: '2026-09-02',
  status: 'ready',
  aiStatus: 'Variance Accepted',
  paymentStatus: 'scheduled',
  riskLevel: 'low',
  paymentTerms: 'Net 15 Days',
  items: [],
  aiChecks: [],
  aiRecommendation: 'Variance accepted by user',
  evidence: [],
};
const resVariance = getInvoiceAIJudgment(invVariance, mockPOs);
console.log('   Result:', resVariance);
if (resVariance.badgeLabel !== 'READY' || resVariance.reason !== 'VARIANCE ACCEPTED' || resVariance.category !== 'matched') {
  throw new Error('Case 9 Failed: Expected READY / VARIANCE ACCEPTED, got ' + JSON.stringify(resVariance));
}
console.log('   ✅ Passed Test 9: Variance Accepted correctly marked as READY\n');

console.log('================================================================');
console.log('🎉 ALL 9 TRIAGE VERIFICATION TESTS PASSED FLAWLESSLY!');
console.log('================================================================\n');
