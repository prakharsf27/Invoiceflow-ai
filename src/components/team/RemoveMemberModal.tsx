import React, { useState } from 'react';
import { AlertTriangle, X, Loader2, UserMinus } from 'lucide-react';
import { Button } from '../ui/Button';
import { companyService } from '../../services/companyService';
import type { TeamMember } from '../../types';

interface RemoveMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: TeamMember | null;
  onSuccess: () => void;
}

export const RemoveMemberModal: React.FC<RemoveMemberModalProps> = ({
  isOpen,
  onClose,
  member,
  onSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !member) return null;

  const handleConfirm = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await companyService.removeMember(member.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error removing team member:', err);
      setErrorMsg(err?.message || 'Failed to remove team member.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <UserMinus className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-slate-900">Remove team member?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will remove <strong className="text-slate-900">{member.name}</strong> (<span className="font-mono">{member.email}</span>) from your company workspace. Their account will not be deleted.
            </p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-left text-xs text-slate-600 space-y-1 leading-relaxed">
            <p className="flex items-center gap-1.5 text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>Loses access to shared company invoices, POs, and reports.</span>
            </p>
            <p className="flex items-center gap-1.5 text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>Previously processed company records remain intact.</span>
            </p>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-semibold">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading} className="cursor-pointer">
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirm}
              disabled={isLoading}
              className="gap-1.5 cursor-pointer bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Remove Member</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
