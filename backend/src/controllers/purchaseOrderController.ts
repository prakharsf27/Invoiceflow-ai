import { Request, Response } from 'express';
import { PurchaseOrderModel } from '../models/PurchaseOrder.js';
import { InvoiceModel } from '../models/Invoice.js';
import { DocumentModel } from '../models/Document.js';
import { PaymentModel } from '../models/Payment.js';

const buildPOLookupQuery = (companyId: string, id: string) => {
  const cleanId = decodeURIComponent(id).trim();
  const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(cleanId);
  const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const conditions: any[] = [
    { id: cleanId },
    { poNumber: new RegExp(`^${escaped}$`, 'i') },
  ];

  if (isValidObjectId) {
    conditions.push({ _id: cleanId });
  }

  return { companyId, $or: conditions };
};

// GET /api/purchase-orders
export const getPurchaseOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const pos = await PurchaseOrderModel.find({ companyId }).sort({ createdAt: -1 });
    res.json({ success: true, data: pos });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// GET /api/purchase-orders/:id
export const getPOById = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const query = buildPOLookupQuery(companyId, id);
    const po = await PurchaseOrderModel.findOne(query as any);

    if (!po) {
      res.status(404).json({ success: false, message: `Purchase Order "${id}" not found.` });
      return;
    }

    res.json({ success: true, data: po });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// PATCH /api/purchase-orders/:id
export const updatePO = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const updates = req.body;
    const query = buildPOLookupQuery(companyId, id);

    const po = await PurchaseOrderModel.findOneAndUpdate(
      query as any,
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!po) {
      res.status(404).json({ success: false, message: `Purchase Order "${id}" not found.` });
      return;
    }

    res.json({ success: true, data: po });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// PATCH /api/purchase-orders/:id/accept-variance
export const acceptPOVariance = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const { invoiceId } = req.body;
    const query = buildPOLookupQuery(companyId, id);

    // 1. Update Purchase Order in MongoDB
    const po = await PurchaseOrderModel.findOneAndUpdate(
      query as any,
      {
        $set: {
          matchStatus: 'matched',
          status: 'matched',
          varianceAccepted: true,
          varianceAcceptedAt: new Date().toISOString(),
          varianceAcceptedBy: req.user?.userId || 'system',
        },
      },
      { returnDocument: 'after' }
    );

    if (!po) {
      res.status(404).json({ success: false, message: `Purchase Order "${id}" not found.` });
      return;
    }

    // 2. Find and update associated Invoice in MongoDB
    let updatedInvoice: any = null;
    const invQueryConditions: any[] = [];

    if (invoiceId) {
      const cleanInvId = decodeURIComponent(String(invoiceId)).trim();
      const isValidInvoiceObjectId = /^[0-9a-fA-F]{24}$/.test(cleanInvId);
      const escapedInv = cleanInvId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      invQueryConditions.push({ id: cleanInvId }, { invoiceNumber: new RegExp(`^${escapedInv}$`, 'i') });
      if (isValidInvoiceObjectId) {
        invQueryConditions.push({ _id: cleanInvId });
      }
    }
    if (po.invoiceId) {
      const cleanPoInvId = decodeURIComponent(String(po.invoiceId)).trim();
      const isValidPoInvObjectId = /^[0-9a-fA-F]{24}$/.test(cleanPoInvId);
      invQueryConditions.push({ id: cleanPoInvId });
      if (isValidPoInvObjectId) {
        invQueryConditions.push({ _id: cleanPoInvId });
      }
    }
    invQueryConditions.push({ poNumber: new RegExp(`^${po.poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });

    updatedInvoice = await InvoiceModel.findOneAndUpdate(
      {
        companyId,
        $or: invQueryConditions,
      } as any,
      {
        $set: {
          status: 'ready',
          aiStatus: 'Variance Accepted',
          paymentStatus: 'scheduled',
          riskLevel: 'low',
        },
      },
      { returnDocument: 'after' }
    );

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

    // 4. Synchronize payment record if linked invoice is found
    if (updatedInvoice) {
      try {
        await PaymentModel.findOneAndUpdate(
          {
            companyId,
            $or: [{ invoiceId: updatedInvoice.id }, { invoiceNumber: updatedInvoice.invoiceNumber }],
          } as any,
          {
            $set: {
              companyId,
              invoiceId: updatedInvoice.id,
              invoiceNumber: updatedInvoice.invoiceNumber,
              supplierName: updatedInvoice.supplierName,
              amount: updatedInvoice.amount,
              dueDate: updatedInvoice.dueDate || updatedInvoice.invoiceDate || new Date().toISOString().split('T')[0],
              status: 'scheduled',
              poNumber: po.poNumber,
            },
            $setOnInsert: {
              id: `pay-${updatedInvoice.id || Date.now()}`,
            },
          },
          { upsert: true, returnDocument: 'after' }
        );
      } catch (payErr) {
        console.warn('Payment record sync on accept variance warning:', payErr);
      }
    }

    console.log(`[PO-ACTION] Variance accepted for PO ${po.poNumber}, linked invoice: ${updatedInvoice?.invoiceNumber || 'N/A'}`);

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
    const query = buildPOLookupQuery(companyId, id);

    const po = await PurchaseOrderModel.findOneAndUpdate(
      query as any,
      {
        $set: {
          matchStatus: 'mismatch',
          status: 'mismatch',
          clarificationRequested: true,
          clarificationRequestedAt: new Date().toISOString(),
          clarificationReason: reason || 'Price/Quantity discrepancy clarification requested from vendor',
        },
      },
      { returnDocument: 'after' }
    );

    if (!po) {
      res.status(404).json({ success: false, message: `Purchase Order "${id}" not found.` });
      return;
    }

    let updatedInvoice: any = null;
    const invQueryConditions: any[] = [];
    if (invoiceId) {
      const cleanInvId = decodeURIComponent(String(invoiceId)).trim();
      const isValidInvoiceObjectId = /^[0-9a-fA-F]{24}$/.test(cleanInvId);
      const escapedInv = cleanInvId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      invQueryConditions.push({ id: cleanInvId }, { invoiceNumber: new RegExp(`^${escapedInv}$`, 'i') });
      if (isValidInvoiceObjectId) {
        invQueryConditions.push({ _id: cleanInvId });
      }
    }
    if (po.invoiceId) {
      const cleanPoInvId = decodeURIComponent(String(po.invoiceId)).trim();
      const isValidPoInvObjectId = /^[0-9a-fA-F]{24}$/.test(cleanPoInvId);
      invQueryConditions.push({ id: cleanPoInvId });
      if (isValidPoInvObjectId) {
        invQueryConditions.push({ _id: cleanPoInvId });
      }
    }
    invQueryConditions.push({ poNumber: new RegExp(`^${po.poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });

    updatedInvoice = await InvoiceModel.findOneAndUpdate(
      {
        companyId,
        $or: invQueryConditions,
      } as any,
      {
        $set: {
          status: 'hold',
          aiStatus: 'On Hold',
          paymentStatus: 'on_hold',
        },
      },
      { returnDocument: 'after' }
    );

    if (updatedInvoice) {
      try {
        await PaymentModel.updateMany(
          {
            companyId,
            $or: [{ invoiceId: updatedInvoice.id }, { invoiceNumber: updatedInvoice.invoiceNumber }],
          } as any,
          { $set: { status: 'on_hold' } }
        );
      } catch (payErr) {
        console.warn('Payment hold sync on request clarification warning:', payErr);
      }
    }

    console.log(`[PO-ACTION] Clarification requested for PO ${po.poNumber}, linked invoice: ${updatedInvoice?.invoiceNumber || 'N/A'}`);

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
