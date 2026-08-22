import type { Invoice, InvoiceStatus } from '../types';
import { fetchApi, API_BASE_URL } from './api';

export const invoiceService = {
  getInvoices: async (filter?: string, search?: string): Promise<Invoice[]> => {
    try {
      const queryParams = new URLSearchParams();
      if (filter) queryParams.append('filter', filter);
      if (search) queryParams.append('search', search);

      const queryString = queryParams.toString();
      const endpoint = `/invoices${queryString ? `?${queryString}` : ''}`;
      return await fetchApi<Invoice[]>(endpoint);
    } catch (err) {
      console.error('Error fetching invoices from backend:', err);
      return [];
    }
  },

  getInvoiceById: async (id: string): Promise<Invoice | null> => {
    try {
      return await fetchApi<Invoice>(`/invoices/${id}`);
    } catch (err) {
      console.error(`Error fetching invoice ${id}:`, err);
      return null;
    }
  },

  updateInvoiceStatus: async (id: string, status: InvoiceStatus): Promise<Invoice | null> => {
    try {
      return await fetchApi<Invoice>(`/invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.error(`Error updating invoice status ${id}:`, err);
      return null;
    }
  },

  uploadInvoice: async (invoiceData: Partial<Invoice>): Promise<Invoice> => {
    try {
      return await fetchApi<Invoice>('/invoices', {
        method: 'POST',
        body: JSON.stringify(invoiceData),
      });
    } catch (err) {
      console.error('Error uploading invoice:', err);
      throw err;
    }
  },

  uploadInvoiceFile: async (file: File): Promise<{ success: boolean; invoice: Invoice; extraction: any }> => {
    try {
      const url = `${API_BASE_URL}/invoices/upload`;
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('invoiceflow_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || `Upload failed with status ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.error('Error uploading invoice file:', err);
      throw err;
    }
  },
};
