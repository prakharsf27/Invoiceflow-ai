import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Building2,
  FileText,
  FileCheck2,
  Search,
  CreditCard,
  TrendingUp,
  Sliders,
  Check,
  Bot,
  Zap,
  Lock,
  Server,
  Layers,
  HelpCircle,
  Clock,
  ArrowUpRight
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { StatusBadge } from '../components/common/StatusBadge';
import { formatFullINR } from '../lib/utils';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeFeatureTab, setActiveFeatureTab] = useState<'extraction' | 'matching' | 'exceptions' | 'suppliers' | 'copilot'>('extraction');

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans antialiased selection:bg-slate-900 selection:text-white">
      {/* 1. TOP ANNOUNCEMENT BANNER */}
      <div className="bg-slate-900 text-white text-[11px] font-medium py-2 px-4 text-center border-b border-slate-800 flex items-center justify-center gap-2">
        <span className="bg-brand-500/20 text-brand-300 border border-brand-400/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
          Live Demo Ready
        </span>
        <span>Razorpay Buildathon Edition — Multi-tenant AP automation with Gemini + Groq AI provider fallback</span>
        <button
          onClick={() => navigate('/login')}
          className="underline hover:text-brand-300 ml-1 font-semibold cursor-pointer inline-flex items-center gap-0.5"
        >
          Sign In Demo <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>

      {/* 2. NAVIGATION BAR */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white font-bold text-sm shadow-xs group-hover:bg-slate-800 transition-colors">
              IF
            </div>
            <span className="font-bold text-slate-900 text-base tracking-tight flex items-center gap-1.5">
              InvoiceFlow <span className="text-[10px] font-bold px-1.5 py-0.2 text-brand-700 bg-brand-50 border border-brand-200/70 rounded">AI</span>
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-slate-600">
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How It Works</a>
            <a href="#product-showcase" className="hover:text-slate-900 transition-colors">Product Showcase</a>
            <a href="#capabilities" className="hover:text-slate-900 transition-colors">Capabilities</a>
            <a href="#trust" className="hover:text-slate-900 transition-colors">Security & Architecture</a>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-3 py-2 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/register')}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-all active:scale-[0.99] cursor-pointer"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* 3. HERO SECTION */}
        <section className="pt-16 pb-14 sm:pt-20 sm:pb-16 px-6 sm:px-8 lg:px-12 border-b border-slate-200/60 bg-gradient-to-b from-white to-slate-50/50">
          <div className="max-w-4xl mx-auto text-center space-y-5">
            {/* Eyebrow Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>ACCOUNTS PAYABLE AUTOMATION</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.12] max-w-3xl mx-auto">
              AI-Powered Accounts Payable, Built for Faster Finance Teams.
            </h1>

            {/* Supporting Copy */}
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed pt-1 font-normal">
              InvoiceFlow automates invoice data extraction, 3-way purchase order matching, bank mandate verification, and exception detection — so your finance team only reviews what truly needs a decision.
            </p>

            {/* CTAs */}
            <div className="flex flex-row flex-wrap items-center justify-center gap-3.5 pt-4">
              <button
                onClick={() => navigate('/register')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => navigate('/login')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Explore Live Demo</span>
              </button>
            </div>

            {/* Trust Micro-Badges */}
            <div className="pt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500 font-medium">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Multi-Tenant Workspace Isolation
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Dual Gemini + Groq AI Fallback
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 100% Audit Trail Logging
              </span>
            </div>
          </div>
        </section>

        {/* 4. PRODUCT SHOWCASE (Live Realistic AP Centerpiece) */}
        <section id="product-showcase" className="py-16 px-6 sm:px-8 lg:px-12 max-w-6xl mx-auto space-y-6">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Enterprise AP Operations in One Single Pane
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Live automated extraction, 3-way reconciliation, and supplier bank compliance.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-elevated overflow-hidden text-left">
            {/* Mock App Topbar */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white text-xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                </div>
                <span className="font-semibold text-slate-200 border-l border-slate-700 pl-3">
                  InvoiceFlow AP Operations • Apex Global Technologies
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] bg-slate-800 text-emerald-400 font-mono px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> AI OCR Engine: Active
                </span>
              </div>
            </div>

            {/* Dashboard Workspace Mock Content */}
            <div className="p-5 sm:p-6 bg-[#F8FAFC] space-y-4">
              {/* 4 Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Total Payables</span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums">₹12,40,000</div>
                  <span className="text-[10px] text-emerald-600 font-medium">+2.1% vs last week</span>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Auto-Cleared</span>
                  <div className="text-xl font-bold text-emerald-700 tabular-nums">132 / 147</div>
                  <span className="text-[10px] text-emerald-600 font-medium">89.8% autonomous</span>
                </div>

                <div className="p-4 bg-white rounded-xl border-l-4 border-l-amber-500 border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block mb-1">Exceptions</span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums">3</div>
                  <span className="text-[10px] text-amber-700 font-medium">Requires review</span>
                </div>

                <div className="p-4 bg-white rounded-xl border-l-4 border-l-rose-500 border-slate-200 shadow-xs">
                  <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block mb-1">High Risk Alerts</span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums">1</div>
                  <span className="text-[10px] text-rose-600 font-medium">Bank account altered</span>
                </div>
              </div>

              {/* Sample Invoices Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 text-xs">
                  <span className="font-bold text-slate-900">Recent Invoice Processing Stream</span>
                  <span className="text-slate-500">Live Workspace Records</span>
                </div>

                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">Invoice #</th>
                      <th className="py-2.5 px-4">Supplier</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                      <th className="py-2.5 px-4">PO Ref</th>
                      <th className="py-2.5 px-4">AI Verification</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">INV-0092</td>
                      <td className="py-3 px-4 font-medium text-slate-800">Metro Components Pvt Ltd</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">₹8,40,000</td>
                      <td className="py-3 px-4 font-mono text-slate-500">PO-8291</td>
                      <td className="py-3 px-4">
                        <Badge variant="danger">⚠ PO Price Mismatch</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="warning" dot>Review Required</Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => navigate('/login')}
                          className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 cursor-pointer"
                        >
                          Review →
                        </button>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">INV-82731</td>
                      <td className="py-3 px-4 font-medium text-slate-800">ABC Infotech Solutions</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">₹4,82,000</td>
                      <td className="py-3 px-4 font-mono text-slate-500">PO-7740</td>
                      <td className="py-3 px-4">
                        <Badge variant="warning">⚠ Duplicate Check</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="warning" dot>Needs Review</Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => navigate('/login')}
                          className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 cursor-pointer"
                        >
                          Review →
                        </button>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">INV-4401</td>
                      <td className="py-3 px-4 font-medium text-slate-800">Tata Consultancy Services</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">₹2,50,000</td>
                      <td className="py-3 px-4 font-mono text-slate-500">PO-9102</td>
                      <td className="py-3 px-4">
                        <Badge variant="success">✓ 3-Way Matched</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="success" dot>Ready for Payment</Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => navigate('/login')}
                          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* 5. VALUE / IMPACT STRIP */}
        <section className="py-12 bg-white border-y border-slate-200">
          <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="space-y-1">
              <div className="text-3xl font-extrabold text-slate-900 tabular-nums">89.8%</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Automated Clearance</div>
              <p className="text-[11px] text-slate-400">Routine invoices cleared without manual touch</p>
            </div>

            <div className="space-y-1">
              <div className="text-3xl font-extrabold text-brand-600 tabular-nums">2.8 sec</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Extraction Speed</div>
              <p className="text-[11px] text-slate-400">Gemini 2.5 Flash + Groq high-speed fallback</p>
            </div>

            <div className="space-y-1">
              <div className="text-3xl font-extrabold text-slate-900 tabular-nums">0.0%</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unchecked Variance</div>
              <p className="text-[11px] text-slate-400">Strict 3-way line item rate matching</p>
            </div>

            <div className="space-y-1">
              <div className="text-3xl font-extrabold text-slate-900 tabular-nums">100%</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Audit Logged</div>
              <p className="text-[11px] text-slate-400">Every decision tracked with prompt metadata</p>
            </div>
          </div>
        </section>

        {/* 6. HOW IT WORKS (5 Sequential Steps) */}
        <section id="how-it-works" className="py-20 px-6 sm:px-8 lg:px-12 max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              From Invoice Upload to Settlement in 5 Steps
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Transforming manual accounts payable into an autonomous, exception-driven workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="w-7 h-7 rounded-md bg-slate-900 text-white font-mono font-bold text-xs flex items-center justify-center">
                01
              </div>
              <h4 className="text-sm font-bold text-slate-900">Upload Invoice</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Ingest PDF, scanned receipt, or image files directly via web or email.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="w-7 h-7 rounded-md bg-slate-900 text-white font-mono font-bold text-xs flex items-center justify-center">
                02
              </div>
              <h4 className="text-sm font-bold text-slate-900">Extract & Parse</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                AI extracts vendor GSTIN, line item quantities, rates, math totals, and bank credentials.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="w-7 h-7 rounded-md bg-slate-900 text-white font-mono font-bold text-xs flex items-center justify-center">
                03
              </div>
              <h4 className="text-sm font-bold text-slate-900">3-Way PO Match</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Cross-checks invoice line items against approved Purchase Orders for rate or quantity variance.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="w-7 h-7 rounded-md bg-slate-900 text-white font-mono font-bold text-xs flex items-center justify-center">
                04
              </div>
              <h4 className="text-sm font-bold text-slate-900">Detect Exceptions</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Flags altered bank details, duplicate submissions, and missing GSTIN credentials automatically.
              </p>
            </div>

            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="w-7 h-7 rounded-md bg-slate-900 text-white font-mono font-bold text-xs flex items-center justify-center">
                05
              </div>
              <h4 className="text-sm font-bold text-slate-900">Approve & Pay</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Routine invoices clear straight to disbursement schedule; exceptions resolve in 1 click.
              </p>
            </div>
          </div>
        </section>

        {/* 7. CORE CAPABILITIES (Interactive Grid) */}
        <section id="capabilities" className="py-20 px-6 sm:px-8 lg:px-12 bg-white border-t border-slate-200">
          <div className="max-w-6xl mx-auto space-y-12">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Designed for High-Volume Finance Operations
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Every feature is engineered for precision, speed, and strict financial compliance.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Feature 1 */}
              <div className="p-6 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">AI Invoice Extraction</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  High-accuracy OCR parsing line items, HSN/SAC codes, subtotal, CGST/SGST/IGST breakdown, and vendor bank account details with zero manual templates.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="p-6 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">3-Way PO Reconciliation</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Reconciles invoices against PO quotes and delivery receipts down to the item level, immediately alerting if unit price exceeds quote by even 1%.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="p-6 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Supplier Management Hub</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Centralized vendor database with GSTIN verification, historical spend analytics, payment terms, and verified primary bank mandate records.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="p-6 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Real-Time Exception Center</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Isolates price variances, altered bank accounts, and duplicate neural fingerprints into an actionable queue for rapid human decision-making.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="p-6 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">AI Finance Copilot</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Context-aware assistant analyzing live company invoices, supplier exposures, PO matches, and upcoming payables using company-isolated queries.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="p-6 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Payments & Cashflow Tracking</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Track scheduled, pending, and cleared settlements with credit term calendar views to prevent late fees and maintain optimal working capital.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 8. TRUST, SECURITY & ISOLATION SECTION */}
        <section id="trust" className="py-20 px-6 sm:px-8 lg:px-12 max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Enterprise-Grade Security & Architecture
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Built from the ground up for financial data privacy, auditability, and zero downtime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                <Lock className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">Company Data Isolation</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Strict multi-tenant MongoDB query boundaries. Users belonging to Company A can never access or query records from Company B.
              </p>
            </div>

            <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                <Server className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">Dual AI Fallback Architecture</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Google Gemini primary with automatic, sub-second failover to Groq (<code className="text-[11px] font-mono bg-slate-100 px-1 py-0.5 rounded">gpt-oss-120b</code> / <code className="text-[11px] font-mono bg-slate-100 px-1 py-0.5 rounded">qwen3.6-27b</code>) if rate limits or 429 errors occur.
              </p>
            </div>

            <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center font-bold">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">Role-Based Team Controls</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Granular Owner vs Member access levels. Owners manage workspace settings and invitations, while members share operational data.
              </p>
            </div>
          </div>
        </section>

        {/* 9. FINAL CTA SECTION */}
        <section className="py-20 px-6 sm:px-8 lg:px-12 bg-slate-900 text-white text-center border-t border-slate-800">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Bring your accounts payable workflow into one place.
            </h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
              Start processing invoices autonomously with 3-way PO matching, bank fraud checks, and AI finance insights.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={() => navigate('/register')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg shadow-sm transition-all cursor-pointer"
              >
                <span>Get Started Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/login')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all cursor-pointer"
              >
                <span>Sign In to Demo</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* 10. PROFESSIONAL FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-12 px-6 sm:px-8 lg:px-12 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded bg-slate-900 text-white font-bold text-xs">
                IF
              </div>
              <span className="font-bold text-slate-900 text-sm">InvoiceFlow AI</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Autonomous accounts payable and invoice risk platform built for the Razorpay Buildathon.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 text-xs mb-3">Product</h4>
            <ul className="space-y-2 text-slate-600">
              <li><a href="#product-showcase" className="hover:text-slate-900">Invoice Inbox</a></li>
              <li><a href="#capabilities" className="hover:text-slate-900">3-Way PO Matching</a></li>
              <li><a href="#capabilities" className="hover:text-slate-900">Supplier Management</a></li>
              <li><a href="#capabilities" className="hover:text-slate-900">Exception Center</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 text-xs mb-3">Intelligence & Security</h4>
            <ul className="space-y-2 text-slate-600">
              <li><a href="#trust" className="hover:text-slate-900">AI Finance Copilot</a></li>
              <li><a href="#trust" className="hover:text-slate-900">Gemini + Groq Fallback</a></li>
              <li><a href="#trust" className="hover:text-slate-900">Bank Fraud Verification</a></li>
              <li><a href="#trust" className="hover:text-slate-900">Company Data Isolation</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 text-xs mb-3">Workspace</h4>
            <ul className="space-y-2 text-slate-600">
              <li><button onClick={() => navigate('/login')} className="hover:text-slate-900 cursor-pointer">Sign In</button></li>
              <li><button onClick={() => navigate('/register')} className="hover:text-slate-900 cursor-pointer">Create Account</button></li>
              <li><button onClick={() => navigate('/app')} className="hover:text-slate-900 cursor-pointer">Open Dashboard</button></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400">
          <div>© 2026 InvoiceFlow AI. Built for the Razorpay Buildathon.</div>
          <div>React • Vite • Node.js • Express • MongoDB • Google Gemini • Groq</div>
        </div>
      </footer>
    </div>
  );
};
