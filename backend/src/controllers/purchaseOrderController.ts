import { Request, Response } from 'express';
import { PurchaseOrderModel } from '../models/PurchaseOrder.js';

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
    const po = await PurchaseOrderModel.findOne({
      companyId,
      $or: [{ id }, { poNumber: new RegExp(`^${id}$`, 'i') }],
    } as any);

    if (!po) {
      res.status(404).json({ success: false, message: 'Purchase Order not found' });
      return;
    }

    res.json({ success: true, data: po });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};
