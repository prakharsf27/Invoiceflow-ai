import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  CreditCard,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  AlertTriangle,
  ArrowRight,
  Edit2,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/common/StatusBadge';
import { useApp } from '../context/AppContext';
import { formatFullINR } from '../lib/utils';
import { SupplierFormModal } from '../components/suppliers/SupplierFormModal';
import { DeleteSupplierModal } from '../components/suppliers/DeleteSupplierModal';
import type { Supplier } from '../types';

export const SupplierDetailsPage: React.FC = () => {
  const { supplierId } = useParams<{ supplierId: string }>();
  const navigate = useNavigate();
  const { suppliers, invoices, updateSupplier, deleteSupplier, refreshData } = useApp();

  React.useEffect(() => {
    refreshData();
  }, [refreshData]);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const supplier = suppliers.find(
    (s) => s.id === supplierId || s.name.toLowerCase().includes(supplierId?.toLowerCase() || '')
  );

  const supplierInvoices = invoices.filter(
    (i) => i.supplierId === supplier?.id || i.supplierName?.toLowerCase() === supplier?.name?.toLowerCase()
  );

  if (!supplier) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-3">
        <h2 className="text-base font-bold text-slate-900">Supplier Not Found</h2>
        <p className="text-xs text-slate-500">
          The requested vendor could not be located in your organization workspace.
        </p>
        <Button onClick={() => navigate('/app/suppliers')} variant="outline" size="sm" className="cursor-pointer">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Suppliers
        </Button>
      </div>
    );
  }

  const handleEditSubmit = async (data: Partial<Supplier>) => {
    await updateSupplier(supplier.id, data);
  };

  const handleDeleteConfirm = async () => {
    await deleteSupplier(supplier.id);
    navigate('/app/suppliers', { replace: true });
  };

  const primaryBank = supplier.bankAccounts?.[0];

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/app/suppliers')}
          className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Suppliers
        </button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFormModalOpen(true)}
            className="cursor-pointer text-xs font-semibold"
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" />
            <span>Edit Profile</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDeleteModalOpen(true)}
            className="cursor-pointer text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-200"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            <span>Delete</span>
          </Button>
        </div>
      </div>

      {/* Supplier Profile Header Card */}
      <Card className="p-6 border-slate-200/90 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center font-bold">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900">{supplier.name}</h1>
                  <StatusBadge type="risk" value={supplier.riskStatus || supplier.riskLevel || 'low'} />
                  {supplier.bankStatus === 'changed' && (
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Bank Changed
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  ID: {supplier.id} • GSTIN: {supplier.gstin || 'Not provided'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-xs text-slate-500 block">Total Payables</span>
              <span className="text-xl font-bold text-slate-900 tabular-nums">
                {formatFullINR(supplier.totalPayable || supplier.totalSpend || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Vendor Detail Chips */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="space-y-0.5">
            <span className="text-slate-400 text-[11px] block flex items-center gap-1">
              <Mail className="w-3 h-3" /> Email
            </span>
            <span className="font-medium text-slate-800">{supplier.email || '—'}</span>
          </div>

          <div className="space-y-0.5">
            <span className="text-slate-400 text-[11px] block flex items-center gap-1">
              <Phone className="w-3 h-3" /> Phone
            </span>
            <span className="font-medium text-slate-800">{supplier.phone || '—'}</span>
          </div>

          <div className="space-y-0.5">
            <span className="text-slate-400 text-[11px] block flex items-center gap-1">
              <FileText className="w-3 h-3" /> Payment Terms
            </span>
            <span className="font-medium text-slate-800">{(supplier as any).paymentTerms || 'Net 30'}</span>
          </div>

          <div className="space-y-0.5">
            <span className="text-slate-400 text-[11px] block flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Status
            </span>
            <span className="font-semibold text-emerald-700 capitalize">{supplier.status || 'active'}</span>
          </div>
        </div>
      </Card>

      {/* Grid: Bank Mandate & AI Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bank Mandate Card */}
        <Card className="p-5 border-slate-200/90 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-brand-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Bank Mandate
              </h3>
            </div>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                supplier.bankStatus === 'changed'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {supplier.bankStatus === 'changed' ? 'FLAGGED CHANGE' : 'VERIFIED MANDATE'}
            </span>
          </div>

          {primaryBank ? (
            <div className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Bank Name</span>
                <span className="font-semibold text-slate-900">{primaryBank.bankName || 'Verified Bank'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Account Number</span>
                <span className="font-mono font-bold text-slate-900">{primaryBank.accountNumber || '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">IFSC Code</span>
                <span className="font-mono font-bold text-slate-900">{primaryBank.ifsc || '—'}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-2">
              No bank account specified. Invoices from this vendor will extract bank details automatically.
            </p>
          )}
        </Card>

        {/* AI Behavioral Insights */}
        <Card className="p-5 bg-gradient-to-r from-purple-50/40 via-white to-slate-50 border-brand-200/80 space-y-2 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-600" />
              <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider">
                AI Risk & Spend Intelligence
              </h3>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed font-medium">
              {supplier.bankStatus === 'changed'
                ? 'Supplier payment details changed on recent invoice submission. Previous invoices used a different bank account. Dual-authorization is recommended.'
                : `${supplier.name} has submitted ${supplierInvoices.length} invoices. Average settlement turnaround is on schedule with low anomaly variance.`}
            </p>
          </div>

          <div className="pt-2 text-[11px] text-slate-500 font-mono">
            Last Activity: {supplier.lastInvoiceDate || 'N/A'} • Total Invoices: {supplierInvoices.length}
          </div>
        </Card>
      </div>

      {/* Associated Invoices List */}
      <Card className="p-5 space-y-3 border-slate-200">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Associated Invoices ({supplierInvoices.length})
        </h3>

        {supplierInvoices.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No invoices have been ingested for this supplier yet.
          </div>
        ) : (
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
        )}
      </Card>

      {/* Edit Form Modal */}
      <SupplierFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={handleEditSubmit}
        initialData={supplier}
      />

      {/* Delete Confirmation Modal */}
      <DeleteSupplierModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        supplier={supplier}
      />
    </div>
  );
};
