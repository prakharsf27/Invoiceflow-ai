import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Inbox } from 'lucide-react';
import { Card } from '../ui/Card';
import { StatusBadge } from '../common/StatusBadge';
import { formatFullINR } from '../../lib/utils';
import { useApp } from '../../context/AppContext';

export const RecentActivityList: React.FC = () => {
  const navigate = useNavigate();
  const { invoices } = useApp();

  return (
    <Card className="p-5 border-slate-200/90">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Recent Invoices Stream
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Latest stream processed by InvoiceFlow AI
          </p>
        </div>
        <button
          onClick={() => navigate('/app/invoices')}
          className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>Open Inbox</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="py-8 text-center space-y-2 border border-dashed border-slate-200 rounded-lg">
          <Inbox className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-xs font-medium text-slate-700">No invoices ingested yet</p>
          <p className="text-[11px] text-slate-500">Upload your first invoice to view real-time stream.</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-medium">
                <th className="pb-2.5 font-semibold">Invoice</th>
                <th className="pb-2.5 font-semibold">Supplier</th>
                <th className="pb-2.5 font-semibold text-right">Amount</th>
                <th className="pb-2.5 font-semibold">Due Date</th>
                <th className="pb-2.5 font-semibold">AI Verification</th>
                <th className="pb-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {invoices.slice(0, 5).map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => navigate(`/app/invoices/${inv.id}`)}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                >
                  <td className="py-3 font-mono font-medium text-slate-900 group-hover:text-brand-600">
                    {inv.invoiceNumber}
                  </td>
                  <td className="py-3 font-medium text-slate-800">
                    {inv.supplierName}
                  </td>
                  <td className="py-3 text-right font-bold text-slate-900 tabular-nums">
                    {formatFullINR(inv.amount)}
                  </td>
                  <td className="py-3 text-slate-500">
                    {inv.dueDate}
                  </td>
                  <td className="py-3">
                    <StatusBadge type="ai" value={inv.aiStatus} />
                  </td>
                  <td className="py-3 text-right">
                    <span className="inline-flex items-center text-xs font-medium text-slate-400 group-hover:text-brand-600">
                      View →
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
