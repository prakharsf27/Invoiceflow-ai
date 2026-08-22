import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, UserRole } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { refreshData } = useApp();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('finance_admin');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      await register(name, email, password, companyName || `${name}'s Org`, role);
      await refreshData();
      navigate('/app/dashboard', { replace: true });
    } catch (err: any) {
      console.error('Registration error:', err);
      setErrorMsg(err?.message || 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/80 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Figma Radial Blue Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center space-y-3">
        <Link to="/" className="inline-flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold text-base flex items-center justify-center shadow-md shadow-blue-600/25 shrink-0 group-hover:scale-105 transition-transform">
            IF
          </div>
          <span className="font-bold text-2xl text-slate-900 tracking-tight">
            InvoiceFlow <span className="text-blue-600 font-bold">AI</span>
          </span>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Create organization workspace
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Isolate and automate your company's accounts payable workflows
          </p>
        </div>
      </div>

      {/* Register Form Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <div className="bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl p-8 shadow-xl shadow-slate-200/50 ring-1 ring-slate-900/5 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all font-medium"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                Work Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all font-medium"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                Company / Organization Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Corp"
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all font-medium"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                Role in Finance Team
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all font-medium cursor-pointer"
              >
                <option value="finance_admin">Finance Administrator</option>
                <option value="accountant">Senior Accountant</option>
                <option value="reviewer">Invoice Reviewer</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[13px] font-semibold text-slate-700">
                  Create Password <span className="text-slate-400 font-normal text-xs ml-1">(Min 6 characters)</span>
                </label>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-2.5 text-sm shadow-md shadow-blue-600/20 transition-all cursor-pointer flex items-center mt-2 disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating workspace...</span>
                </>
              ) : (
                <>
                  <span>Create workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
