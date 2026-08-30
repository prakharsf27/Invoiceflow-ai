import React, { useState } from 'react';
import { X, Mail, Shield, UserPlus, Copy, Check, AlertCircle, Loader2, Link as LinkIcon, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { companyService } from '../../services/companyService';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'accountant' | 'reviewer' | 'owner'>('reviewer');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState('');
  const [invitedRole, setInvitedRole] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Please enter an email address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await companyService.inviteMember({
        email: cleanEmail,
        role,
      });

      // Construct proper link (preferring res.invitationLink from backend)
      let link = res?.invitationLink;
      if (!link && res?.token) {
        link = `${window.location.origin}/invite/${res.token}`;
      } else if (link && !link.startsWith('http')) {
        link = `${window.location.origin}${link}`;
      }

      setInvitationLink(link || `${window.location.origin}/invite/${res?.token || ''}`);
      setInvitedEmail(cleanEmail);
      setInvitedRole(role);
    } catch (err: any) {
      console.error('Error creating team invitation:', err);
      setErrorMsg(err?.message || 'Failed to create team invitation. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (invitationLink) {
      navigator.clipboard.writeText(invitationLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleResetForNew = () => {
    setEmail('');
    setRole('reviewer');
    setErrorMsg(null);
    setInvitationLink(null);
    setCopied(false);
  };

  const handleClose = () => {
    if (invitationLink) {
      onSuccess();
    }
    handleResetForNew();
    onClose();
  };

  const formatRoleLabel = (r: string) => {
    switch (r) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold shadow-xs">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Add Team Member</h2>
              <p className="text-xs text-slate-500">Generate a shareable workspace invitation link</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {invitationLink ? (
            /* STEP 2: Shareable Link Generated */
            <div className="space-y-5 animate-in fade-in">
              <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Invitation Ready</span>
                </div>
                <p className="text-emerald-800 text-xs leading-relaxed">
                  Invite <strong className="font-mono text-emerald-950">{invitedEmail}</strong> as{' '}
                  <strong className="text-emerald-950">{formatRoleLabel(invitedRole)}</strong>.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-slate-600" />
                  <span>Shareable Invitation Link</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={invitationLink}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 selection:bg-slate-200 select-all focus:outline-none"
                  />
                  <Button
                    type="button"
                    onClick={handleCopy}
                    variant={copied ? 'secondary' : 'primary'}
                    size="sm"
                    className="shrink-0 gap-1.5 cursor-pointer min-w-[90px]"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-semibold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                  Share this link with your colleague through WhatsApp, Slack, Teams, or any other channel. The link expires in 7 days.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleResetForNew}
                  className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Generate Another Link</span>
                </button>
                <Button onClick={handleClose} variant="primary" size="sm" className="cursor-pointer">
                  Done
                </Button>
              </div>
            </div>
          ) : (
            /* STEP 1: Input Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Colleague's Email Address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="colleague@yourcompany.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Workspace Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white text-slate-900 font-medium"
                >
                  <option value="reviewer">Reviewer (Audit exceptions and verify invoice details)</option>
                  <option value="accountant">Accountant (Manage invoices, PO matching, and payments)</option>
                  <option value="member">Member (View shared company invoices & reports)</option>
                  <option value="owner">Owner (Full administrative rights & team management)</option>
                </select>
                <span className="text-[11px] text-slate-500 block mt-0.5 leading-relaxed">
                  Invited members collaborate within your organization and access shared invoices, suppliers, and PO reconciliation records.
                </span>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={isLoading}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isLoading}
                  className="gap-1.5 cursor-pointer bg-slate-900 hover:bg-slate-800 text-white"
                >
                  {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Generate Invitation Link</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
