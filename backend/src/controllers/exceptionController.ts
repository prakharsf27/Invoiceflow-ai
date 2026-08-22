import { Request, Response } from 'express';
import { ExceptionModel } from '../models/Exception.js';

// GET /api/exceptions
export const getExceptions = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const exceptions = await ExceptionModel.find({ companyId }).sort({ createdAt: -1 });
    res.json({ success: true, data: exceptions });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// PATCH /api/exceptions/:id
export const updateException = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const updates = req.body;

    const exception = await ExceptionModel.findOneAndUpdate(
      {
        companyId,
        $or: [{ id }, { invoiceId: id }],
      } as any,
      { $set: updates },
      { new: true }
    );

    if (!exception) {
      res.status(404).json({ success: false, message: 'Exception record not found' });
      return;
    }

    res.json({ success: true, data: exception });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};
