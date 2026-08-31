import { fetchApi } from './api';

export interface CopilotApiResponse {
  id: string;
  role: 'assistant';
  content: string;
  timestamp: string;
  structuredData?: {
    type?: 'recommendation' | 'invoice_list';
    title?: string;
    highlightItem?: {
      title: string;
      amount?: string;
      dueDate?: string;
      risk?: string;
      reasons?: string[];
      recommendation?: string;
      actionUrl?: string;
      actionLabel?: string;
    };
  };
}

export const copilotService = {
  /**
   * Send question to authenticated backend POST /api/copilot/ask.
   * Evaluated against user's company-isolated dataset via the InvoiceFlow AI engine.
   */
  askCopilot: async (question: string): Promise<CopilotApiResponse> => {
    const rawRes: any = await fetchApi('/copilot/ask', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });

    // Handle both direct data payload and { data: ... } envelope safely
    const payload: CopilotApiResponse = rawRes?.data !== undefined ? rawRes.data : rawRes;

    return {
      id: payload?.id || `msg-${Date.now()}`,
      role: 'assistant',
      content: payload?.content || 'No response content available.',
      timestamp: payload?.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      structuredData: payload?.structuredData,
    };
  },
};
