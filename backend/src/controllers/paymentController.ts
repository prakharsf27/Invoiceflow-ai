import { Request, Response } from 'express';
import { PaymentModel } from '../models/Payment.js';

// GET /api/payments
export const getPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const payments = await PaymentModel.find({ companyId }).sort({ createdAt: -1 });
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// PATCH /api/payments/:id
export const updatePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const updates = req.body;

    const payment = await PaymentModel.findOneAndUpdate(
      {
        companyId,
        $or: [{ id }, { invoiceId: id }],
      } as any,
      { $set: updates },
      { new: true }
    );

    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment record not found' });
      return;
    }

    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};
