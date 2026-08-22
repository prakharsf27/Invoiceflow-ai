import { InvoiceModel } from '../../models/Invoice.js';
import { PurchaseOrderModel } from '../../models/PurchaseOrder.js';
import { SupplierModel } from '../../models/Supplier.js';
import { PaymentModel } from '../../models/Payment.js';
import { ExceptionModel } from '../../models/Exception.js';
import { DocumentModel } from '../../models/Document.js';

export interface CopilotContextPayload {
  companyMetrics: {
    totalInvoicesCount: number;
    totalPayablesAmount: number;
    overdueInvoicesCount: number;
    overdueTotalAmount: number;
    attentionRequiredCount: number;
    highestAmountInvoice: {
      invoiceNumber: string;
      supplierName: string;
      amount: number;
      status: string;
      id: string;
    } | null;
    bankDetailsChangedCount: number;
    poMismatchCount: number;
    openPOCount: number;
  };
  querySpecificRecords: {
    relevantInvoices: any[];
    relevantPurchaseOrders: any[];
    relevantSuppliers: any[];
    relevantExceptions: any[];
    relevantPayments: any[];
    relevantDocuments: any[];
  };
}

class CopilotContextService {
  /**
   * Question-aware context retrieval. Analyzes user query keywords to pick only relevant company-scoped MongoDB records,
   * keeping prompt payload compact and bounded.
   */
  public async buildQuestionAwareContext(
    companyId: string,
    question: string
  ): Promise<CopilotContextPayload> {
    const q = (question || '').toLowerCase().trim();

    // 1. Fetch Company Summary Metrics from MongoDB (Scoped to companyId)
    const allInvoices = await InvoiceModel.find({ companyId });
    const totalInvoicesCount = allInvoices.length;

    const unpaidInvoices = allInvoices.filter(
      (i) => i.paymentStatus !== 'paid' && i.status !== 'paid'
    );
    const totalPayablesAmount = unpaidInvoices.reduce((sum, i) => sum + (i.amount || 0), 0);

    const overdueInvoices = allInvoices.filter(
      (i) => i.status === 'overdue' || i.paymentStatus === 'overdue'
    );
    const overdueTotalAmount = overdueInvoices.reduce((sum, i) => sum + (i.amount || 0), 0);

    const attentionInvoices = allInvoices.filter(
      (i) =>
        i.status === 'review' ||
        i.status === 'critical' ||
        i.status === 'hold' ||
        i.status === 'on_hold'
    );

    const bankChangedInvoices = allInvoices.filter(
      (i) => i.bankDetails?.isChangedFromPrevious
    );

    const poMismatchInvoices = allInvoices.filter(
      (i) =>
        i.aiStatus === 'PO Mismatch' ||
        i.status === 'critical' ||
        (i.poNumber && i.status === 'review')
    );

    // Highest amount invoice
    let highestAmountInvoice: CopilotContextPayload['companyMetrics']['highestAmountInvoice'] = null;
    if (allInvoices.length > 0) {
      const sortedByAmount = [...allInvoices].sort((a, b) => b.amount - a.amount);
      const top = sortedByAmount[0];
      highestAmountInvoice = {
        invoiceNumber: top.invoiceNumber,
        supplierName: top.supplierName,
        amount: top.amount,
        status: top.status,
        id: top.id || top._id?.toString(),
      };
    }

    const allPOs = await PurchaseOrderModel.find({ companyId });
    const openPOCount = allPOs.filter((po) => po.status === 'open').length;

    // 2. Question-Aware Specific Record Filtering
    let relevantInvoices: any[] = [];
    let relevantPurchaseOrders: any[] = [];
    let relevantSuppliers: any[] = [];
    let relevantExceptions: any[] = [];
    let relevantPayments: any[] = [];
    let relevantDocuments: any[] = [];

    const isAttentionQuery =
      q.includes('attention') || q.includes('today') || q.includes('review') || q.includes('action');
    const isOverdueQuery =
      q.includes('overdue') || q.includes('late') || q.includes('unpaid') || q.includes('due');
    const isPayablesQuery =
      q.includes('total') || q.includes('outstanding') || q.includes('payable') || q.includes('highest') || q.includes('maximum');
    const isPOQuery =
      q.includes('po') || q.includes('mismatch') || q.includes('purchase order') || q.includes('variance') || q.includes('match');
    const isBankSupplierQuery =
      q.includes('bank') || q.includes('changed') || q.includes('supplier') || q.includes('vendor') || q.includes('account');

    // Invoices filtering
    if (isOverdueQuery) {
      relevantInvoices = overdueInvoices;
    } else if (isAttentionQuery) {
      relevantInvoices = attentionInvoices.length > 0 ? attentionInvoices : allInvoices.slice(0, 5);
    } else if (isPOQuery) {
      relevantInvoices = poMismatchInvoices.length > 0 ? poMismatchInvoices : allInvoices.slice(0, 5);
    } else if (isBankSupplierQuery) {
      relevantInvoices = bankChangedInvoices.length > 0 ? bankChangedInvoices : allInvoices.slice(0, 5);
    } else if (isPayablesQuery) {
      relevantInvoices = [...allInvoices].sort((a, b) => b.amount - a.amount).slice(0, 5);
    } else {
      relevantInvoices = allInvoices.slice(0, 5);
    }

    // Exceptions filtering
    if (isPOQuery || isAttentionQuery || isOverdueQuery) {
      relevantExceptions = await ExceptionModel.find({ companyId }).sort({ createdAt: -1 }).limit(10);
    }

    // Purchase Orders filtering
    if (isPOQuery) {
      relevantPurchaseOrders = allPOs.slice(0, 10);
    }

    // Suppliers filtering
    if (isBankSupplierQuery) {
      relevantSuppliers = await SupplierModel.find({ companyId }).limit(10);
    }

    // Payments filtering
    if (isPayablesQuery || isOverdueQuery) {
      relevantPayments = await PaymentModel.find({ companyId, status: { $ne: 'paid' } }).limit(10);
    }

    // Documents filtering
    if (isPOQuery || isAttentionQuery) {
      relevantDocuments = await DocumentModel.find({ companyId }).sort({ createdAt: -1 }).limit(10);
    }

    return {
      companyMetrics: {
        totalInvoicesCount,
        totalPayablesAmount,
        overdueInvoicesCount: overdueInvoices.length,
        overdueTotalAmount,
        attentionRequiredCount: attentionInvoices.length,
        highestAmountInvoice,
        bankDetailsChangedCount: bankChangedInvoices.length,
        poMismatchCount: poMismatchInvoices.length,
        openPOCount,
      },
      querySpecificRecords: {
        relevantInvoices: relevantInvoices.map((inv) => ({
          id: inv.id || inv._id?.toString(),
          invoiceNumber: inv.invoiceNumber,
          supplierName: inv.supplierName,
          supplierGstin: inv.supplierGstin,
          amount: inv.amount,
          subtotal: inv.subtotal,
          tax: inv.tax,
          currency: inv.currency,
          dueDate: inv.dueDate,
          poNumber: inv.poNumber,
          status: inv.status,
          paymentStatus: inv.paymentStatus,
          riskLevel: inv.riskLevel,
          aiStatus: inv.aiStatus,
          aiRecommendation: inv.aiRecommendation,
          bankAccountChanged: Boolean(inv.bankDetails?.isChangedFromPrevious),
        })),
        relevantPurchaseOrders: relevantPurchaseOrders.map((po) => ({
          id: po.id || po._id?.toString(),
          poNumber: po.poNumber,
          supplierName: po.supplierName,
          totalAmount: po.totalAmount,
          status: po.status,
        })),
        relevantSuppliers: relevantSuppliers.map((sup) => ({
          name: sup.name,
          gstin: sup.gstin,
          email: sup.email,
          phone: sup.phone,
        })),
        relevantExceptions: relevantExceptions.map((ex) => ({
          id: ex.id,
          invoiceNumber: ex.invoiceNumber,
          supplierName: ex.supplierName,
          title: ex.title,
          severity: ex.severity,
          aiRecommendation: ex.aiRecommendation,
        })),
        relevantPayments: relevantPayments.map((pm) => ({
          id: pm.id,
          invoiceNumber: pm.invoiceNumber,
          supplierName: pm.supplierName,
          amount: pm.amount,
          dueDate: pm.dueDate,
          status: pm.status,
        })),
        relevantDocuments: relevantDocuments.map((doc) => ({
          id: doc.id,
          originalFileName: doc.originalFileName,
          documentType: doc.documentType,
          processingStatus: doc.processingStatus,
          matchStatus: doc.matchResult?.matchStatus,
        })),
      },
    };
  }
}

export const copilotContextService = new CopilotContextService();
