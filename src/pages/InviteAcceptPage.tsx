import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  UserCheck,
  LogIn,
  UserPlus,
  Loader2,
  Clock,
  Mail,
  Lock,
  LogOut,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { companyService } from '../services/companyService';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import type { InvitationInfo } from '../types';

export const InviteAcceptPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, loginWithToken, logout } = useAuth();
  const { showToast, refreshData } = useApp();

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      if (!token) {
        setErrorStatus('not_found');
        setErrorMessage('Invitation token is missing.');
        setIsLoading(false);
        return;
      }

      try {
        const info = await companyService.getInvitationInfo(token);
        setInvitation(info);
      } catch (err: any) {
        console.error('Error fetching invitation:', err);
        const msg = err?.message || 'Failed to load invitation.';
        setErrorMessage(msg);
        if (msg.toLowerCase().includes('expired')) {
          setErrorStatus('expired');
        } else if (msg.toLowerCase().includes('revoked') || msg.toLowerCase().includes('no longer')) {
          setErrorStatus('revoked');
        } else if (msg.toLowerCase().includes('accepted')) {
          setErrorStatus('accepted');
        } else {
          setErrorStatus('invalid');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchInfo();
  }, [token]);

  const formatRoleLabel = (role?: string) => {
    switch (role) {
      case 'owner':
        return 'Workspace Owner';
      case 'reviewer':
        return 'Invoice Reviewer';
      case 'accountant':
        return 'Senior Accountant';
      default:
        return 'Team Member';
    }
  };

  const getDaysRemaining = (expiresAt?: string) => {
    if (!expiresAt) return '7 days';
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return `${days} day${days > 1 ? 's' : ''}`;
  };

  const handleAcceptLoggedIn = async () => {
    if (!token) return;
    setIsAccepting(true);

    try {
      const res = await companyService.acceptInvitation({ token });
      if (res.token && res.user) {
        loginWithToken(res.token, res.user);
        showToast(res.message || `Welcome to ${invitation?.companyName}!`, 'success');
        await refreshData();
        navigate('/app');
      } else {
        showToast('Invitation accepted. Please sign in.', 'success');
        navigate(`/login?invite=${token}`);
      }
    } catch (err: any) {
      console.error('Failed to accept invitation:', err);
      showToast(err?.message || 'Failed to accept invitation. Please try again.', 'error');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleSwitchAccount = () => {
    logout();
    navigate(`/login?invite=${token}`);
  };

  const isEmailMatching =
    isAuthenticated &&
    user?.email &&
    invitation?.email &&
    user.email.toLowerCase().trim() === invitation.email.toLowerCase().trim();

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-slate-900 selection:text-white">
      {/* Brand Header */}
      <div className="mb-8 text-center">
        <Link to="/" className="inline-flex items-center gap-2.5 group">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-900 text-white font-bold text-base shadow-sm group-hover:bg-slate-800 transition-colors">
            IF
          </div>
          <span className="font-bold text-slate-900 text-lg tracking-tight flex items-center gap-1.5">
            InvoiceFlow <span className="text-[10px] font-bold px-1.5 py-0.2 text-brand-700 bg-brand-50 border border-brand-200/70 rounded">AI</span>
          </span>
        </Link>
      </div>

      {/* Main Container Card */}
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Loading State */}
        {isLoading && (
          <div className="p-12 text-center space-y-4">
            <Loader2 className="w-8 h-8 text-slate-900 animate-spin mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Verifying Workspace Invitation...</h3>
              <p className="text-xs text-slate-500">Checking invitation security credentials</p>
            </div>
          </div>
        )}

        {/* Error / Inactive States */}
        {!isLoading && errorStatus && (
          <div className="p-8 text-center space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">
                {errorStatus === 'expired'
                  ? 'Invitation Expired'
                  : errorStatus === 'revoked'
                  ? 'Invitation Unavailable'
                  : errorStatus === 'accepted'
                  ? 'Already Accepted'
                  : 'Invalid Invitation'}
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                {errorMessage ||
                  'This invitation link is invalid or no longer active. Please ask the workspace owner to generate a fresh invitation link.'}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <Button
                onClick={() => navigate('/login')}
                variant="primary"
                size="sm"
                className="w-full justify-center bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
              >
                Sign In to InvoiceFlow
              </Button>
              <Button
                onClick={() => navigate('/')}
                variant="outline"
                size="sm"
                className="w-full justify-center cursor-pointer"
              >
                Return to Homepage
              </Button>
            </div>
          </div>
        )}

        {/* Active Valid Invitation State */}
        {!isLoading && !errorStatus && invitation && (
          <div>
            {/* Top Accent Strip */}
            <div className="bg-slate-900 px-6 py-5 text-white space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-semibold uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Verified Workspace Invite</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white pt-1">
                You're invited to join
              </h1>
              <p className="text-xs text-slate-300">
                Collaborate on automated accounts payable & invoice intelligence
              </p>
            </div>

            {/* Invitation Details Body */}
            <div className="p-6 sm:p-7 space-y-6">
              {/* Workspace Box */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-900 flex items-center justify-center font-bold text-sm shadow-xs">
                    <Building2 className="w-5 h-5 text-slate-700" />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Company Workspace</span>
                    <h3 className="text-sm font-bold text-slate-900">{invitation.companyName}</h3>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Invited Role</span>
                  <Badge variant="purple" size="sm" className="font-semibold">
                    {formatRoleLabel(invitation.role)}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Intended Email</span>
                  <span className="font-mono text-slate-800 font-semibold text-[11px]">{invitation.email}</span>
                </div>
              </div>

              {/* Expiration Note */}
              <div className="flex items-center gap-2 text-[11px] text-slate-500 justify-center">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>This invitation expires in {getDaysRemaining(invitation.expiresAt)}.</span>
              </div>

              {/* Actions Section */}
              <div className="space-y-3 pt-2">
                {/* Case 1: User is Logged In & Email Matches */}
                {isAuthenticated && isEmailMatching && (
                  <div className="space-y-2.5">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Signed in as <strong>{user?.email}</strong>. Ready to accept!
                      </span>
                    </div>

                    <Button
                      onClick={handleAcceptLoggedIn}
                      disabled={isAccepting}
                      variant="primary"
                      className="w-full justify-center py-2.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer shadow-sm"
                    >
                      {isAccepting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Joining Workspace...</span>
                        </>
                      ) : (
                        <>
                          <span>Accept Invitation & Join</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* Case 2: User is Logged In BUT Email Does NOT Match */}
                {isAuthenticated && !isEmailMatching && (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Email Mismatch</span>
                      </div>
                      <p className="leading-relaxed text-[11px]">
                        You are currently signed in as <strong className="font-mono">{user?.email}</strong>, but this invitation was created specifically for <strong className="font-mono">{invitation.email}</strong>.
                      </p>
                    </div>

                    <Button
                      onClick={handleSwitchAccount}
                      variant="outline"
                      className="w-full justify-center text-xs font-semibold gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign In with {invitation.email}</span>
                    </Button>
                  </div>
                )}

                {/* Case 3: User is NOT Logged In */}
                {!isAuthenticated && (
                  <div className="space-y-2.5">
                    <Button
                      onClick={() => navigate(`/login?invite=${token}`)}
                      variant="primary"
                      className="w-full justify-center py-2.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer shadow-sm gap-2"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>Log In to Accept</span>
                    </Button>

                    <Button
                      onClick={() => navigate(`/register?invite=${token}`)}
                      variant="outline"
                      className="w-full justify-center py-2.5 text-xs font-semibold cursor-pointer gap-2"
                    >
                      <UserPlus className="w-4 h-4 text-slate-600" />
                      <span>Create Account to Accept</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer text */}
      <div className="mt-8 text-center text-xs text-slate-400">
        © 2026 InvoiceFlow AI • Multi-tenant AP Automation
      </div>
    </div>
  );
};
