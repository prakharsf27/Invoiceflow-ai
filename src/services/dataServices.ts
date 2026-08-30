import type { Supplier, Exception, PurchaseOrder, PaymentRecord, CopilotMessage } from '../types';
import { fetchApi } from './api';

export const supplierService = {
  getSuppliers: async (): Promise<Supplier[]> => {
    try {
      return await fetchApi<Supplier[]>('/suppliers');
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      return [];
    }
  },
  getSupplierById: async (id: string): Promise<Supplier | null> => {
    try {
      return await fetchApi<Supplier>(`/suppliers/${id}`);
    } catch (err) {
      console.error(`Error fetching supplier ${id}:`, err);
      return null;
    }
  },
  createSupplier: async (data: Partial<Supplier>): Promise<Supplier> => {
    return await fetchApi<Supplier>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateSupplier: async (id: string, data: Partial<Supplier>): Promise<Supplier> => {
    return await fetchApi<Supplier>(`/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteSupplier: async (id: string): Promise<{ id: string; name: string }> => {
    return await fetchApi<{ id: string; name: string }>(`/suppliers/${id}`, {
      method: 'DELETE',
    });
  },
};

export const exceptionService = {
  getExceptions: async (): Promise<Exception[]> => {
    try {
      return await fetchApi<Exception[]>('/exceptions');
    } catch (err) {
      console.error('Error fetching exceptions:', err);
      return [];
    }
  },
  resolveException: async (id: string): Promise<boolean> => {
    try {
      await fetchApi<Exception>(`/exceptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
      });
      return true;
    } catch (err) {
      console.error(`Error resolving exception ${id}:`, err);
      return false;
    }
  },
};

export const poService = {
  getPurchaseOrders: async (): Promise<PurchaseOrder[]> => {
    try {
      return await fetchApi<PurchaseOrder[]>('/purchase-orders');
    } catch (err) {
      console.error('Error fetching purchase orders:', err);
      return [];
    }
  },
  getPOById: async (poNumber: string): Promise<PurchaseOrder | null> => {
    try {
      return await fetchApi<PurchaseOrder>(`/purchase-orders/${poNumber}`);
    } catch (err) {
      console.error(`Error fetching PO ${poNumber}:`, err);
      return null;
    }
  },
};

export const paymentService = {
  getPayments: async (): Promise<PaymentRecord[]> => {
    try {
      return await fetchApi<PaymentRecord[]>('/payments');
    } catch (err) {
      console.error('Error fetching payments:', err);
      return [];
    }
  },
};

export const aiService = {
  analyzeInvoiceRisk: async (
    invoiceId: string,
    options?: { forceReanalyze?: boolean }
  ): Promise<{
    success: boolean;
    analysis: any;
    model?: string;
    analyzedAt?: string;
    analysisKey?: string;
    cached?: boolean;
    invoice?: any;
  }> => {
    try {
      return await fetchApi<{
        success: boolean;
        analysis: any;
        model?: string;
        analyzedAt?: string;
        analysisKey?: string;
        cached?: boolean;
        invoice?: any;
      }>(`/ai/analyze-invoice/${invoiceId}`, {
        method: 'POST',
        body: JSON.stringify({ forceReanalyze: options?.forceReanalyze }),
      });
    } catch (err) {
      console.error(`Error analyzing risk for invoice ${invoiceId}:`, err);
      throw err;
    }
  },
};

export const copilotService = {
  ask: async (question: string): Promise<CopilotMessage> => {
    try {
      return await fetchApi<CopilotMessage>('/copilot/ask', {
        method: 'POST',
        body: JSON.stringify({ question }),
      });
    } catch (err) {
      console.error('Error asking copilot:', err);
      return {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Unable to reach backend copilot engine right now. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    }
  },
};
