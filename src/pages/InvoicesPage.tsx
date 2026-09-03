import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { StatusBadge } from '../components/common/StatusBadge';
import { useApp } from '../context/AppContext';
import { formatFullINR } from '../lib/utils';
import { getInvoiceAIJudgment, TriageCategory } from '../lib/invoiceTriage';

export const InvoicesPage: React.FC = () => {
  const navigate = useNavigate();
  const { invoices, purchaseOrders, refreshData } = useApp();
  const [filter, setFilter] = useState<TriageCategory>('all');
  const [search, setSearch] = useState<string>('');

  React.useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Compute dynamic counts for the triage filter tabs
  const counts = useMemo(() => {
    let matched = 0;
    let mismatch = 0;
    let tax_math = 0;
    let missing_po = 0;
    let review = 0;

    for (const inv of invoices) {
      const j = getInvoiceAIJudgment(inv, purchaseOrders);
      if (j.category === 'matched') {
        matched++;
      } else {
        review++;
        if (j.category === 'mismatch') mismatch++;
        if (j.category === 'tax_math') tax_math++;
        if (j.category === 'missing_po') missing_po++;
      }
    }

    return {
      all: invoices.length,
      matched,
      mismatch,
      tax_math,
      missing_po,
      review,
    };
  }, [invoices, purchaseOrders]);

  const filterTabs: Array<{ id: TriageCategory; label: string; count: number }> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'matched', label: 'Matched', count: counts.matched },
    { id: 'mismatch', label: 'PO Mismatch', count: counts.mismatch },
    { id: 'tax_math', label: 'Tax / Math', count: counts.tax_math },
    { id: 'missing_po', label: 'Missing PO', count: counts.missing_po },
    { id: 'review', label: 'Review', count: counts.review },
  ];

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const judgment = getInvoiceAIJudgment(inv, purchaseOrders);

      // Search check across invoice number, supplier name, PO number, AI reason, and badge label
      if (search.trim() !== '') {
        const q = search.toLowerCase();
        const matchesQuery =
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.supplierName.toLowerCase().includes(q) ||
          (inv.poNumber && inv.poNumber.toLowerCase().includes(q)) ||
          judgment.reason.toLowerCase().includes(q) ||
          judgment.badgeLabel.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      // Filter check based on triage categories
      if (filter === 'matched') {
        return judgment.category === 'matched';
      }
      if (filter === 'mismatch') {
        return judgment.category === 'mismatch';
      }
      if (filter === 'tax_math') {
        return judgment.category === 'tax_math';
      }
      if (filter === 'missing_po') {
        return judgment.category === 'missing_po';
      }
      if (filter === 'review') {
        return judgment.category !== 'matched';
      }
      return true;
    });
  }, [invoices, purchaseOrders, filter, search]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Invoice Inbox
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            AI-powered decision stream ({filteredInvoices.length} of {invoices.length} invoices showing).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate('/app/upload')}
            variant="brand"
            size="sm"
            className="cursor-pointer gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Document</span>
          </Button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <Card className="p-3 border-slate-200/90">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  filter === tab.id
                    ? 'bg-slate-900 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                    filter === tab.id
                      ? 'bg-slate-700 text-slate-100'
                      : 'bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative flex-1 md:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search invoice, supplier, reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
            />
          </div>
        </div>
      </Card>

      {/* Invoices Table */}
      <Card className="overflow-hidden border-slate-200/90">
        <div className="overflow-x-auto">
          {filteredInvoices.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Plus className="w-6 h-6 text-slate-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  {invoices.length === 0 ? 'No invoices in workspace yet' : 'No matching invoices'}
                </h3>
                <p className="text-xs text-slate-500">
                  {invoices.length === 0
                    ? 'Upload an invoice or purchase order to begin automated processing.'
                    : `No invoices match the selected filter "${filterTabs.find((t) => t.id === filter)?.label || filter}".`}
                </p>
              </div>
              {invoices.length === 0 && (
                <Button onClick={() => navigate('/app/upload')} variant="brand" size="sm" className="cursor-pointer">
                  Upload Invoice
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-semibold">Invoice</th>
                  <th className="py-3 px-4 font-semibold">Supplier</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount</th>
                  <th className="py-3 px-4 font-semibold">Invoice Date</th>
                  <th className="py-3 px-4 font-semibold">Due Date</th>
                  <th className="py-3 px-4 font-semibold">PO Ref</th>
                  <th className="py-3 px-4 font-semibold">AI Verification</th>
                  <th className="py-3 px-4 font-semibold">Payment Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredInvoices.map((inv) => {
                  const judgment = getInvoiceAIJudgment(inv, purchaseOrders);

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => navigate(`/app/invoices/${inv.id}`)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 group-hover:text-brand-600">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {inv.supplierName}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 tabular-nums">
                        {formatFullINR(inv.amount)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {inv.invoiceDate || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {inv.dueDate || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {inv.poNumber && inv.poNumber.trim() !== '' && inv.poNumber !== '—' ? (
                          <span className="text-slate-700 font-medium">{inv.poNumber}</span>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col items-start gap-1" title={judgment.details || judgment.reason}>
                          <Badge variant={judgment.badgeVariant} size="sm" dot>
                            {judgment.badgeLabel}
                          </Badge>
                          <span className="text-[10.5px] font-bold font-mono tracking-tight text-slate-700 whitespace-nowrap">
                            {judgment.reason}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge type="payment" value={inv.paymentStatus} />
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className="inline-flex items-center text-xs font-semibold text-brand-600 group-hover:text-brand-700">
                          Details <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
};
