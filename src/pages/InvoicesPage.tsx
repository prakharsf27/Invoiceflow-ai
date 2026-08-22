import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { useApp } from '../context/AppContext';
import { formatFullINR } from '../lib/utils';

export const InvoicesPage: React.FC = () => {
  const navigate = useNavigate();
  const { invoices } = useApp();
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Search check
      if (search.trim() !== '') {
        const q = search.toLowerCase();
        const matchesQuery =
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.supplierName.toLowerCase().includes(q) ||
          (inv.poNumber && inv.poNumber.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }

      // Filter check
      if (filter === 'needs_review') {
        return inv.status === 'review' || inv.status === 'critical' || inv.status === 'on_hold';
      }
      if (filter === 'ready') {
        return inv.status === 'ready' || inv.status === 'paid';
      }
      if (filter === 'overdue') {
        return inv.status === 'overdue' || inv.paymentStatus === 'overdue';
      }
      if (filter === 'critical') {
        return inv.status === 'critical' || inv.riskLevel === 'high';
      }
      return true;
    });
  }, [invoices, filter, search]);

  const filterTabs = [
    { id: 'all', label: 'All Invoices' },
    { id: 'needs_review', label: 'Needs Review' },
    { id: 'ready', label: 'Ready for Payment' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'critical', label: 'Critical' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Invoice Inbox
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            All invoices processed by InvoiceFlow AI ({filteredInvoices.length} showing).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate('/app/upload')}
            variant="brand"
            size="sm"
            className="cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Invoice</span>
          </Button>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <Card className="p-3.5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                  filter === tab.id
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative flex-1 md:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search invoice number, supplier..."
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
                <h3 className="text-base font-bold text-slate-900">No invoices yet</h3>
                <p className="text-xs text-slate-500">Upload your first invoice to get started.</p>
              </div>
              <Button onClick={() => navigate('/app/upload')} variant="brand" size="sm" className="cursor-pointer">
                Upload Invoice
              </Button>
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
                {filteredInvoices.map((inv) => (
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
                    <td className="py-3.5 px-4 text-slate-500">
                      {inv.invoiceDate}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {inv.dueDate}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">
                      {inv.poNumber || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge type="ai" value={inv.aiStatus} />
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge type="payment" value={inv.paymentStatus} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center text-xs font-semibold text-brand-600 group-hover:text-brand-700">
                        Details <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
};
