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
    const rawInvoices = await InvoiceModel.find({ companyId });
    const allInvoices = (rawInvoices || []).filter(Boolean);
    const totalInvoicesCount = allInvoices.length;

    const unpaidInvoices = allInvoices.filter(
      (i) => i && i.paymentStatus !== 'paid' && i.status !== 'paid'
    );
    const totalPayablesAmount = unpaidInvoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

    const overdueInvoices = allInvoices.filter(
      (i) => i && (i.status === 'overdue' || i.paymentStatus === 'overdue')
    );
    const overdueTotalAmount = overdueInvoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

    const attentionInvoices = allInvoices.filter(
      (i) =>
        i &&
        (i.status === 'review' ||
          i.status === 'critical' ||
          i.status === 'hold' ||
          i.status === 'on_hold')
    );

    const bankChangedInvoices = allInvoices.filter(
      (i) => i && Boolean(i.bankDetails?.isChangedFromPrevious)
    );

    const poMismatchInvoices = allInvoices.filter(
      (i) =>
        i &&
        (i.aiStatus === 'PO Mismatch' ||
          i.status === 'critical' ||
          (i.poNumber && i.status === 'review'))
    );

    // Highest amount invoice
    let highestAmountInvoice: CopilotContextPayload['companyMetrics']['highestAmountInvoice'] = null;
    if (allInvoices.length > 0) {
      const sortedByAmount = [...allInvoices].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
      const top = sortedByAmount[0];
      if (top) {
        highestAmountInvoice = {
          invoiceNumber: top.invoiceNumber || 'N/A',
          supplierName: top.supplierName || 'Supplier',
          amount: Number(top.amount) || 0,
          status: top.status || 'review',
          id: top.id || top._id?.toString() || '',
        };
      }
    }

    const rawPOs = await PurchaseOrderModel.find({ companyId });
    const allPOs = (rawPOs || []).filter(Boolean);
    const openPOCount = allPOs.filter((po) => po && po.status === 'open').length;

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
      relevantInvoices = [...allInvoices].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 5);
    } else {
      relevantInvoices = allInvoices.slice(0, 5);
    }

    // Exceptions filtering
    if (isPOQuery || isAttentionQuery || isOverdueQuery) {
      const rawEx = await ExceptionModel.find({ companyId }).sort({ createdAt: -1 }).limit(10);
      relevantExceptions = (rawEx || []).filter(Boolean);
    }

    // Purchase Orders filtering
    if (isPOQuery) {
      relevantPurchaseOrders = allPOs.slice(0, 10);
    }

    // Suppliers filtering
    if (isBankSupplierQuery) {
      const rawSup = await SupplierModel.find({ companyId }).limit(10);
      relevantSuppliers = (rawSup || []).filter(Boolean);
    }

    // Payments filtering
    if (isPayablesQuery || isOverdueQuery) {
      const rawPay = await PaymentModel.find({ companyId, status: { $ne: 'paid' } }).limit(10);
      relevantPayments = (rawPay || []).filter(Boolean);
    }

    // Documents filtering
    if (isPOQuery || isAttentionQuery) {
      const rawDocs = await DocumentModel.find({ companyId }).sort({ createdAt: -1 }).limit(10);
      relevantDocuments = (rawDocs || []).filter(Boolean);
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
          id: inv?.id || inv?._id?.toString() || '',
          invoiceNumber: inv?.invoiceNumber || 'N/A',
          supplierName: inv?.supplierName || 'Unknown Vendor',
          supplierGstin: inv?.supplierGstin || null,
          amount: Number(inv?.amount) || 0,
          subtotal: Number(inv?.subtotal) || 0,
          tax: Number(inv?.tax) || 0,
          currency: inv?.currency || 'INR',
          dueDate: inv?.dueDate || null,
          poNumber: inv?.poNumber || null,
          status: inv?.status || 'review',
          paymentStatus: inv?.paymentStatus || 'pending',
          riskLevel: inv?.riskLevel || 'low',
          aiStatus: inv?.aiStatus || 'Needs Review',
          aiRecommendation: inv?.aiRecommendation || '',
          bankAccountChanged: Boolean(inv?.bankDetails?.isChangedFromPrevious),
        })),
        relevantPurchaseOrders: relevantPurchaseOrders.map((po) => ({
          id: po?.id || po?._id?.toString() || '',
          poNumber: po?.poNumber || 'N/A',
          supplierName: po?.supplierName || 'Unknown Vendor',
          totalAmount: Number(po?.totalAmount) || 0,
          status: po?.status || 'open',
          matchStatus: po?.matchStatus || 'open',
        })),
        relevantSuppliers: relevantSuppliers.map((sup) => ({
          id: sup?.id || sup?._id?.toString() || '',
          name: sup?.name || 'Unknown Vendor',
          gstin: sup?.gstin || '',
          email: sup?.email || '',
          phone: sup?.phone || '',
        })),
        relevantExceptions: relevantExceptions.map((ex) => ({
          id: ex?.id || ex?._id?.toString() || '',
          invoiceNumber: ex?.invoiceNumber || 'N/A',
          supplierName: ex?.supplierName || 'Unknown Vendor',
          title: ex?.title || 'Exception',
          severity: ex?.severity || 'review',
          aiRecommendation: ex?.aiRecommendation || '',
        })),
        relevantPayments: relevantPayments.map((pm) => ({
          id: pm?.id || pm?._id?.toString() || '',
          invoiceNumber: pm?.invoiceNumber || 'N/A',
          supplierName: pm?.supplierName || 'Unknown Vendor',
          amount: Number(pm?.amount) || 0,
          dueDate: pm?.dueDate || '',
          status: pm?.status || 'pending',
        })),
        relevantDocuments: relevantDocuments.map((doc) => ({
          id: doc?.id || doc?._id?.toString() || '',
          originalFileName: doc?.originalFileName || '',
          documentType: doc?.documentType || 'unknown',
          processingStatus: doc?.processingStatus || 'uploaded',
          matchStatus: doc?.matchResult?.matchStatus || 'no_match',
        })),
      },
    };
  }
}

export const copilotContextService = new CopilotContextService();
