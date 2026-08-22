import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ArrowDown,
  Bot,
  FileCheck2,
  Search,
  Building2,
  FileText,
  GitCompare,
  TrendingUp,
  Sliders,
  Check,
  X
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { formatFullINR } from '../lib/utils';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans antialiased selection:bg-brand-500 selection:text-white">
      {/* SECTION 1 — HEADER */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate('/app')}>
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-600 text-white font-bold text-sm shadow-xs">
              IF
            </div>
            <span className="font-bold text-slate-900 text-base tracking-tight flex items-center gap-1.5">
              InvoiceFlow <span className="text-[10px] font-bold px-1.5 py-0.5 text-brand-700 bg-brand-50 border border-brand-200/70 rounded">AI</span>
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How It Works</a>
            <a href="#exceptions" className="hover:text-slate-900 transition-colors">Why InvoiceFlow</a>
            <a href="#copilot" className="hover:text-slate-900 transition-colors">AI Copilot</a>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-2 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/register')}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-xs transition-all active:scale-[0.99] cursor-pointer"
            >
              <span>Try InvoiceFlow</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* SECTION 2 — HERO */}
        <section className="pt-16 pb-12 sm:pt-20 sm:pb-16 px-6 sm:px-8 lg:px-12">
          <div className="max-w-4xl mx-auto text-center space-y-5">
            {/* Eyebrow */}
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              FINANCE OPERATIONS, AUTOMATED
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.12] max-w-3xl mx-auto">
              Your invoices.<br />
              Already taken care of.
            </h1>

            {/* Supporting Text */}
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed pt-1">
              InvoiceFlow extracts, validates and reconciles incoming invoices — so your finance team only deals with the exceptions that need a decision.
            </p>

            {/* Compact Buttons */}
            <div className="flex flex-row flex-wrap items-center justify-center gap-3.5 pt-4">
              <button
                onClick={() => navigate('/app')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-xs hover:shadow-sm transition-all cursor-pointer w-fit"
              >
                <span>Open InvoiceFlow</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs transition-all cursor-pointer w-fit"
              >
                See how it works
              </a>
            </div>
          </div>
        </section>

        {/* SECTION 3 — PRODUCT PREVIEW (Centerpiece Dashboard Mockup) */}
        <section className="pb-16 px-6 sm:px-8 lg:px-12 max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-elevated overflow-hidden text-left">
            {/* App Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-brand-600 text-white flex items-center justify-center font-bold text-[10px]">
                  IF
                </div>
                <span className="font-bold text-slate-900">InvoiceFlow Operations</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-500 font-mono">Workspace: Apex Technologies</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
            </div>

            {/* Dashboard Workspace Mock Content */}
            <div className="p-5 sm:p-6 bg-[#F8FAFC] space-y-4">
              {/* 4 Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Total Payables</span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums">₹12.4L</div>
                  <span className="text-[10px] text-emerald-600 font-medium">+2.1% vs last week</span>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Invoices Received</span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums">17</div>
                  <span className="text-[10px] text-slate-500">This week</span>
                </div>

                <div className="p-4 bg-white rounded-xl border-l-4 border-l-amber-500 border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block mb-1">Need Attention</span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums">3</div>
                  <span className="text-[10px] text-amber-700 font-medium">Requires review</span>
                </div>

                <div className="p-4 bg-white rounded-xl border-l-4 border-l-rose-500 border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block mb-1">Overdue</span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums">₹2.1L</div>
                  <span className="text-[10px] text-rose-600 font-medium">Across 2 invoices</span>
                </div>
              </div>

              {/* AI Finance Brief Card */}
              <div className="p-4 bg-white rounded-xl border border-brand-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand-600" />
                    <span className="text-xs font-bold text-slate-900">AI Finance Brief</span>
                  </div>
                  <span className="text-[10px] font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    AUTO-GENERATED
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Metro Components (INV-0092) exceeds approved PO by <strong className="text-slate-900">₹50,000</strong>. Action: Request supplier confirmation before approval.
                </p>
              </div>

              {/* Attention Required Section */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
                  <span>Attention Required</span>
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">3 Pending</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">Metro Components</span>
                        <span className="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border">INV-0092</span>
                        <StatusBadge type="risk" value="high" />
                      </div>
                      <p className="text-[11px] text-slate-600">PO Mismatch: Invoice exceeds approved PO-8291 by ₹50,000</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-slate-900 tabular-nums text-sm">₹8,40,000</div>
                      <button
                        onClick={() => navigate('/app/invoices/inv-0092')}
                        className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-0.5 mt-0.5"
                      >
                        Review →
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">ABC Supplies</span>
                        <span className="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border">INV-82731</span>
                        <StatusBadge type="risk" value="medium" />
                      </div>
                      <p className="text-[11px] text-slate-600">Duplicate Check: 87% similarity with INV-0081</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-slate-900 tabular-nums text-sm">₹4,82,000</div>
                      <button
                        onClick={() => navigate('/app/invoices/inv-82731')}
                        className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-0.5 mt-0.5"
                      >
                        Review →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4 — CORE MESSAGE (147 -> 132 -> 15 Pipeline) */}
        <section className="py-20 px-6 sm:px-8 lg:px-12 bg-white border-t border-slate-200">
          <div className="max-w-4xl mx-auto text-center space-y-10">
            <div className="space-y-3">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                147 invoices shouldn't mean 147 manual reviews.
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
                InvoiceFlow automatically clears routine invoices and brings only exceptions to your finance team.
              </p>
            </div>

            {/* Clean Pipeline Visual */}
            <div className="max-w-2xl mx-auto p-6 sm:p-8 rounded-2xl bg-[#F8FAFC] border border-slate-200 space-y-6">
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs text-center space-y-0.5">
                <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums">147</div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Invoices received</div>
              </div>

              <div className="flex justify-center">
                <ArrowDown className="w-5 h-5 text-slate-400" />
              </div>

              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 shadow-xs text-center space-y-0.5">
                <div className="text-3xl sm:text-4xl font-extrabold text-emerald-700 tabular-nums">132</div>
                <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Automatically cleared (89.8%)</div>
                <div className="text-[11px] text-emerald-600">3-way PO matched & pre-scheduled</div>
              </div>

              <div className="flex justify-center">
                <ArrowDown className="w-5 h-5 text-slate-400" />
              </div>

              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-xs text-center space-y-0.5">
                <div className="text-3xl sm:text-4xl font-extrabold text-amber-800 tabular-nums">15</div>
                <div className="text-xs font-semibold text-amber-900 uppercase tracking-wider">Require human attention</div>
                <div className="text-[11px] text-amber-700">Surfaced for 1-click decision review</div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5 — HOW IT WORKS */}
        <section id="how-it-works" className="py-20 px-6 sm:px-8 lg:px-12 max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              From invoice to decision in seconds.
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Five automated steps that turn manual processing into exception management.
            </p>
          </div>

          {/* 5 Horizontal Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-center">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <span className="font-mono text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">01</span>
              <h4 className="text-xs font-bold text-slate-900">Upload</h4>
              <p className="text-[11px] text-slate-500">PDFs, images, or email files</p>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <span className="font-mono text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">02</span>
              <h4 className="text-xs font-bold text-slate-900">Extract</h4>
              <p className="text-[11px] text-slate-500">Line items, GST & totals</p>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <span className="font-mono text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">03</span>
              <h4 className="text-xs font-bold text-slate-900">Verify</h4>
              <p className="text-[11px] text-slate-500">Bank accounts & math</p>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <span className="font-mono text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">04</span>
              <h4 className="text-xs font-bold text-slate-900">Match</h4>
              <p className="text-[11px] text-slate-500">3-way PO catalog check</p>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">05</span>
              <h4 className="text-xs font-bold text-slate-900">Decide</h4>
              <p className="text-[11px] text-slate-500">Auto-clear or review flag</p>
            </div>
          </div>

          {/* Technical Process Bar */}
          <div className="p-4 rounded-xl bg-slate-900 text-white text-xs font-mono text-center overflow-x-auto">
            <span className="text-slate-400">Workflow:</span> Invoice → AI Extraction → Validation → PO Matching → Risk Checks → <span className="text-emerald-400 font-bold">Auto-Clear</span> / <span className="text-amber-400 font-bold">Exception</span>
          </div>
        </section>

        {/* SECTION 6 — REAL EXCEPTION EXAMPLE */}
        <section id="exceptions" className="py-20 px-6 sm:px-8 lg:px-12 bg-white border-t border-slate-200">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-2 max-w-2xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                When something doesn't look right, InvoiceFlow tells you why.
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Traceable evidence breakdown so your team can make informed decisions in seconds.
              </p>
            </div>

            {/* Real Exception Breakdown Card */}
            <Card className="p-6 border-slate-200 shadow-card space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">Metro Components</h3>
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      PO MISMATCH
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">Invoice: INV-0092 • PO Ref: PO-8291</span>
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold text-slate-900 tabular-nums">₹8,40,000</div>
                  <span className="text-xs text-rose-600 font-bold">+₹50,000 Variance</span>
                </div>
              </div>

              {/* Side-by-Side Values */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] text-slate-400 block uppercase">Invoiced Amount</span>
                  <span className="font-bold text-slate-900">₹8,40,000</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[10px] text-slate-400 block uppercase">Approved PO (PO-8291)</span>
                  <span className="font-bold text-slate-900">₹7,90,000</span>
                </div>
                <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                  <span className="text-[10px] text-rose-600 block uppercase">Difference</span>
                  <span className="font-bold text-rose-700">+₹50,000 (+6.3%)</span>
                </div>
              </div>

              {/* AI Analysis & Recommendation */}
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                  <span className="font-bold text-slate-900 block">AI Finding:</span>
                  <p className="text-slate-700">Line item "Hydraulic Seals" billed at ₹1,950 vs approved PO rate ₹1,533 per unit.</p>
                </div>
                <div className="p-3 bg-brand-50/70 border border-brand-200/80 rounded-lg space-y-1">
                  <span className="font-bold text-brand-800 block">Recommendation:</span>
                  <p className="text-brand-900">Request supplier confirmation before approval.</p>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => navigate('/app/invoices/inv-0092')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-xs cursor-pointer"
                >
                  <span>Review Invoice</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          </div>
        </section>

        {/* SECTION 7 — FEATURES (Clean Compact Grid) */}
        <section id="features" className="py-20 px-6 sm:px-8 lg:px-12 max-w-6xl mx-auto space-y-10">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Purpose-built capabilities for finance operations
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Operational tools designed to eliminate accounts payable overhead.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <h3 className="text-sm font-bold text-slate-900">Invoice extraction</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Extract vendor, line-item, tax and payment data automatically from PDFs, scans, and images.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <h3 className="text-sm font-bold text-slate-900">3-way PO matching</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Compare invoices against purchase orders and goods receipt notes to flag rate variances.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <h3 className="text-sm font-bold text-slate-900">Duplicate detection</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Identify identical billings, overlapping line items, and past payment matches automatically.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <h3 className="text-sm font-bold text-slate-900">Supplier risk signals</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Monitor unverified vendor bank account modifications and credit term shifts before payment.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <h3 className="text-sm font-bold text-slate-900">Exception prioritization</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Surface high-variance invoices requiring human approval while auto-scheduling clean bills.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <h3 className="text-sm font-bold text-slate-900">Finance Copilot</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Ask natural language questions about your payables, vendor history, and payment status in real time.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 8 — COPILOT PREVIEW */}
        <section id="copilot" className="py-20 px-6 sm:px-8 lg:px-12 bg-white border-t border-slate-200">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-2 max-w-2xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Ask your finances anything.
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Natural language query assistant connected to your operations database.
              </p>
            </div>

            {/* Copilot Interface Mock */}
            <div className="bg-[#F8FAFC] rounded-2xl border border-slate-200 shadow-card overflow-hidden">
              <div className="px-5 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Bot className="w-4 h-4 text-brand-600" />
                  <span>Finance Copilot</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Live Context Connected</span>
              </div>

              <div className="p-5 sm:p-6 space-y-4 text-xs">
                <div className="flex justify-end">
                  <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl rounded-br-xs max-w-md">
                    Which invoices need my attention today?
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-700 border border-brand-200 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 text-slate-800 max-w-lg space-y-3 shadow-xs">
                    <p className="font-semibold text-slate-900">
                      3 invoices require attention today:
                    </p>

                    <div className="space-y-2 text-[11px]">
                      <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-rose-900 block">Metro Components</span>
                          <span className="text-rose-700">PO mismatch (+₹50,000 variance)</span>
                        </div>
                        <span className="font-bold text-slate-900 tabular-nums">₹8,40,000</span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-amber-900 block">ABC Supplies</span>
                          <span className="text-amber-700">Possible duplicate (87% match)</span>
                        </div>
                        <span className="font-bold text-slate-900 tabular-nums">₹4,82,000</span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-rose-900 block">Nova Traders</span>
                          <span className="text-rose-700">Supplier bank details changed</span>
                        </div>
                        <span className="font-bold text-slate-900 tabular-nums">₹2,15,000</span>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate('/app/copilot')}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 cursor-pointer pt-1"
                    >
                      Open Copilot →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 9 — PROOF / DEMO METRICS */}
        <section className="py-16 px-6 sm:px-8 lg:px-12 max-w-5xl mx-auto text-center space-y-6">
          <div className="text-[11px] font-mono font-bold tracking-widest text-slate-400 uppercase">
            DEMO WORKSPACE DATA
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1">
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">147</div>
              <div className="text-xs font-semibold text-slate-600">Invoices processed</div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1">
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">₹12.4L</div>
              <div className="text-xs font-semibold text-slate-600">Payables tracked</div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1">
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 tabular-nums">132</div>
              <div className="text-xs font-semibold text-slate-600">Auto-cleared</div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1">
              <div className="text-2xl sm:text-3xl font-extrabold text-amber-700 tabular-nums">15</div>
              <div className="text-xs font-semibold text-slate-600">Exceptions</div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 italic">
            Illustrative data from the InvoiceFlow demo workspace.
          </p>
        </section>

        {/* SECTION 10 — FINAL CTA */}
        <section className="py-20 px-6 sm:px-8 lg:px-12 bg-slate-900 text-white text-center">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Your finance team should review exceptions, not invoices.
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
              InvoiceFlow handles repetitive invoice operations and surfaces the decisions that actually need your attention.
            </p>

            <div className="flex flex-row flex-wrap items-center justify-center gap-3.5 pt-2">
              <button
                onClick={() => navigate('/app')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-xs transition-all cursor-pointer w-fit"
              >
                <span>Open InvoiceFlow</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => navigate('/app')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all cursor-pointer w-fit"
              >
                Explore the workflow
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-slate-950 text-slate-400 py-8 px-6 sm:px-8 lg:px-12 text-xs border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white font-semibold">
            <div className="w-6 h-6 rounded bg-brand-600 text-white flex items-center justify-center text-[10px] font-bold">
              IF
            </div>
            <span>InvoiceFlow AI</span>
          </div>

          <div className="flex items-center gap-6 text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#exceptions" className="hover:text-white transition-colors">Exceptions</a>
            <a href="#copilot" className="hover:text-white transition-colors">AI Copilot</a>
          </div>

          <div className="text-slate-500 text-[11px]">
            Built for <strong className="text-slate-400">Razorpay AI Buildathon</strong>
          </div>
        </div>
      </footer>
    </div>
  );
};
