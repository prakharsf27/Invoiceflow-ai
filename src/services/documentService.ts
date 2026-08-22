import { API_BASE_URL, getAuthToken, fetchApi } from './api';
import type { AppDocument } from '../types';

export interface BatchUploadResponse {
  success: boolean;
  documents: Array<{
    id: string;
    originalFileName: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    documentType: 'unknown' | 'invoice' | 'purchase_order';
    processingStatus: string;
    extractionStatus: string;
    createdAt: string;
    status: 'success';
  }>;
  errors: Array<{
    originalFileName: string;
    error: string;
  }>;
  summary: {
    totalReceived: number;
    totalUploaded: number;
    totalFailed: number;
  };
}

export const documentService = {
  /**
   * Upload multiple document files to POST /api/documents/upload.
   */
  uploadDocuments: async (files: File[]): Promise<BatchUploadResponse> => {
    const token = getAuthToken();
    const formData = new FormData();

    files.forEach((file) => {
      formData.append('files', file);
    });

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const json = await response.json();
    if (!response.ok && !json.documents) {
      throw new Error(json.error || json.message || `Upload failed with status ${response.status}`);
    }

    return json;
  },

  /**
   * Fetch company documents with optional query filters.
   */
  getDocuments: async (filters?: {
    documentType?: string;
    processingStatus?: string;
    extractionStatus?: string;
    search?: string;
  }): Promise<AppDocument[]> => {
    try {
      const params = new URLSearchParams();
      if (filters?.documentType && filters.documentType !== 'all') {
        params.append('documentType', filters.documentType);
      }
      if (filters?.processingStatus && filters.processingStatus !== 'all') {
        params.append('processingStatus', filters.processingStatus);
      }
      if (filters?.extractionStatus && filters.extractionStatus !== 'all') {
        params.append('extractionStatus', filters.extractionStatus);
      }
      if (filters?.search && filters.search.trim() !== '') {
        params.append('search', filters.search.trim());
      }

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await fetchApi<{ success: boolean; documents: AppDocument[] }>(`/documents${queryString}`);
      return res.documents || [];
    } catch (err) {
      console.error('Error fetching documents:', err);
      return [];
    }
  },

  /**
   * Fetch details for a specific document.
   */
  getDocumentById: async (id: string): Promise<AppDocument | null> => {
    try {
      const res = await fetchApi<{ success: boolean; document: AppDocument }>(`/documents/${id}`);
      return res.document || null;
    } catch (err) {
      console.error(`Error fetching document ${id}:`, err);
      return null;
    }
  },

  /**
   * Idempotently process document (POST /api/documents/:id/process).
   */
  processDocument: async (id: string): Promise<AppDocument | null> => {
    try {
      const res = await fetchApi<{ success: boolean; document: AppDocument }>(`/documents/${id}/process`, {
        method: 'POST',
      });
      return res.document || null;
    } catch (err) {
      console.error(`Error processing document ${id}:`, err);
      throw err;
    }
  },

  /**
   * Force reprocess document (POST /api/documents/:id/reprocess).
   */
  reprocessDocument: async (id: string): Promise<AppDocument | null> => {
    try {
      const res = await fetchApi<{ success: boolean; document: AppDocument }>(`/documents/${id}/reprocess`, {
        method: 'POST',
      });
      return res.document || null;
    } catch (err) {
      console.error(`Error reprocessing document ${id}:`, err);
      throw err;
    }
  },

  /**
   * Get extracted JSON payload and validation checks (0 AI calls).
   */
  getDocumentExtraction: async (id: string): Promise<any> => {
    try {
      return await fetchApi(`/documents/${id}/extraction`);
    } catch (err) {
      console.error(`Error fetching extraction for ${id}:`, err);
      return null;
    }
  },

  /**
   * Get PO match result for a document (0 AI calls).
   */
  getDocumentMatches: async (id: string): Promise<any> => {
    try {
      return await fetchApi(`/documents/${id}/matches`);
    } catch (err) {
      console.error(`Error fetching matches for ${id}:`, err);
      return null;
    }
  },

  /**
   * Delete a document.
   */
  deleteDocument: async (id: string): Promise<boolean> => {
    try {
      await fetchApi(`/documents/${id}`, { method: 'DELETE' });
      return true;
    } catch (err) {
      console.error(`Error deleting document ${id}:`, err);
      return false;
    }
  },

  /**
   * Helper to construct authorized document file preview URL.
   */
  getDocumentFileUrl: (id: string): string => {
    return `${API_BASE_URL}/documents/${id}/file`;
  },
};
