import type { DashboardMetrics } from '../types';
import { fetchApi } from './api';

export interface DashboardResponse extends DashboardMetrics {
  cashflowTimeline: { date: string; amount: number; status: string }[];
}

export const dashboardService = {
  getMetrics: async (): Promise<DashboardMetrics> => {
    try {
      const data = await fetchApi<DashboardResponse>('/dashboard');
      return data;
    } catch (err) {
      console.error('Error fetching dashboard metrics from backend API:', err);
      return {
        totalPayables: 0,
        payablesGrowthPercent: 0,
        invoicesReceivedWeek: 0,
        needAttentionCount: 0,
        overdueAmount: 0,
        overdueInvoiceCount: 0,
        timeSavedHours: 0,
        autoClearedCount: 0,
        needsReviewCount: 0,
        criticalCount: 0,
        totalProcessedCount: 0,
      };
    }
  },

  getCashflowTimeline: async () => {
    try {
      const data = await fetchApi<DashboardResponse>('/dashboard');
      return data.cashflowTimeline || [];
    } catch (err) {
      console.error('Error fetching cashflow timeline from backend API:', err);
      return [];
    }
  },
};
