import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, Loader2, RotateCcw, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { companyService } from '../../services/dataServices';

interface ResetTestDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (deletedCounts?: any) => void;
  companyName?: string;
}

export const ResetTestDataModal: React.FC<ResetTestDataModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  companyName,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await companyService.resetTestData();
      if (res.success) {
        onSuccess(res.deletedCounts);
        onClose();
      } else {
        setErrorMsg(res.message || 'Failed to reset test data.');
      }
    } catch (err: any) {
      console.error('Error resetting test data:', err);
      setErrorMsg(err?.message || 'Failed to reset workspace test data.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={!isLoading ? onClose : undefined}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center space-y-4">
          {/* Warning Icon */}
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <RotateCcw className="w-6 h-6" />
          </div>

          {/* Heading & Summary */}
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-slate-900">Reset Workspace Test Data?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will permanently delete all transactional records for{' '}
              <strong className="text-slate-900">{companyName || 'your workspace'}</strong> so you can re-test the application from a pristine zero state.
            </p>
          </div>

          {/* Detailed Itemization */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-left text-xs space-y-2.5">
            <div className="space-y-1.5 text-slate-700">
              <span className="font-semibold text-slate-900 block text-[11px] uppercase tracking-wider text-rose-700 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> What will be permanently removed:
              </span>
              <ul className="space-y-1 text-slate-600 pl-4 list-disc text-[11px]">
                <li>All Invoices &amp; financial math records</li>
                <li>All Purchase Orders &amp; 3-way matching records</li>
                <li>All Suppliers &amp; vendor spend totals</li>
                <li>All Payment &amp; disbursement schedules</li>
                <li>All Flagged Exceptions &amp; risk audit logs</li>
                <li>All Ingested Document files &amp; processing queues</li>
              </ul>
            </div>

            <div className="pt-2 border-t border-slate-200 text-[11px] text-emerald-800 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>User accounts, login credentials, and workspace configuration are strictly preserved.</span>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2 text-left">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isLoading}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleConfirm}
              disabled={isLoading}
              className="cursor-pointer font-semibold gap-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Resetting Workspace...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Yes, Reset Test Data</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
