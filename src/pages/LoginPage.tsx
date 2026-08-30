import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { ArrowRight, AlertCircle, Loader2, Zap, Eye, EyeOff, Lock, Mail } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { refreshData } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const from = (location.state as any)?.from?.pathname || '/app/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter your email and password.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      await login(email.trim().toLowerCase(), password);
      navigate(from, { replace: true });
      refreshData().catch(() => {});
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(err?.message || 'Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setEmail('demo@invoiceflow.ai');
    setPassword('password123');

    try {
      await login('demo@invoiceflow.ai', 'password123');
      navigate(from, { replace: true });
      refreshData().catch(() => {});
    } catch (err: any) {
      console.error('Demo login error:', err);
      setErrorMsg(err?.message || 'Failed to sign in with demo account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <Link to="/" className="inline-flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white font-bold text-base flex items-center justify-center shadow-xs group-hover:bg-slate-800 transition-colors">
            IF
          </div>
          <span className="font-bold text-2xl text-slate-900 tracking-tight">
            InvoiceFlow <span className="text-[11px] font-bold px-1.5 py-0.2 text-brand-700 bg-brand-50 border border-brand-200/70 rounded">AI</span>
          </span>
        </Link>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Sign in to your organization
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Accounts payable automation & invoice risk workspace
          </p>
        </div>
      </div>

      {/* Login Form Card */}
      <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-7 sm:p-8 shadow-card space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg py-2.5 text-xs shadow-xs transition-all cursor-pointer flex items-center mt-2 disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Access Divider */}
          <div className="relative flex py-1 items-center">
            <div className="grow border-t border-slate-200" />
            <span className="shrink mx-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              or quick demo
            </span>
            <div className="grow border-t border-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={isLoading}
            className="w-full justify-center gap-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-semibold rounded-lg py-2.5 text-xs shadow-xs transition-all cursor-pointer flex items-center"
          >
            <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span>Sign In with Demo Account (Instant)</span>
          </button>

          <div className="text-center pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Don't have an organization account?{' '}
              <Link to="/register" className="font-semibold text-slate-900 hover:underline transition-colors">
                Create workspace
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
