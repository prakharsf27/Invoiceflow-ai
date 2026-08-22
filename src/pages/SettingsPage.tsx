import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useApp } from '../context/AppContext';
import { RefreshCw } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { showToast, resetToDefault } = useApp();
  const [activeTab, setActiveTab] = useState<'profile' | 'ai' | 'rules'>('profile');

  const handleSave = () => {
    showToast('Settings & policies saved successfully!', 'success');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Settings & Policies
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure business profile, AI auto-clearance rules, and risk thresholds.
          </p>
        </div>

        <Button
          onClick={resetToDefault}
          variant="outline"
          size="sm"
          className="text-slate-600 border-slate-300 cursor-pointer gap-1.5"
          title="Reset application dataset to original state"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Demo Dataset</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'profile' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Business Profile
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'ai' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          AI Automation Rules
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'rules' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Risk & Fraud Thresholds
        </button>
      </div>

      {activeTab === 'profile' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Organization Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <label className="text-slate-600 font-medium">Business Legal Name</label>
              <input
                type="text"
                defaultValue="Apex Global Technologies Pvt Ltd"
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 font-medium">GSTIN</label>
              <input
                type="text"
                defaultValue="29AAACA1234F1Z5"
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 font-medium">Finance Admin Name</label>
              <input
                type="text"
                defaultValue="Prakhar"
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-600 font-medium">Finance Email</label>
              <input
                type="email"
                defaultValue="prakhar@apextech.com"
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="pt-2">
            <Button onClick={handleSave} variant="primary" size="sm" className="cursor-pointer">Save Changes</Button>
          </div>
        </Card>
      )}

      {activeTab === 'ai' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Autonomous Processing Configuration</h3>
          <div className="space-y-3 text-xs text-slate-700">
            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded text-brand-600 focus:ring-brand-500" />
              <div>
                <span className="font-semibold text-slate-900 block">Auto-schedule 100% matched PO invoices</span>
                <span className="text-slate-500">Invoices with 0% rate variance and valid GSTIN are queued directly for payout.</span>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded text-brand-600 focus:ring-brand-500" />
              <div>
                <span className="font-semibold text-slate-900 block">Perform 3-way line item price validation</span>
                <span className="text-slate-500">Flags invoice if any individual item price exceeds PO quote by &gt; 1%.</span>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded text-brand-600 focus:ring-brand-500" />
              <div>
                <span className="font-semibold text-slate-900 block">Auto-detect duplicate invoices via neural fingerprint</span>
                <span className="text-slate-500">Alerts if invoice matches past 90 days line items by &gt; 80% similarity.</span>
              </div>
            </label>
          </div>
          <div className="pt-2">
            <Button onClick={handleSave} variant="primary" size="sm" className="cursor-pointer">Update AI Rules</Button>
          </div>
        </Card>
      )}

      {activeTab === 'rules' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Fraud Prevention & Bank Security</h3>
          <div className="space-y-3 text-xs text-slate-700">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-1">
              <span className="font-semibold text-rose-900 block">Strict Bank Account Change Verification</span>
              <p className="text-rose-700 text-[11px]">
                Any new bank account on a vendor invoice triggers mandatory manual verification before payout is permitted.
              </p>
            </div>
          </div>
          <div className="pt-2">
            <Button onClick={handleSave} variant="primary" size="sm" className="cursor-pointer">Save Security Rules</Button>
          </div>
        </Card>
      )}
    </div>
  );
};
