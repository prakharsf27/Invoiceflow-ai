import { API_BASE_URL, getAuthToken, fetchApi } from './api';

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
   * Query is evaluated against user's company-isolated MongoDB records via Gemini 2.5 Flash.
   */
  askCopilot: async (question: string): Promise<CopilotApiResponse> => {
    const res = await fetchApi<{ success: boolean; data: CopilotApiResponse }>('/copilot/ask', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });

    return res.data;
  },
};
