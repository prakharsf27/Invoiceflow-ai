import { Request, Response } from 'express';
import { aiService } from '../services/ai/aiService.js';
import { InvoiceModel } from '../models/Invoice.js';
import { SupplierModel } from '../models/Supplier.js';
import { PurchaseOrderModel } from '../models/PurchaseOrder.js';

/**
 * POST /api/ai/test
 * Test endpoint to verify Gemini AI integration using centralized AI service.
 */
export const testGemini = async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt } = req.body;
    const companyId = req.user?.companyId || 'company-demo-01';
    const userId = req.user?.userId;

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Invalid request: "prompt" string is required in request body.',
      });
      return;
    }

    if (!aiService.isConfigured()) {
      res.status(503).json({
        success: false,
        error: 'Gemini API key is not configured. Please set GEMINI_API_KEY in backend/.env',
        configured: false,
      });
      return;
    }

    const { response, model, latencyMs } = await aiService.generateText(prompt.trim(), undefined, {
      companyId,
      userId,
    });

    res.json({
      success: true,
      response,
      model,
      latencyMs,
    });
  } catch (error: any) {
    const message = error?.message || 'An error occurred while generating AI response.';
    const statusCode = message.includes('quota') || message.includes('rate limit') ? 429 : 500;

    res.status(statusCode).json({
      success: false,
      error: message,
    });
  }
};

/**
 * GET /api/ai/status
 * Check if Gemini AI is configured and ready.
 */
export const getAiStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const isConfigured = aiService.isConfigured();
    const model = aiService.getModel();
    res.json({
      success: true,
      configured: isConfigured,
      model,
      message: isConfigured
        ? 'Gemini AI is configured and ready.'
        : 'Gemini API key is missing. Set GEMINI_API_KEY in backend/.env',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to check AI status',
    });
  }
};

/**
 * POST /api/ai/analyze-invoice/:id
 * Generate or retrieve cached AI Risk Analysis for an invoice.
 * Only calls Gemini if the invoice is analyzed for the first time, data changed, or forceReanalyze is true.
 */
export const analyzeInvoiceRiskController = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const userId = req.user?.userId;
    const forceReanalyze = Boolean(req.body?.forceReanalyze);

    const id = String(req.params.id);
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    const queryConditions: any[] = [
      { id: id },
      { invoiceNumber: new RegExp(`^${id}$`, 'i') },
    ];

    if (isValidObjectId) {
      queryConditions.push({ _id: id });
    }

    const invoice: any = await InvoiceModel.findOne({
      companyId,
      $or: queryConditions,
    } as any);

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: `Invoice with ID or Number "${id}" not found.`,
      });
      return;
    }

    // Find related supplier scoped to company
    let supplier: any = null;
    if (invoice.supplierId || invoice.supplierName || invoice.supplierGstin) {
      const supplierConditions: any[] = [];
      if (invoice.supplierId) supplierConditions.push({ id: invoice.supplierId });
      if (invoice.supplierGstin) supplierConditions.push({ gstin: new RegExp(`^${invoice.supplierGstin}$`, 'i') });
      if (invoice.supplierName) supplierConditions.push({ name: new RegExp(invoice.supplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });

      supplier = await SupplierModel.findOne({
        companyId,
        $or: supplierConditions,
      } as any);
    }

    // Find related purchase order scoped to company
    let purchaseOrder: any = null;
    if (invoice.poNumber) {
      purchaseOrder = await PurchaseOrderModel.findOne({
        companyId,
        poNumber: new RegExp(`^${invoice.poNumber}$`, 'i'),
      } as any);
    }

    // Execute risk analysis through centralized AI service with caching & backoff
    const result = await aiService.analyzeInvoiceRisk(
      invoice,
      supplier,
      purchaseOrder,
      invoice.aiChecks,
      {
        companyId,
        userId,
        forceReanalyze,
      }
    );

    // Refresh invoice document from DB to return complete object
    const updatedInvoice = await InvoiceModel.findOne({
      companyId,
      $or: queryConditions,
    } as any);

    res.json({
      success: true,
      analysis: result.analysis,
      model: result.model,
      analyzedAt: result.analyzedAt,
      analysisKey: result.analysisKey,
      cached: result.cached,
      invoice: updatedInvoice || invoice,
    });
  } catch (error: any) {
    console.error('❌ AI Risk analysis controller error:', error);
    const message = error?.message || 'Failed to execute AI risk analysis';
    const statusCode = message.includes('rate limit') || message.includes('quota') ? 429 : 500;

    res.status(statusCode).json({
      success: false,
      error: message,
    });
  }
};
