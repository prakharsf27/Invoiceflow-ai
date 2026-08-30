import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth, UserRole } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { companyService } from '../services/companyService';
import { ArrowRight, AlertCircle, Loader2, Users, Building, Mail, Lock, User, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register } = useAuth();
  const { refreshData } = useApp();

  const invitationToken = searchParams.get('invite') || searchParams.get('token') || undefined;
  const inviteEmail = searchParams.get('email') || '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState(inviteEmail);
  const [companyName, setCompanyName] = useState('');
  const [invitedCompanyName, setInvitedCompanyName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>(invitationToken ? 'member' : 'owner');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (invitationToken) {
      companyService
        .getInvitationInfo(invitationToken)
        .then((info) => {
          if (info.email) setEmail(info.email);
          if (info.companyName) setInvitedCompanyName(info.companyName);
          if (info.role) setRole(info.role as UserRole);
        })
        .catch((err) => {
          console.warn('Could not load invitation details ahead of registration:', err);
        });
    } else if (inviteEmail) {
      setEmail(inviteEmail);
    }
  }, [invitationToken, inviteEmail]);

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
      await register(
        name.trim(),
        email.trim().toLowerCase(),
        password,
        companyName.trim() || invitedCompanyName || `${name.trim()}'s Org`,
        role,
        invitationToken
      );
      navigate('/app/dashboard', { replace: true });
      refreshData().catch(() => {});
    } catch (err: any) {
      console.error('Registration error:', err);
      setErrorMsg(err?.message || 'Failed to create account. Please try again.');
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
            {invitationToken ? 'Accept workspace invitation' : 'Create organization workspace'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {invitationToken
              ? `Join ${invitedCompanyName || 'your team'} on InvoiceFlow AI`
              : "Isolate and automate your company's accounts payable workflows"}
          </p>
        </div>
      </div>

      {/* Register Form Card */}
      <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-7 sm:p-8 shadow-card space-y-5">
          {invitationToken && (
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">
                  {invitedCompanyName ? `Invited to ${invitedCompanyName}` : 'Team Invitation Detected'}
                </span>
                <span className="text-[11px] text-blue-800">
                  Creating an account will automatically add you as a verified member.
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
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all"
                />
              </div>
            </div>

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
                  placeholder="jane@company.com"
                  required
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all"
                />
              </div>
            </div>

            {!invitationToken && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Company / Organization Legal Name
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Apex Global Technologies Pvt Ltd"
                    className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all"
                  />
                </div>
              </div>
            )}

            {!invitationToken && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Role in Organization
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all cursor-pointer font-medium"
                >
                  <option value="owner">Workspace Owner (Administrator)</option>
                  <option value="accountant">Senior Accountant</option>
                  <option value="reviewer">Invoice Reviewer</option>
                  <option value="member">General Team Member</option>
                </select>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  Create Password <span className="text-slate-400 font-normal text-[11px]">(Min 6 characters)</span>
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
                  className="w-full pl-9 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all"
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
                  <span>{invitationToken ? 'Joining workspace...' : 'Creating workspace...'}</span>
                </>
              ) : (
                <>
                  <span>{invitationToken ? 'Join workspace' : 'Create workspace'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Already have an account?{' '}
              <Link
                to={invitationToken ? `/login?invite=${invitationToken}` : '/login'}
                className="font-semibold text-slate-900 hover:underline transition-colors"
              >
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
