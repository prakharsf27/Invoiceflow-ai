import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { Invoice, Supplier, PurchaseOrder, PaymentRecord, InvoiceStatus } from '../types';
import { invoiceService } from '../services/invoiceService';
import { supplierService, poService, paymentService, exceptionService } from '../services/dataServices';
import { copilotService } from '../services/copilotService';

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  time: string;
  read: boolean;
  type: 'critical' | 'warning' | 'info' | 'success';
  invoiceId?: string;
}

interface ToastMessage {
  id: string;
  title: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

interface AppContextType {
  invoices: Invoice[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  payments: PaymentRecord[];
  notifications: AppNotification[];
  toast: ToastMessage | null;
  isLoading: boolean;
  
  // Dashboard Metrics
  totalPayables: number;
  invoicesReceived: number;
  needAttentionCount: number;
  overdueAmount: number;
  timeSavedHours: number;
  
  // Action handlers
  updateInvoiceStatus: (id: string, newStatus: InvoiceStatus, note?: string) => Promise<void>;
  approveInvoice: (id: string) => Promise<void>;
  holdInvoice: (id: string) => Promise<void>;
  addInvoice: (invoiceData: Partial<Invoice>) => Promise<Invoice>;
  createSupplier: (supplierData: Partial<Supplier>) => Promise<Supplier>;
  updateSupplier: (id: string, supplierData: Partial<Supplier>) => Promise<Supplier>;
  deleteSupplier: (id: string) => Promise<void>;
  resolveException: (exceptionId: string, invoiceId?: string) => Promise<void>;
  updatePaymentStatus: (paymentId: string, status: string) => Promise<void>;
  acceptPOVariance: (poNumberOrId: string, invoiceId?: string) => Promise<void>;
  requestPOClarification: (poNumberOrId: string, invoiceId?: string, reason?: string) => Promise<void>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  refreshData: () => Promise<void>;
  resetToDefault: () => void;
  showToast: (title: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  
  // Copilot helper
  askCopilot: (query: string) => Promise<{
    reply: string;
    suggestedActions?: { label: string; action: () => void }[];
    relatedInvoices?: Invoice[];
    structuredData?: any;
  }>;
}

const NOTIF_STORAGE_KEY = 'invoiceflow_app_notifications_v1';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliersData, setSuppliersData] = useState<Supplier[]>([]);
  const [poData, setPoData] = useState<PurchaseOrder[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem(NOTIF_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load notifications from localStorage', e);
    }
    return [];
  });

  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Initial Data Fetching from REST APIs (parallelized and non-blocking)
  const fetchAllBackendData = useCallback(async () => {
    const token = localStorage.getItem('invoiceflow_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [fetchedInvoices, fetchedSuppliers, fetchedPOs, fetchedPayments] = await Promise.all([
        invoiceService.getInvoices().catch(() => []),
        supplierService.getSuppliers().catch(() => []),
        poService.getPurchaseOrders().catch(() => []),
        paymentService.getPayments().catch(() => []),
      ]);

      setInvoices(fetchedInvoices || []);
      setSuppliersData(fetchedSuppliers || []);
      setPoData(fetchedPOs || []);
      setPaymentRecords(fetchedPayments || []);
    } catch (err) {
      console.error('Failed to load data from backend server:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllBackendData();
  }, [fetchAllBackendData]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifications));
    } catch (e) {
      console.error('Failed to save notifications to localStorage', e);
    }
  }, [notifications]);

  const showToast = (title: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    const id = `toast-${Date.now()}`;
    setToast({ id, title, type });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 3500);
  };

  // Calculated Metrics
  const totalPayables = useMemo(() => {
    return invoices
      .filter((i) => i.paymentStatus !== 'paid' && i.status !== 'paid')
      .reduce((sum, i) => sum + i.amount, 0);
  }, [invoices]);

  const invoicesReceived = useMemo(() => invoices.length, [invoices]);

  const needAttentionCount = useMemo(() => {
    return invoices.filter(
      (i) => i.status === 'review' || i.status === 'critical' || i.status === 'hold' || i.status === 'on_hold' || i.riskLevel === 'high'
    ).length;
  }, [invoices]);

  const overdueAmount = useMemo(() => {
    return invoices
      .filter((i) => i.status === 'overdue' || i.paymentStatus === 'overdue')
      .reduce((sum, i) => sum + i.amount, 0);
  }, [invoices]);

  const timeSavedHours = useMemo(() => {
    const autoCleared = invoices.filter((i) => i.status === 'ready' || i.status === 'paid').length;
    return Number((autoCleared * 0.4).toFixed(1));
  }, [invoices]);

  // Derived Suppliers connected to invoices and POs
  const suppliers: Supplier[] = useMemo(() => {
    const supMap = new Map<string, Partial<Supplier>>();

    // 1. Registered suppliers from backend
    suppliersData.forEach((s) => {
      const key = (s.name || s.id || '').trim().toLowerCase();
      if (key) supMap.set(key, { ...s });
    });

    // 2. Add suppliers established by invoices
    invoices.forEach((inv) => {
      if (inv.supplierName && inv.supplierName.trim()) {
        const key = inv.supplierName.trim().toLowerCase();
        if (!supMap.has(key)) {
          supMap.set(key, {
            id: inv.supplierId || `sup-${key.replace(/[^a-z0-9]/g, '-')}`,
            name: inv.supplierName.trim(),
            gstin: inv.supplierGstin || 'Unregistered / Direct',
            email: inv.supplierEmail || 'billing@' + key.replace(/[^a-z0-9]/g, '') + '.com',
            phone: inv.supplierPhone || '+91 98000 00000',
            status: 'active',
            paymentTerms: inv.paymentTerms || 'Net 30 Days',
            bankAccounts: inv.bankDetails?.accountNumber
              ? [
                  {
                    accountNumber: inv.bankDetails.accountNumber,
                    bankName: inv.bankDetails.bankName || 'HDFC Bank',
                    ifsc: inv.bankDetails.ifsc || 'HDFC0001234',
                    isPrimary: true,
                    addedDate: new Date().toISOString().split('T')[0],
                  },
                ]
              : [],
          });
        }
      }
    });

    // 3. Add suppliers established by POs
    poData.forEach((po) => {
      if (po.supplierName && po.supplierName.trim()) {
        const key = po.supplierName.trim().toLowerCase();
        if (!supMap.has(key)) {
          supMap.set(key, {
            id: po.supplierId || `sup-${key.replace(/[^a-z0-9]/g, '-')}`,
            name: po.supplierName.trim(),
            gstin: (po as any).supplierGstin || 'Unregistered / Direct',
            email: 'procurement@' + key.replace(/[^a-z0-9]/g, '') + '.com',
            phone: '+91 98000 00000',
            status: 'active',
            paymentTerms: 'Net 30 Days',
            bankAccounts: [
              {
                accountNumber: '****',
                bankName: 'HDFC Bank',
                ifsc: 'HDFC0001234',
                isPrimary: true,
                addedDate: new Date().toISOString().split('T')[0],
              },
            ],
          });
        }
      }
    });

    return Array.from(supMap.values()).map((sup) => {
      const supNameLower = (sup.name || '').trim().toLowerCase();
      const supInvoices = invoices.filter(
        (i) => (sup.id && i.supplierId === sup.id) || (i.supplierName && i.supplierName.trim().toLowerCase() === supNameLower)
      );

      const totalSpend = supInvoices.reduce((sum, i) => sum + (typeof i.amount === 'number' && !isNaN(i.amount) ? i.amount : 0), 0);
      const totalPayable = supInvoices
        .filter((i) => i.paymentStatus !== 'paid' && i.status !== 'paid')
        .reduce((sum, i) => sum + (typeof i.amount === 'number' && !isNaN(i.amount) ? i.amount : 0), 0);

      const hasBankChange = supInvoices.some((i) => i.bankDetails?.isChangedFromPrevious);
      const hasCritical = supInvoices.some((i) => i.status === 'critical' || i.riskLevel === 'high');
      const hasMedium = supInvoices.some((i) => i.status === 'review' || i.status === 'hold' || i.status === 'on_hold' || i.riskLevel === 'medium');

      const derivedRiskLevel = hasCritical ? 'high' : hasMedium ? 'medium' : 'low';

      return {
        id: sup.id || `sup-${Date.now()}`,
        name: sup.name || 'Vendor',
        gstin: sup.gstin || 'Unregistered',
        email: sup.email || 'vendor@example.com',
        phone: sup.phone || '+91 98000 00000',
        status: sup.status || 'active',
        paymentTerms: sup.paymentTerms || 'Net 30 Days',
        invoiceCount: supInvoices.length,
        totalSpend,
        totalPayable,
        outstandingAmount: totalPayable,
        riskLevel: (sup.riskLevel || derivedRiskLevel) as any,
        lastInvoiceDate: sup.lastInvoiceDate || new Date().toISOString().split('T')[0],
        bankStatus: hasBankChange ? 'changed' : 'verified',
        riskStatus: derivedRiskLevel as any,
        bankAccounts: sup.bankAccounts || [
          {
            accountNumber: '****',
            ifsc: 'HDFC0001234',
            bankName: 'HDFC Bank',
            isPrimary: true,
            addedDate: new Date().toISOString().split('T')[0],
          },
        ],
      } as Supplier;
    });
  }, [invoices, suppliersData, poData]);

  // Derived POs connected to invoices
  const purchaseOrders: PurchaseOrder[] = useMemo(() => {
    return poData.map((po) => {
      const inv = invoices.find(
        (i) => (i.poNumber && i.poNumber.trim().toLowerCase() === po.poNumber.trim().toLowerCase()) || i.id === po.invoiceId
      );

      if ((po as any).varianceAccepted || po.matchStatus === 'matched' || po.status === 'matched') {
        return {
          ...po,
          matchStatus: 'matched',
          status: 'matched',
          invoiceId: inv?.id || po.invoiceId,
        };
      }

      if ((po as any).clarificationRequested || po.matchStatus === 'mismatch' || po.status === 'mismatch') {
        return {
          ...po,
          matchStatus: 'mismatch',
          status: 'mismatch',
          invoiceId: inv?.id || po.invoiceId,
        };
      }

      if (inv) {
        let matchStatus: PurchaseOrder['matchStatus'] = po.matchStatus || 'matched';
        if (inv.status === 'ready' || inv.aiStatus === 'Ready' || inv.aiStatus === 'Variance Accepted' || inv.aiStatus === 'Approved') {
          matchStatus = 'matched';
        } else if (inv.aiStatus === 'PO Mismatch' || Math.abs(inv.amount - po.totalAmount) > 2.0) {
          matchStatus = 'mismatch';
        } else {
          matchStatus = 'matched';
        }

        return {
          ...po,
          matchStatus,
          invoiceId: inv.id,
        };
      }
      return po;
    });
  }, [invoices, poData]);

  // Derived Payments connected to invoices
  const payments: PaymentRecord[] = useMemo(() => {
    if (paymentRecords.length > 0) {
      return paymentRecords.map((p) => {
        const inv = invoices.find((i) => i.id === p.invoiceId || i.invoiceNumber === p.invoiceNumber);
        if (inv) {
          return {
            ...p,
            status: inv.paymentStatus === 'paid' || inv.status === 'paid' ? 'paid' : inv.paymentStatus === 'overdue' || inv.status === 'overdue' ? 'overdue' : inv.status === 'hold' || inv.status === 'on_hold' ? 'on_hold' : p.status,
            amount: inv.amount,
          };
        }
        return p;
      });
    }

    return invoices.map((inv) => {
      let pStatus: PaymentRecord['status'] = 'pending';
      if (inv.paymentStatus === 'paid' || inv.status === 'paid') pStatus = 'paid';
      else if (inv.paymentStatus === 'overdue' || inv.status === 'overdue') pStatus = 'overdue';
      else if (inv.paymentStatus === 'on_hold' || inv.status === 'hold' || inv.status === 'on_hold') pStatus = 'on_hold';
      else if (inv.paymentStatus === 'scheduled') pStatus = 'scheduled';

      return {
        id: `pay-${inv.id}`,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        supplierName: inv.supplierName,
        amount: inv.amount,
        dueDate: inv.dueDate,
        status: pStatus,
        bankName: inv.bankDetails?.bankName || 'Bank',
        accountEnding: inv.bankDetails?.accountNumber?.slice(-4) || '****',
        poNumber: inv.poNumber,
      };
    });
  }, [invoices, paymentRecords]);

  // Handlers communicating with backend APIs
  const updateInvoiceStatus = async (id: string, newStatus: InvoiceStatus) => {
    try {
      const updated = await invoiceService.updateInvoiceStatus(id, newStatus);
      if (updated) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === updated.id || inv.invoiceNumber.toLowerCase() === updated.invoiceNumber.toLowerCase()
              ? updated
              : inv
          )
        );
        await fetchAllBackendData();
      }
    } catch (err: any) {
      console.error(`Backend sync failed for invoice ${id}:`, err);
      showToast(err?.message || `Failed to update invoice status for ${id}.`, 'error');
      throw err;
    }
  };

  const approveInvoice = async (id: string) => {
    try {
      const updated = await invoiceService.approveInvoice(id);
      
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === updated.id || inv.invoiceNumber.toLowerCase() === updated.invoiceNumber.toLowerCase()
            ? updated
            : inv
        )
      );

      // Resolve associated notification
      setNotifications((prev) =>
        prev.map((n) => (n.invoiceId === updated.id || n.invoiceId === id ? { ...n, read: true } : n))
      );

      await fetchAllBackendData();
      showToast(`Invoice ${updated.invoiceNumber} approved & queued for payment!`, 'success');
    } catch (err: any) {
      console.error(`Failed to approve invoice ${id}:`, err);
      showToast(err?.message || `Failed to approve invoice ${id}.`, 'error');
    }
  };

  const holdInvoice = async (id: string) => {
    try {
      const updated = await invoiceService.holdInvoice(id);
      
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === updated.id || inv.invoiceNumber.toLowerCase() === updated.invoiceNumber.toLowerCase()
            ? updated
            : inv
        )
      );

      await fetchAllBackendData();
      showToast(`Invoice ${updated.invoiceNumber} placed on Hold!`, 'warning');
    } catch (err: any) {
      console.error(`Failed to place invoice on hold ${id}:`, err);
      showToast(err?.message || `Failed to place invoice ${id} on hold.`, 'error');
    }
  };

  const resolveException = async (exceptionId: string, invoiceId?: string) => {
    try {
      await exceptionService.resolveException(exceptionId);
      if (invoiceId) {
        await invoiceService.approveInvoice(invoiceId).catch(() => null);
      }
      await fetchAllBackendData();
      showToast(`Exception ${exceptionId} resolved`, 'success');
    } catch (err: any) {
      console.error(`Failed to resolve exception ${exceptionId}:`, err);
      showToast(err?.message || `Failed to resolve exception ${exceptionId}`, 'error');
    }
  };

  const updatePaymentStatus = async (paymentId: string, status: string) => {
    try {
      await fetch(`/api/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      showToast(`Payment ${paymentId} status updated to ${status}`, 'info');
      await fetchAllBackendData();
    } catch (err: any) {
      console.error(`Failed to update payment ${paymentId}:`, err);
      showToast(err?.message || `Failed to update payment ${paymentId}`, 'error');
    }
  };

  const acceptPOVariance = async (poNumberOrId: string, invoiceId?: string): Promise<void> => {
    try {
      await poService.acceptVariance(poNumberOrId, invoiceId);
      await fetchAllBackendData();
      showToast(`Variance accepted for PO ${poNumberOrId}! Reconciled & queued for payment.`, 'success');
    } catch (err: any) {
      console.error(`Failed to accept variance for PO ${poNumberOrId}:`, err);
      showToast(err?.message || 'Failed to persist variance acceptance to backend.', 'error');
    }
  };

  const requestPOClarification = async (poNumberOrId: string, invoiceId?: string, reason?: string): Promise<void> => {
    try {
      await poService.requestClarification(poNumberOrId, invoiceId, reason);
      await fetchAllBackendData();
      showToast(`Clarification requested for PO ${poNumberOrId}!`, 'warning');
    } catch (err: any) {
      console.error(`Failed to request clarification for PO ${poNumberOrId}:`, err);
      showToast(err?.message || 'Failed to persist clarification request to backend.', 'error');
    }
  };

  const addInvoice = async (invoiceData: Partial<Invoice>): Promise<Invoice> => {
    const newInvoice = await invoiceService.uploadInvoice(invoiceData);
    setInvoices((prev) => [newInvoice, ...prev]);

    // Add new notification
    const newNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      title: `New Invoice Ingested (${newInvoice.invoiceNumber})`,
      description: `${newInvoice.supplierName} • ₹${newInvoice.amount.toLocaleString('en-IN')} processed by AI.`,
      time: 'Just now',
      read: false,
      type: newInvoice.status === 'ready' ? 'success' : 'warning',
      invoiceId: newInvoice.id,
    };

    setNotifications((prev) => [newNotif, ...prev]);
    showToast(`Invoice ${newInvoice.invoiceNumber} uploaded & processed!`, 'success');

    return newInvoice;
  };

  // Supplier Management Handlers
  const createSupplier = async (supplierData: Partial<Supplier>): Promise<Supplier> => {
    const created = await supplierService.createSupplier(supplierData);
    setSuppliersData((prev) => [created, ...prev]);
    showToast(`Supplier "${created.name}" created successfully!`, 'success');
    return created;
  };

  const updateSupplier = async (id: string, supplierData: Partial<Supplier>): Promise<Supplier> => {
    const updated = await supplierService.updateSupplier(id, supplierData);
    setSuppliersData((prev) => prev.map((s) => (s.id === id ? updated : s)));
    showToast(`Supplier "${updated.name}" updated successfully!`, 'success');
    return updated;
  };

  const deleteSupplier = async (id: string): Promise<void> => {
    const res = await supplierService.deleteSupplier(id);
    setSuppliersData((prev) => prev.filter((s) => s.id !== id));
    showToast(`Supplier "${res.name || 'Vendor'}" deleted successfully.`, 'info');
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    showToast('All notifications marked as read', 'info');
  };

  const refreshData = async () => {
    await fetchAllBackendData();
    showToast('Data refreshed & synced with backend', 'info');
  };

  const resetToDefault = () => {
    fetchAllBackendData();
    localStorage.removeItem(NOTIF_STORAGE_KEY);
    setNotifications([]);
    showToast('Data refreshed from live backend API', 'info');
  };

  // AI Copilot Query Engine (Calls authenticated backend API)
  const askCopilot = async (query: string) => {
    try {
      const res = await copilotService.askCopilot(query);
      return {
        reply: res.content,
        relatedInvoices: [],
        structuredData: res.structuredData,
      };
    } catch (err: any) {
      return {
        reply: err?.message || 'Failed to communicate with Copilot API.',
        relatedInvoices: [],
      };
    }
  };

  return (
    <AppContext.Provider
      value={{
        invoices,
        suppliers,
        purchaseOrders,
        payments,
        notifications,
        toast,
        isLoading,
        totalPayables,
        invoicesReceived,
        needAttentionCount,
        overdueAmount,
        timeSavedHours,
        updateInvoiceStatus,
        approveInvoice,
        holdInvoice,
        addInvoice,
        createSupplier,
        updateSupplier,
        deleteSupplier,
        resolveException,
        updatePaymentStatus,
        acceptPOVariance,
        requestPOClarification,
        markNotificationRead,
        markAllNotificationsRead,
        refreshData,
        resetToDefault,
        showToast,
        askCopilot,
      }}
    >
      {children}

      {/* Global Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-elevated border border-slate-800 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span className="font-semibold">{toast.title}</span>
        </div>
      )}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
