import React, { useState } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
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
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">Remove Team Member</h3>
            <p className="text-xs text-slate-500">
              Are you sure you want to remove <strong>{member.name}</strong> ({member.email}) from your company workspace?
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl text-left text-xs text-slate-600 space-y-1">
            <p>• They will immediately lose access to all company invoices, POs, and reports.</p>
            <p>• Existing invoices processed by them will remain intact.</p>
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-600 font-semibold">{errorMsg}</p>
          )}

          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirm}
              disabled={isLoading}
              className="gap-1.5 cursor-pointer"
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
