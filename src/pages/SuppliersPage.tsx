import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, AlertTriangle, Users } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { useApp } from '../context/AppContext';
import { formatFullINR } from '../lib/utils';

export const SuppliersPage: React.FC = () => {
  const navigate = useNavigate();
  const { suppliers } = useApp();
  const [search, setSearch] = useState('');

  const filtered = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.gstin.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Suppliers & Vendors
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Vendor profiles, spend analytics, verified bank mandates, and risk monitoring.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200/90">
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Users className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">No suppliers found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Suppliers are automatically registered and updated as vendor invoices are ingested into your workspace.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Supplier Name</th>
                  <th className="py-3 px-4">GSTIN</th>
                  <th className="py-3 px-4 text-center">Invoices</th>
                  <th className="py-3 px-4 text-right">Total Payable</th>
                  <th className="py-3 px-4">Bank Status</th>
                  <th className="py-3 px-4">Risk Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((sup) => (
                  <tr
                    key={sup.id}
                    onClick={() => navigate(`/app/suppliers/${sup.id}`)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-semibold text-slate-900 group-hover:text-brand-600">
                      <div className="flex items-center gap-2">
                        <span>{sup.name}</span>
                        {sup.bankStatus === 'changed' && (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Bank Changed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">
                      {sup.gstin}
                    </td>
                    <td className="py-3.5 px-4 text-center tabular-nums font-medium">
                      {sup.invoiceCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 tabular-nums">
                      {formatFullINR(sup.totalPayable || 0)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                        sup.bankStatus === 'changed'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {sup.bankStatus === 'changed' ? 'FLAGGED CHANGE' : 'VERIFIED'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge type="risk" value={sup.riskStatus || 'low'} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="text-xs font-semibold text-brand-600 group-hover:text-brand-700 inline-flex items-center">
                        Profile <ArrowRight className="w-3.5 h-3.5 ml-1" />
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
