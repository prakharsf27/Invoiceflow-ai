import { Request, Response } from 'express';
import { PurchaseOrderModel, IPurchaseOrderDocument } from '../models/PurchaseOrder.js';
import { InvoiceModel, IInvoiceDocument } from '../models/Invoice.js';
import { DocumentModel } from '../models/Document.js';
import { PaymentModel } from '../models/Payment.js';

/**
 * Explicit helper to find a Purchase Order by ID, PO Number, or MongoDB ObjectId.
 */
export const findPurchaseOrder = async (
  companyId: string,
  idOrPoNumber: string
): Promise<IPurchaseOrderDocument | null> => {
  if (!idOrPoNumber || typeof idOrPoNumber !== 'string') return null;

  const cleanId = decodeURIComponent(idOrPoNumber).trim();
  const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(cleanId);
  const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const conditions: any[] = [
    { id: cleanId },
    { poNumber: new RegExp(`^${escaped}$`, 'i') },
  ];

  if (isValidObjectId) {
    conditions.push({ _id: cleanId });
  }

  return await PurchaseOrderModel.findOne({
    companyId,
    $or: conditions,
  } as any);
};

/**
 * Explicit helper to find an associated Invoice for a Purchase Order.
 */
export const findInvoiceForPO = async (
  companyId: string,
  po: IPurchaseOrderDocument,
  explicitInvoiceId?: string
): Promise<IInvoiceDocument | null> => {
  const conditions: any[] = [];

  if (explicitInvoiceId) {
    const cleanInvId = decodeURIComponent(String(explicitInvoiceId)).trim();
    const isValidInvoiceObjectId = /^[0-9a-fA-F]{24}$/.test(cleanInvId);
    const escapedInv = cleanInvId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    conditions.push({ id: cleanInvId }, { invoiceNumber: new RegExp(`^${escapedInv}$`, 'i') });
    if (isValidInvoiceObjectId) {
      conditions.push({ _id: cleanInvId });
    }
  }

  if (po.invoiceId) {
    const cleanPoInvId = decodeURIComponent(String(po.invoiceId)).trim();
    const isValidPoInvObjectId = /^[0-9a-fA-F]{24}$/.test(cleanPoInvId);
    conditions.push({ id: cleanPoInvId });
    if (isValidPoInvObjectId) {
      conditions.push({ _id: cleanPoInvId });
    }
  }

  if (po.poNumber) {
    const escapedPoNumber = po.poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    conditions.push({ poNumber: new RegExp(`^${escapedPoNumber}$`, 'i') });
  }

  if (conditions.length === 0) return null;

  return await InvoiceModel.findOne({
    companyId,
    $or: conditions,
  } as any);
};

// GET /api/purchase-orders
export const getPurchaseOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const pos = await PurchaseOrderModel.find({ companyId }).sort({ createdAt: -1 });
    res.json({ success: true, data: pos });
  } catch (error) {
    console.error('getPurchaseOrders error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// GET /api/purchase-orders/:id
export const getPOById = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const po = await findPurchaseOrder(companyId, id);

    if (!po) {
      res.status(404).json({ success: false, message: `Purchase Order "${id}" not found.` });
      return;
    }

    res.json({ success: true, data: po });
  } catch (error) {
    console.error('getPOById error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// PATCH /api/purchase-orders/:id
export const updatePO = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const updates = req.body;

    const po = await findPurchaseOrder(companyId, id);
    if (!po) {
      res.status(404).json({ success: false, message: `Purchase Order "${id}" not found.` });
      return;
    }

    Object.assign(po, updates);
    await po.save();

    res.json({ success: true, data: po });
  } catch (error) {
    console.error('updatePO error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// PATCH /api/purchase-orders/:id/accept-variance
export const acceptPOVariance = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const { invoiceId } = req.body;

    console.log(`[PO-ACTION] acceptPOVariance called for PO ID/Number: "${id}", invoiceId: "${invoiceId || 'none'}", company: "${companyId}"`);

    // 1. Look up Purchase Order in MongoDB
    const po = await findPurchaseOrder(companyId, id);

    if (!po) {
      console.warn(`[PO-ACTION] Purchase Order "${id}" not found for company "${companyId}"`);
      res.status(404).json({ success: false, message: `Purchase Order "${id}" not found.` });
      return;
    }

    // Update PO fields
    po.matchStatus = 'matched';
    po.status = 'matched';
    (po as any).varianceAccepted = true;
    (po as any).varianceAcceptedAt = new Date().toISOString();
    (po as any).varianceAcceptedBy = req.user?.userId || 'system';

    // 2. Find and update associated Invoice in MongoDB
    const linkedInvoice = await findInvoiceForPO(companyId, po, invoiceId);
    let updatedInvoice: IInvoiceDocument | null = null;

    if (linkedInvoice) {
      linkedInvoice.status = 'ready';
      linkedInvoice.aiStatus = 'Variance Accepted';
      linkedInvoice.paymentStatus = 'scheduled';
      linkedInvoice.riskLevel = 'low';
      linkedInvoice.aiChecks = (linkedInvoice.aiChecks || []).map((c) => ({
        ...c,
        passed: true,
        type: 'success',
      }));

      await linkedInvoice.save();
      updatedInvoice = linkedInvoice;

      // Ensure bidirectional linkage on PO
      po.invoiceId = linkedInvoice.id;

      // Synchronize Payment record
      try {
        await PaymentModel.findOneAndUpdate(
          {
            companyId,
            $or: [{ invoiceId: linkedInvoice.id }, { invoiceNumber: linkedInvoice.invoiceNumber }],
          } as any,
          {
            $set: {
              companyId,
              invoiceId: linkedInvoice.id,
              invoiceNumber: linkedInvoice.invoiceNumber,
              supplierName: linkedInvoice.supplierName,
              amount: linkedInvoice.amount,
              dueDate: linkedInvoice.dueDate || linkedInvoice.invoiceDate || new Date().toISOString().split('T')[0],
              status: 'scheduled',
              poNumber: po.poNumber,
            },
            $setOnInsert: {
              id: `pay-${linkedInvoice.id || Date.now()}`,
            },
          },
          { upsert: true, returnDocument: 'after' }
        );
      } catch (payErr) {
        console.warn('Payment record sync warning:', payErr);
      }
    }

    await po.save();

    // 3. Update Document model matchResult if present
    await DocumentModel.updateMany(
      {
        companyId,
        $or: [
          { 'extractedData.poNumber': new RegExp(`^${po.poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { linkedRecordId: po.id },
          ...(updatedInvoice ? [{ linkedRecordId: updatedInvoice.id }] : []),
        ],
      } as any,
      {
        $set: {
          'matchResult.matchStatus': 'matched',
          'matchResult.matchScore': 100,
        },
      }
    );

    console.log(`[PO-ACTION] ✅ Variance accepted for PO ${po.poNumber}. Linked invoice: ${updatedInvoice?.invoiceNumber || 'None'}`);

    res.json({
      success: true,
      message: `Variance accepted for PO ${po.poNumber}. Reconciled and queued for payment.`,
      data: {
        purchaseOrder: po,
        invoice: updatedInvoice,
      },
    });
  } catch (error) {
    console.error('acceptPOVariance error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// PATCH /api/purchase-orders/:id/request-clarification
export const requestPOClarification = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const { invoiceId, reason } = req.body;

    console.log(`[PO-ACTION] requestPOClarification called for PO ID/Number: "${id}", reason: "${reason || 'none'}", company: "${companyId}"`);

    const po = await findPurchaseOrder(companyId, id);

    if (!po) {
      console.warn(`[PO-ACTION] Purchase Order "${id}" not found for company "${companyId}"`);
      res.status(404).json({ success: false, message: `Purchase Order "${id}" not found.` });
      return;
    }

    po.matchStatus = 'mismatch';
    po.status = 'mismatch';
    (po as any).clarificationRequested = true;
    (po as any).clarificationRequestedAt = new Date().toISOString();
    (po as any).clarificationReason = reason || 'Price/Quantity discrepancy clarification requested from vendor';

    const linkedInvoice = await findInvoiceForPO(companyId, po, invoiceId);
    let updatedInvoice: IInvoiceDocument | null = null;

    if (linkedInvoice) {
      linkedInvoice.status = 'hold';
      linkedInvoice.aiStatus = 'On Hold';
      linkedInvoice.paymentStatus = 'on_hold';
      await linkedInvoice.save();
      updatedInvoice = linkedInvoice;

      po.invoiceId = linkedInvoice.id;

      try {
        await PaymentModel.updateMany(
          {
            companyId,
            $or: [{ invoiceId: linkedInvoice.id }, { invoiceNumber: linkedInvoice.invoiceNumber }],
          } as any,
          { $set: { status: 'on_hold' } }
        );
      } catch (payErr) {
        console.warn('Payment hold sync warning:', payErr);
      }
    }

    await po.save();

    console.log(`[PO-ACTION] ✅ Clarification requested for PO ${po.poNumber}. Linked invoice placed on hold: ${updatedInvoice?.invoiceNumber || 'None'}`);

    res.json({
      success: true,
      message: `Clarification requested for PO ${po.poNumber}. Invoice placed on hold pending vendor response.`,
      data: {
        purchaseOrder: po,
        invoice: updatedInvoice,
      },
    });
  } catch (error) {
    console.error('requestPOClarification error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};
