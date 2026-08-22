import { Request, Response } from 'express';
import { SupplierModel } from '../models/Supplier.js';

// GET /api/suppliers
export const getSuppliers = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const suppliers = await SupplierModel.find({ companyId }).sort({ createdAt: -1 });
    res.json({ success: true, data: suppliers });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// GET /api/suppliers/:id
export const getSupplierById = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const supplier = await SupplierModel.findOne({
      companyId,
      $or: [{ id: id }, { name: new RegExp(id, 'i') }],
    } as any);

    if (!supplier) {
      res.status(404).json({ success: false, message: 'Supplier not found' });
      return;
    }

    res.json({ success: true, data: supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};
