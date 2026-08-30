import React, { useState } from 'react';
import { X, Mail, Shield, UserPlus, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
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
  const [role, setRole] = useState<'member' | 'accountant' | 'reviewer' | 'owner'>('member');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
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
      const res = await companyService.inviteMember({
        email: email.trim().toLowerCase(),
        role,
      });

      const fullInviteUrl = `${window.location.origin}${res.invitationLink}`;
      setInvitationLink(fullInviteUrl);
      onSuccess();
    } catch (err: any) {
      console.error('Error inviting team member:', err);
      setErrorMsg(err?.message || 'Failed to invite team member. Please try again.');
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

  const handleClose = () => {
    setEmail('');
    setRole('member');
    setErrorMsg(null);
    setInvitationLink(null);
    setCopied(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600/10 text-brand-600 flex items-center justify-center font-bold">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Add Team Member</h2>
              <p className="text-xs text-slate-500">Invite a colleague to collaborate in this company workspace</p>
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

        {/* Content */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {invitationLink ? (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Invitation Created!</span>
                </div>
                <p className="text-emerald-800 text-xs">
                  An invitation has been generated for <strong>{email}</strong>. Share the secure invitation link below with your team member:
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Invitation Link</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={invitationLink}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-700 selection:bg-brand-100"
                  />
                  <Button
                    onClick={handleCopy}
                    variant={copied ? 'secondary' : 'brand'}
                    size="sm"
                    className="shrink-0 gap-1 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button onClick={handleClose} variant="primary" size="sm" className="cursor-pointer">
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
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
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Workspace Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
                >
                  <option value="member">Member (Access operational AP data & invoices)</option>
                  <option value="accountant">Accountant (Manage invoices, POs, and payments)</option>
                  <option value="reviewer">Reviewer (Audit exceptions and approve vouchers)</option>
                  <option value="owner">Owner (Full administrative rights & team management)</option>
                </select>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Members share your organization's invoices, suppliers, and PO matching records.
                </span>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={isLoading}>
                  Cancel
                </Button>
                <Button type="submit" variant="brand" size="sm" disabled={isLoading} className="gap-1.5 cursor-pointer">
                  {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Generate Invitation</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
