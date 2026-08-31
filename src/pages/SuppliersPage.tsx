import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowRight,
  AlertTriangle,
  Users,
  Plus,
  Edit2,
  Trash2,
  Building2,
  CheckCircle2,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/common/StatusBadge';
import { useApp } from '../context/AppContext';
import { formatFullINR } from '../lib/utils';
import { SupplierFormModal } from '../components/suppliers/SupplierFormModal';
import { DeleteSupplierModal } from '../components/suppliers/DeleteSupplierModal';
import type { Supplier } from '../types';

export const SuppliersPage: React.FC = () => {
  const navigate = useNavigate();
  const { suppliers, createSupplier, updateSupplier, deleteSupplier, refreshData } = useApp();

  React.useEffect(() => {
    refreshData();
  }, [refreshData]);

  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'bank_flagged' | 'high_risk'>('all');

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);

  const filtered = useMemo(() => {
    return suppliers.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.gstin.toLowerCase().includes(search.toLowerCase()) ||
        s.email?.toLowerCase().includes(search.toLowerCase()) ||
        s.phone?.includes(search);

      if (!matchesSearch) return false;

      if (filterTab === 'active') return s.status === 'active';
      if (filterTab === 'bank_flagged') return s.bankStatus === 'changed';
      if (filterTab === 'high_risk') return s.riskStatus === 'high' || s.riskLevel === 'high';

      return true;
    });
  }, [suppliers, search, filterTab]);

  const activeCount = useMemo(() => suppliers.filter((s) => s.status === 'active').length, [suppliers]);
  const bankFlaggedCount = useMemo(() => suppliers.filter((s) => s.bankStatus === 'changed').length, [suppliers]);
  const highRiskCount = useMemo(() => suppliers.filter((s) => s.riskStatus === 'high' || s.riskLevel === 'high').length, [suppliers]);

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (sup: Supplier, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSupplier(sup);
    setIsFormModalOpen(true);
  };

  const handleOpenDelete = (sup: Supplier, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingSupplier(sup);
    setIsDeleteModalOpen(true);
  };

  const handleFormSubmit = async (data: Partial<Supplier>) => {
    if (editingSupplier) {
      await updateSupplier(editingSupplier.id, data);
    } else {
      await createSupplier(data);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deletingSupplier) {
      await deleteSupplier(deletingSupplier.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            Suppliers & Vendors
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Vendor profiles, spend analytics, verified bank mandates, and risk monitoring.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search suppliers, GSTIN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"
            />
          </div>

          <Button
            onClick={handleOpenAdd}
            variant="brand"
            size="sm"
            className="shrink-0 font-semibold cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1" />
            <span>Add Supplier</span>
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilterTab('all')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
            filterTab === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All Vendors ({suppliers.length})
        </button>

        <button
          onClick={() => setFilterTab('active')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
            filterTab === 'active'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Active ({activeCount})
        </button>

        {bankFlaggedCount > 0 && (
          <button
            onClick={() => setFilterTab('bank_flagged')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterTab === 'bank_flagged'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Bank Changed ({bankFlaggedCount})</span>
          </button>
        )}

        {highRiskCount > 0 && (
          <button
            onClick={() => setFilterTab('high_risk')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              filterTab === 'high_risk'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            High Risk ({highRiskCount})
          </button>
        )}
      </div>

      {/* Main Content Table */}
      <Card className="overflow-hidden border-slate-200/90 shadow-sm">
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-16 text-center space-y-3 px-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <Users className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">No suppliers found</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {search || filterTab !== 'all'
                    ? 'No suppliers match the current search filters. Try clearing your search query.'
                    : 'You can manually add suppliers using the button below or let InvoiceFlow AI automatically register them during invoice extraction.'}
                </p>
              </div>
              {(!search && filterTab === 'all') && (
                <Button
                  onClick={handleOpenAdd}
                  variant="brand"
                  size="sm"
                  className="font-semibold cursor-pointer shadow-xs mt-2"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  <span>Add First Supplier</span>
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Supplier Name</th>
                  <th className="py-3 px-4">GSTIN</th>
                  <th className="py-3 px-4 text-center">Invoices</th>
                  <th className="py-3 px-4 text-right">Total Payable</th>
                  <th className="py-3 px-4">Bank Mandate</th>
                  <th className="py-3 px-4">Risk Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((sup) => (
                  <tr
                    key={sup.id}
                    onClick={() => navigate(`/app/suppliers/${sup.id}`)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-semibold text-slate-900 group-hover:text-brand-600">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-600 shrink-0" />
                        <span>{sup.name}</span>
                        {sup.bankStatus === 'changed' && (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Bank Changed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                      {sup.gstin || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center tabular-nums font-medium">
                      {sup.invoiceCount || 0}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 tabular-nums">
                      {formatFullINR(sup.totalPayable || 0)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                          sup.bankStatus === 'changed'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {sup.bankStatus === 'changed' ? (
                          <>
                            <AlertTriangle className="w-3 h-3" /> FLAGGED
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> VERIFIED
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge type="risk" value={sup.riskStatus || sup.riskLevel || 'low'} />
                    </td>
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleOpenEdit(sup, e)}
                          title="Edit Supplier"
                          className="p-1 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleOpenDelete(sup, e)}
                          title="Delete Supplier"
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span
                          onClick={() => navigate(`/app/suppliers/${sup.id}`)}
                          className="text-xs font-semibold text-brand-600 group-hover:text-brand-700 inline-flex items-center ml-1 cursor-pointer"
                        >
                          Profile <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Add / Edit Supplier Modal */}
      <SupplierFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        initialData={editingSupplier}
      />

      {/* Delete Confirmation Modal */}
      <DeleteSupplierModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        supplier={deletingSupplier}
      />
    </div>
  );
};
