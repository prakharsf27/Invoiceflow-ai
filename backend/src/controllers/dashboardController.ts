import { Request, Response } from 'express';
import { InvoiceModel } from '../models/Invoice.js';
import { SupplierModel } from '../models/Supplier.js';
import { ExceptionModel } from '../models/Exception.js';

// GET /api/dashboard
export const getDashboardMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';

    const invoices = await InvoiceModel.find({ companyId });
    const suppliers = await SupplierModel.find({ companyId });
    const exceptions = await ExceptionModel.find({ companyId });

    const validInvoices = invoices.filter((i) => i.status !== 'failed' && i.status !== 'rejected');
    const totalInvoices = validInvoices.length;
    const totalPayables = validInvoices
      .filter((i) => i.paymentStatus !== 'paid' && i.status !== 'paid')
      .reduce((sum, i) => sum + (typeof i.amount === 'number' && !isNaN(i.amount) ? i.amount : 0), 0);

    const autoClearedCount = validInvoices.filter((i) => i.status === 'ready' || i.status === 'paid').length;
    const needsReviewCount = validInvoices.filter((i) => i.status === 'review' || i.status === 'on_hold' || i.status === 'hold').length;
    const criticalCount = validInvoices.filter((i) => i.status === 'critical' || i.riskLevel === 'high').length;
    const overdueAmount = validInvoices
      .filter((i) => i.status === 'overdue' || i.paymentStatus === 'overdue')
      .reduce((sum, i) => sum + (typeof i.amount === 'number' && !isNaN(i.amount) ? i.amount : 0), 0);

    const timeSavedHours = Number((autoClearedCount * 0.4 + (totalInvoices > 0 ? 0.5 : 0)).toFixed(1));
    const automationRate = totalInvoices > 0 ? Number(((autoClearedCount / totalInvoices) * 100).toFixed(1)) : 100.0;

    // Build timeline cashflow metrics from invoice due dates
    const timelineMap: Record<string, number> = {};
    validInvoices.forEach((inv) => {
      const dateKey = inv.dueDate || new Date().toISOString().split('T')[0];
      timelineMap[dateKey] = (timelineMap[dateKey] || 0) + (typeof inv.amount === 'number' && !isNaN(inv.amount) ? inv.amount : 0);
    });

    const cashflowTimeline = Object.entries(timelineMap).map(([date, amount]) => ({
      date,
      amount,
      status: invoices.find((i) => i.dueDate === date)?.paymentStatus || 'pending',
    }));

    res.json({
      success: true,
      data: {
        totalPayables,
        invoicesReceived: totalInvoices,
        totalProcessedCount: totalInvoices,
        autoClearedCount,
        needsReviewCount,
        criticalCount,
        overdueAmount,
        timeSavedHours,
        automationRate,
        supplierCount: suppliers.length,
        exceptionCount: exceptions.length,
        cashflowTimeline,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};
