// Comprehensive test suite verifying Monitoring Page null/undefined safety and API failure resiliency

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    throw new Error(`Assertion failed for: ${testName}`);
  }
}

// Logic copied directly from MonitoringPage to test all pure rendering/formatting functions in isolation
function getSafeBankDisplay(bankDetails?: any): {
  displayText: string;
  hasChanged: boolean;
  previousAccount: string | null;
  ifsc: string | null;
} {
  if (!bankDetails) {
    return {
      displayText: 'Not configured',
      hasChanged: false,
      previousAccount: null,
      ifsc: null,
    };
  }

  const rawAccount = bankDetails.accountNumber;
  const accountNumber =
    typeof rawAccount === 'string' && rawAccount.trim().length > 0
      ? rawAccount.trim()
      : null;

  const rawBankName = bankDetails.bankName;
  let bankName: string | null = null;
  if (typeof rawBankName === 'string' && rawBankName.trim().length > 0) {
    const trimmed = rawBankName.trim();
    const parts = trimmed.split(',');
    bankName = parts.length > 0 && parts[0] ? parts[0].trim() : trimmed;
  }

  const rawIfsc = bankDetails.ifsc;
  const ifsc =
    typeof rawIfsc === 'string' && rawIfsc.trim().length > 0
      ? rawIfsc.trim()
      : null;

  let displayText = 'Not configured';
  if (accountNumber && bankName) {
    displayText = `${accountNumber} (${bankName})`;
  } else if (accountNumber) {
    displayText = ifsc ? `${accountNumber} (IFSC: ${ifsc})` : accountNumber;
  } else if (bankName) {
    displayText = bankName;
  }

  const hasChanged = Boolean(bankDetails.isChangedFromPrevious);
  const previousAccount =
    typeof bankDetails.previousAccountNumber === 'string' &&
    bankDetails.previousAccountNumber.trim().length > 0
      ? bankDetails.previousAccountNumber.trim()
      : null;

  return {
    displayText,
    hasChanged,
    previousAccount,
    ifsc,
  };
}

function formatMonetaryAmount(amount?: number | null): string {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return 'Not available';
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)}L`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

function filterFlaggedInvoices(invoices: any[]): any[] {
  if (!Array.isArray(invoices)) return [];
  return invoices.filter((i) => {
    if (!i) return false;
    const isHighRisk = i.riskLevel === 'high' || i.riskLevel === 'critical';
    const isCriticalStatus = i.status === 'critical';
    const isBankChanged = Boolean(i.bankDetails?.isChangedFromPrevious);
    const isRiskAlert =
      typeof i.aiStatus === 'string' &&
      (i.aiStatus.toLowerCase().includes('risk') ||
        i.aiStatus.toLowerCase().includes('alert') ||
        i.aiStatus.toLowerCase().includes('bank') ||
        i.aiStatus.toLowerCase().includes('duplicate') ||
        i.aiStatus.toLowerCase().includes('critical') ||
        i.aiStatus.toLowerCase().includes('mismatch'));
    const isRiskAnalysisFlagged = Boolean(
      i.riskAnalysis &&
        (i.riskAnalysis.riskLevel === 'high' ||
          i.riskAnalysis.riskLevel === 'critical' ||
          i.riskAnalysis.decision === 'hold')
    );
    return isHighRisk || isCriticalStatus || isBankChanged || isRiskAlert || isRiskAnalysisFlagged;
  });
}

function runMonitoringSafetyTests() {
  console.log('================================================================');
  console.log('  MONITORING PAGE NULL SAFETY & API RESILIENCY TEST SUITE');
  console.log('================================================================\n');

  // --- Test 1: bankDetails = null ---
  console.log('--- Test 1: bankDetails = null ---');
  const res1 = getSafeBankDisplay(null);
  assert(res1.displayText === 'Not configured', 'Null bankDetails returns "Not configured"');
  assert(res1.hasChanged === false, 'Null bankDetails hasChanged is false');
  assert(res1.previousAccount === null, 'Null bankDetails previousAccount is null');

  // --- Test 2: bankDetails = undefined ---
  console.log('\n--- Test 2: bankDetails = undefined ---');
  const res2 = getSafeBankDisplay(undefined);
  assert(res2.displayText === 'Not configured', 'Undefined bankDetails returns "Not configured"');

  // --- Test 3: bankDetails missing bankName (null, undefined, empty) ---
  console.log('\n--- Test 3: bankDetails missing bankName ---');
  const res3a = getSafeBankDisplay({ accountNumber: '9876543210', bankName: null });
  assert(res3a.displayText === '9876543210', 'Null bankName does not call split and returns account number');

  const res3b = getSafeBankDisplay({ accountNumber: '9876543210', bankName: undefined });
  assert(res3b.displayText === '9876543210', 'Undefined bankName does not call split and returns account number');

  const res3c = getSafeBankDisplay({ accountNumber: '9876543210', bankName: '   ' });
  assert(res3c.displayText === '9876543210', 'Whitespace bankName falls back safely');

  // --- Test 4: bankDetails with comma separated branch ---
  console.log('\n--- Test 4: bankDetails with comma separated branch ---');
  const res4 = getSafeBankDisplay({ accountNumber: '9876543210', bankName: 'HDFC Bank, Fort Branch, Mumbai' });
  assert(res4.displayText === '9876543210 (HDFC Bank)', 'Comma-separated branch splits first segment without crash');

  // --- Test 5: bankDetails with mandate change ---
  console.log('\n--- Test 5: bankDetails with mandate change ---');
  const res5 = getSafeBankDisplay({
    accountNumber: '1122334455',
    bankName: 'ICICI Bank',
    isChangedFromPrevious: true,
    previousAccountNumber: '9988776655',
  });
  assert(res5.hasChanged === true, 'isChangedFromPrevious is true');
  assert(res5.previousAccount === '9988776655', 'previousAccount extracted');
  assert(res5.displayText === '1122334455 (ICICI Bank)', 'Display text formatted correctly');

  // --- Test 6: Monetary amount formatting ---
  console.log('\n--- Test 6: Monetary amount formatting ---');
  assert(formatMonetaryAmount(null) === 'Not available', 'Null amount returns "Not available"');
  assert(formatMonetaryAmount(undefined) === 'Not available', 'Undefined amount returns "Not available"');
  assert(formatMonetaryAmount(NaN) === 'Not available', 'NaN amount returns "Not available"');
  assert(formatMonetaryAmount(118000) === '₹1.18L', '118000 formatted to Lakhs');
  assert(formatMonetaryAmount(50000) === '₹50,000', '50000 formatted to standard INR');

  // --- Test 7: Filter flagged invoices with various null/empty anomalies ---
  console.log('\n--- Test 7: Invoices filter with anomalies ---');
  const testInvoices = [
    // Invoice 1: Normal clean
    { id: '1', riskLevel: 'low', status: 'ready', aiStatus: 'Ready', bankDetails: null },
    // Invoice 2: bankDetails = null but high risk
    { id: '2', riskLevel: 'high', status: 'ready', aiStatus: 'Risk Alert', bankDetails: null, amount: 150000 },
    // Invoice 3: bankDetails missing bankName
    { id: '3', riskLevel: 'medium', status: 'critical', aiStatus: 'Critical Mismatch', bankDetails: { accountNumber: '123' } },
    // Invoice 4: Mandate changed
    { id: '4', riskLevel: 'low', status: 'ready', aiStatus: 'Bank Detail Change', bankDetails: { isChangedFromPrevious: true, accountNumber: '456', bankName: 'Axis' } },
    // Invoice 5: Null invoice in array
    null,
    // Invoice 6: Undefined aiStatus, undefined bankDetails
    { id: '6', riskLevel: 'low', status: 'ready' },
  ];

  const flagged = filterFlaggedInvoices(testInvoices);
  assert(flagged.length === 3, `Flagged invoices correctly identified 3 items (got ${flagged.length})`);
  assert(flagged.some((i) => i.id === '2'), 'Invoice 2 included');
  assert(flagged.some((i) => i.id === '3'), 'Invoice 3 included');
  assert(flagged.some((i) => i.id === '4'), 'Invoice 4 included');

  // --- Test 8: Empty or invalid invoices array (simulating API complete failure) ---
  console.log('\n--- Test 8: Empty or invalid invoices array ---');
  assert(filterFlaggedInvoices([])?.length === 0, 'Empty array returns empty array');
  assert(filterFlaggedInvoices(null as any)?.length === 0, 'Null invoices input returns empty array without throwing');
  assert(filterFlaggedInvoices(undefined as any)?.length === 0, 'Undefined invoices input returns empty array without throwing');

  // --- Test 9: Card rendering data extraction on extreme edge-case invoice ---
  console.log('\n--- Test 9: Extreme edge-case invoice rendering attributes ---');
  const extremeAnomalyInvoice: any = {
    id: null,
    supplierName: null,
    invoiceNumber: null,
    poNumber: null,
    amount: null,
    riskLevel: 'high',
    aiStatus: null,
    aiRecommendation: null,
    bankDetails: {
      accountNumber: null,
      bankName: null,
      ifsc: null,
      isChangedFromPrevious: false,
    },
    riskAnalysis: null,
  };

  const bankInfo = getSafeBankDisplay(extremeAnomalyInvoice.bankDetails);
  const supplier = extremeAnomalyInvoice.supplierName?.trim() || 'Unknown Supplier';
  const invNum = extremeAnomalyInvoice.invoiceNumber?.trim() || '—';
  const po = extremeAnomalyInvoice.poNumber?.trim() || null;
  const aiStatus =
    typeof extremeAnomalyInvoice.aiStatus === 'string' && extremeAnomalyInvoice.aiStatus.trim().length > 0
      ? extremeAnomalyInvoice.aiStatus.toUpperCase()
      : extremeAnomalyInvoice.riskLevel === 'high'
      ? 'HIGH RISK'
      : 'SECURITY ALERT';
  const amountStr = formatMonetaryAmount(extremeAnomalyInvoice.amount);
  const rec = extremeAnomalyInvoice.aiRecommendation?.trim() || 'Mandate or risk verification required.';

  assert(bankInfo.displayText === 'Not configured', 'Extreme anomaly: bank is "Not configured"');
  assert(supplier === 'Unknown Supplier', 'Extreme anomaly: supplier is "Unknown Supplier"');
  assert(invNum === '—', 'Extreme anomaly: invNum is "—"');
  assert(po === null, 'Extreme anomaly: po is null');
  assert(aiStatus === 'HIGH RISK', 'Extreme anomaly: aiStatus is "HIGH RISK"');
  assert(amountStr === 'Not available', 'Extreme anomaly: amountStr is "Not available"');
  assert(rec === 'Mandate or risk verification required.', 'Extreme anomaly: rec is safe fallback');

  console.log('\n================================================================');
  console.log('  ALL MONITORING SAFETY & RESILIENCY TESTS PASSED (100%)!');
  console.log('================================================================\n');
}

runMonitoringSafetyTests();
