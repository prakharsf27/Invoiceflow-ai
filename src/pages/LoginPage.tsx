import React, { useState } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { ArrowRight, AlertCircle, Loader2, Zap, Eye, EyeOff, Lock, Mail, Users } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const { refreshData } = useApp();

  const inviteToken = searchParams.get('invite') || searchParams.get('token') || undefined;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const from = (location.state as any)?.from?.pathname || (inviteToken ? `/invite/${inviteToken}` : '/app/dashboard');

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
      if (inviteToken) {
        navigate(`/invite/${inviteToken}`, { replace: true });
      } else {
        navigate(from, { replace: true });
      }
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
      if (inviteToken) {
        navigate(`/invite/${inviteToken}`, { replace: true });
      } else {
        navigate(from, { replace: true });
      }
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
          {inviteToken && (
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
              <Users className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Workspace Invitation Detected</span>
                <span className="text-[11px] text-blue-800">
                  Sign in with your invited email account to automatically join the company workspace.
                </span>
              </div>
            </div>
          )}

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
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all text-slate-900"
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
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all text-slate-900"
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
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Access Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2.5 bg-white text-slate-400 font-medium">or instant evaluation</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Sign In with 1-Click Demo Account</span>
          </button>
        </div>

        {/* Footer info */}
        <p className="mt-6 text-center text-xs text-slate-500">
          Don't have an organization account?{' '}
          <Link
            to={inviteToken ? `/register?invite=${inviteToken}` : '/register'}
            className="font-semibold text-slate-900 hover:underline"
          >
            {inviteToken ? 'Create account to accept invite' : 'Create workspace'}
          </Link>
        </p>
      </div>
    </div>
  );
};
