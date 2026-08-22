import type { DashboardMetrics } from '../types';

export const mockDashboardMetrics: DashboardMetrics = {
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

export const mockCashflowTimeline: { date: string; amount: number; status: string }[] = [];
