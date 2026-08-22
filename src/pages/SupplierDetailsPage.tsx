import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, CreditCard, History, ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/common/StatusBadge';
import { useApp } from '../context/AppContext';
import { formatFullINR } from '../lib/utils';

export const SupplierDetailsPage: React.FC = () => {
  const { supplierId } = useParams<{ supplierId: string }>();
  const navigate = useNavigate();
  const { suppliers, invoices } = useApp();

  const supplier = suppliers.find((s) => s.id === supplierId || s.name.toLowerCase().includes(supplierId?.toLowerCase() || ''));

  const supplierInvoices = invoices.filter(
    (i) => i.supplierId === supplier?.id || i.supplierName === supplier?.name
  );

  if (!supplier) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-3">
        <h2 className="text-base font-bold text-slate-900">Supplier Not Found</h2>
        <Button onClick={() => navigate('/app/suppliers')} variant="outline" size="sm" className="cursor-pointer">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Suppliers
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/app/suppliers')}
        className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Suppliers
      </button>

      {/* Supplier Profile Header */}
      <Card className="p-6 border-slate-200/90 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900">{supplier.name}</h1>
              <StatusBadge type="risk" value={supplier.riskStatus || 'low'} />
            </div>
            <p className="text-xs text-slate-500 font-mono">
              GSTIN: {supplier.gstin} • {supplier.email} • {supplier.phone}
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-slate-500 block">Total Payables</span>
              <span className="text-xl font-bold text-slate-900 tabular-nums">{formatFullINR(supplier.totalPayable || 0)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* AI Risk & Behavioral Insight */}
      <Card className="p-5 bg-gradient-to-r from-purple-50/40 via-white to-slate-50 border-brand-200/80 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-600" />
          <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider">AI Behavioral Insights</h3>
        </div>
        <p className="text-xs text-slate-700 leading-relaxed font-medium">
          {supplier.name === 'Nova Traders'
            ? 'Supplier payment details changed on August 20. Previous invoices used a different bank account. Recommend dual-authorization before processing next disbursement.'
            : `${supplier.name} has submitted ${supplierInvoices.length} invoices with an average payment settlement turnaround of 12 days.`}
        </p>
      </Card>

      {/* Associated Invoices */}
      <Card className="p-5 space-y-3 border-slate-200">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Associated Invoices ({supplierInvoices.length})
        </h3>

        <div className="divide-y divide-slate-100 text-xs">
          {supplierInvoices.map((inv) => (
            <div
              key={inv.id}
              onClick={() => navigate(`/app/invoices/${inv.id}`)}
              className="py-3 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer px-2 rounded-lg"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-900">{inv.invoiceNumber}</span>
                  <StatusBadge type="ai" value={inv.aiStatus} />
                </div>
                <span className="text-slate-500 block">Due: {inv.dueDate}</span>
              </div>

              <div className="text-right">
                <span className="font-bold text-slate-900 tabular-nums block">{formatFullINR(inv.amount)}</span>
                <span className="text-brand-600 hover:underline inline-flex items-center gap-0.5">
                  Inspect <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
