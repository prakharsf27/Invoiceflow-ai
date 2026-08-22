import crypto from 'crypto';
import { InvoiceModel } from '../../models/Invoice.js';

export interface StoredAIAnalysis {
  status: 'completed' | 'pending' | 'failed';
  result: {
    riskScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    decision: 'approve' | 'review' | 'hold';
    reasons: string[];
    warnings: string[];
    recommendation: string;
  };
  model: string;
  analyzedAt: string;
  analysisKey: string;
  cached?: boolean;
}

class AICacheService {
  /**
   * Generates a deterministic SHA256 hash key from the invoice fields that affect AI analysis.
   */
  public generateInvoiceAnalysisKey(invoice: any): string {
    const keyPayload = {
      invoiceNumber: String(invoice.invoiceNumber || '').trim(),
      supplierName: String(invoice.supplierName || '').trim(),
      supplierGstin: String(invoice.supplierGstin || '').trim(),
      amount: Number(invoice.amount || 0),
      subtotal: Number(invoice.subtotal || 0),
      tax: Number(invoice.tax || 0),
      poNumber: String(invoice.poNumber || '').trim(),
      bankAccount: String(invoice.bankDetails?.accountNumber || '').trim(),
      bankChanged: Boolean(invoice.bankDetails?.isChangedFromPrevious),
      itemCount: Array.isArray(invoice.items) ? invoice.items.length : 0,
      itemSummary: Array.isArray(invoice.items)
        ? invoice.items.map((i: any) => `${i.description}:${i.quantity}:${i.unitPrice}:${i.total}`).join('|')
        : '',
    };

    return crypto.createHash('sha256').update(JSON.stringify(keyPayload)).digest('hex');
  }

  /**
   * Retrieve cached analysis if existing analysisKey matches and data has not changed.
   */
  public async getCachedInvoiceAnalysis(
    invoiceId: string,
    companyId: string,
    currentKey: string
  ): Promise<StoredAIAnalysis | null> {
    try {
      const invoice: any = await InvoiceModel.findOne({
        companyId,
        $or: [{ id: invoiceId }, { invoiceNumber: new RegExp(`^${invoiceId}$`, 'i') }],
      } as any);

      if (!invoice) return null;

      // Check new aiAnalysis structure or fallback riskAnalysis
      if (invoice.aiAnalysis && invoice.aiAnalysis.analysisKey === currentKey && invoice.aiAnalysis.result) {
        return {
          ...invoice.aiAnalysis,
          cached: true,
        };
      }

      if (invoice.riskAnalysis && (invoice.riskAnalysis as any).analysisKey === currentKey) {
        return {
          status: 'completed',
          result: invoice.riskAnalysis,
          model: (invoice.riskAnalysis as any).model || 'gemini-2.5-flash',
          analyzedAt: invoice.riskAnalysis.analyzedAt || new Date().toISOString(),
          analysisKey: currentKey,
          cached: true,
        };
      }

      return null;
    } catch (err) {
      console.warn('[AICacheService] Cache lookup error:', err);
      return null;
    }
  }

  /**
   * Persist AI analysis result to MongoDB document.
   */
  public async saveInvoiceAnalysis(
    invoiceId: string,
    companyId: string,
    analysis: StoredAIAnalysis['result'],
    model: string,
    analysisKey: string
  ): Promise<StoredAIAnalysis> {
    const analyzedAt = new Date().toISOString();
    const storedData: StoredAIAnalysis = {
      status: 'completed',
      result: analysis,
      model,
      analyzedAt,
      analysisKey,
      cached: false,
    };

    await InvoiceModel.findOneAndUpdate(
      {
        companyId,
        $or: [{ id: invoiceId }, { invoiceNumber: new RegExp(`^${invoiceId}$`, 'i') }],
      } as any,
      {
        $set: {
          aiAnalysis: storedData,
          riskAnalysis: {
            ...analysis,
            analyzedAt,
            analysisKey,
            model,
          },
        },
      }
    );

    return storedData;
  }
}

export const aiCacheService = new AICacheService();
