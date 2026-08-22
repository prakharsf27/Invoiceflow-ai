import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { useApp } from '../context/AppContext';
import { formatFullINR } from '../lib/utils';

export const PaymentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { payments } = useApp();
  const [filter, setFilter] = useState<'all' | 'pending' | 'scheduled' | 'paid' | 'on_hold' | 'overdue'>('all');

  const filteredPayments = payments.filter((p) => filter === 'all' || p.status === filter);

  const scheduledAmount = payments
    .filter((p) => p.status === 'scheduled' || p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);

  const overdueAmount = payments
    .filter((p) => p.status === 'overdue')
    .reduce((sum, p) => sum + p.amount, 0);

  const paidAmount = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const filterTabs = [
    { id: 'all', label: 'All Payments' },
    { id: 'pending', label: 'Pending' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'on_hold', label: 'On Hold' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'paid', label: 'Paid' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Payments & Disbursement Schedule
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Track upcoming settlements, vendor credit terms, and cash outflow commitments.
        </p>
      </div>

      {/* 3 Overview Metric Blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-l-4 border-l-brand-600 space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scheduled & Pending</span>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatFullINR(scheduledAmount)}
          </div>
          <span className="text-xs text-slate-400">Ready for disbursement</span>
        </Card>

        <Card className="p-4 border-l-4 border-l-rose-500 space-y-1">
          <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Overdue Payables</span>
          <div className="text-2xl font-bold text-rose-700 tabular-nums">
            {formatFullINR(overdueAmount)}
          </div>
          <span className="text-xs text-rose-500">Requires immediate settlement</span>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500 space-y-1">
          <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Cleared / Paid</span>
          <div className="text-2xl font-bold text-emerald-800 tabular-nums">
            {formatFullINR(paidAmount)}
          </div>
          <span className="text-xs text-emerald-600">Settled disbursements</span>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filter === tab.id
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Payments Schedule Table */}
      <Card className="p-5 space-y-4 border-slate-200/90">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-600" /> Payables Schedule
        </h3>
        <div className="overflow-x-auto">
          {filteredPayments.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900">No payment records found</h3>
              <p className="text-xs text-slate-500">Payment schedules are automatically populated when invoices are ingested into MongoDB.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-50">
                <tr>
                  <th className="py-2.5 px-3">Supplier</th>
                  <th className="py-2.5 px-3">Invoice</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3">Bank Account</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-semibold text-slate-900">{p.supplierName}</td>
                    <td className="py-3 px-3 font-mono text-slate-500">{p.invoiceNumber}</td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900 tabular-nums">{formatFullINR(p.amount)}</td>
                    <td className="py-3 px-3 text-slate-500">{p.dueDate}</td>
                    <td className="py-3 px-3 font-mono text-slate-500">
                      {(p.bankName || 'HDFC Bank').split(',')[0]} (****{p.accountEnding || '1234'})
                    </td>
                    <td className="py-3 px-3"><StatusBadge type="payment" value={p.status} /></td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => navigate(`/app/invoices/${p.invoiceId}`)}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center cursor-pointer"
                      >
                        Review <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                      </button>
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
