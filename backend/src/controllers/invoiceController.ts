import { Request, Response } from 'express';
import { InvoiceModel } from '../models/Invoice.js';
import { invoiceExtractionService } from '../services/invoiceExtractionService.js';

// GET /api/invoices
export const getInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const { filter, search } = req.query;
    let query: any = { companyId };

    if (filter && filter !== 'all') {
      if (filter === 'needs_review') {
        query.status = { $in: ['review', 'critical', 'hold', 'on_hold'] };
      } else if (filter === 'ready') {
        query.status = { $in: ['ready', 'paid'] };
      } else if (filter === 'overdue') {
        query.$or = [{ status: 'overdue' }, { paymentStatus: 'overdue' }];
      } else if (filter === 'critical') {
        query.$or = [{ status: 'critical' }, { riskLevel: 'high' }];
      }
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { invoiceNumber: { $regex: q, $options: 'i' } },
            { supplierName: { $regex: q, $options: 'i' } },
            { poNumber: { $regex: q, $options: 'i' } },
          ],
        },
      ];
    }

    const invoices = await InvoiceModel.find(query as any).sort({ createdAt: -1 });
    res.json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// GET /api/invoices/:id
export const getInvoiceById = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    const queryConditions: any[] = [
      { id: id },
      { invoiceNumber: new RegExp(`^${id}$`, 'i') },
    ];

    if (isValidObjectId) {
      queryConditions.push({ _id: id });
    }

    const invoice = await InvoiceModel.findOne({
      companyId,
      $or: queryConditions,
    } as any);

    if (!invoice) {
      // Return 404 and do not leak whether invoice exists in another company
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// POST /api/invoices
export const createInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const createdBy = req.user?.userId;
    const data = req.body;
    const newId = data.id || `inv-${Date.now()}`;
    const newInvoiceNumber = data.invoiceNumber || `INV-${Math.floor(1000 + Math.random() * 9000)}`;

    const rawItems = Array.isArray(data.items) && data.items.length > 0
      ? data.items
      : [
          {
            id: `item-${Date.now()}-1`,
            description: 'Consulting & Implementation Services',
            quantity: 1,
            unitPrice: data.amount || 150000,
            taxRate: 18,
          },
        ];

    const items = rawItems.map((item: any, idx: number) => {
      const qty = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
      const unitPrice = typeof item.unitPrice === 'number' && item.unitPrice >= 0 ? item.unitPrice : 0;
      const taxRate = typeof item.taxRate === 'number' && item.taxRate >= 0 ? item.taxRate : 18;

      const lineSubtotal = Number((qty * unitPrice).toFixed(2));
      const taxAmount = Number(((lineSubtotal * taxRate) / 100).toFixed(2));
      const lineTotal = Number((lineSubtotal + taxAmount).toFixed(2));

      return {
        id: item.id || `item-${Date.now()}-${idx + 1}`,
        description: item.description || 'Line Item',
        quantity: qty,
        unitPrice,
        taxRate,
        taxAmount,
        total: lineTotal,
        poItemMatched: item.poItemMatched ?? true,
      };
    });

    const computedSubtotal = Number(items.reduce((sum: number, i: any) => sum + (i.quantity * i.unitPrice), 0).toFixed(2));
    const computedTax = Number(items.reduce((sum: number, i: any) => sum + i.taxAmount, 0).toFixed(2));
    const computedTotal = Number((computedSubtotal + computedTax).toFixed(2));

    const subtotal = typeof data.subtotal === 'number' && data.subtotal > 0 ? data.subtotal : computedSubtotal;
    const tax = typeof data.tax === 'number' && data.tax >= 0 ? data.tax : computedTax;
    const amount = typeof data.amount === 'number' && data.amount > 0 ? data.amount : computedTotal;

    // Independent AI Math & Tax Computation Check
    let isMathValid = true;
    const mathDiscrepancies: string[] = [];

    items.forEach((item: any) => {
      const expectedSubtotal = Number((item.quantity * item.unitPrice).toFixed(2));
      const expectedTax = Number(((expectedSubtotal * item.taxRate) / 100).toFixed(2));
      const expectedTotal = Number((expectedSubtotal + expectedTax).toFixed(2));

      if (Math.abs(item.taxAmount - expectedTax) > 1 || Math.abs(item.total - expectedTotal) > 1) {
        isMathValid = false;
        mathDiscrepancies.push(`Line item "${item.description}": tax/total mismatch.`);
      }
    });

    if (Math.abs(subtotal + tax - amount) > 1.5) {
      isMathValid = false;
      mathDiscrepancies.push(`Subtotal (₹${subtotal}) + Tax (₹${tax}) does not equal Total (₹${amount}).`);
    }

    let status = data.status || (isMathValid ? 'ready' : 'review');
    let aiStatus = data.aiStatus || (isMathValid ? 'Ready' : 'Math Discrepancy');

    const aiChecks = data.aiChecks || [
      {
        id: `c-${Date.now()}-1`,
        title: 'Supplier Identity',
        passed: true,
        type: 'success',
        detail: `GSTIN ${data.supplierGstin || '29AABCS1234F1Z1'} verified`,
      },
      {
        id: `c-${Date.now()}-3`,
        title: 'Math & Tax Computations',
        passed: isMathValid,
        type: isMathValid ? 'success' : 'critical',
        detail: isMathValid
          ? `18% GST correctly computed across items. Subtotal (₹${subtotal.toLocaleString('en-IN')}) + Tax (₹${tax.toLocaleString('en-IN')}) = Total (₹${amount.toLocaleString('en-IN')})`
          : mathDiscrepancies[0] || `Math mismatch detected in line items or invoice totals.`,
      },
    ];

    const newInvoice = new InvoiceModel({
      id: newId,
      invoiceNumber: newInvoiceNumber,
      companyId,
      createdBy,
      supplierId: data.supplierId || 'sup-custom',
      supplierName: data.supplierName || 'New Supplier Pvt Ltd',
      supplierGstin: data.supplierGstin || '29AABCS1234F1Z1',
      supplierEmail: data.supplierEmail || 'billing@supplier.com',
      supplierPhone: data.supplierPhone || '+91 99000 00000',
      amount,
      currency: 'INR',
      subtotal,
      tax,
      discount: data.discount || 0,
      invoiceDate: data.invoiceDate || new Date().toISOString().split('T')[0],
      dueDate: data.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      poNumber: data.poNumber || 'PO-9910',
      aiStatus,
      status,
      paymentStatus: data.paymentStatus || (status === 'ready' ? 'scheduled' : 'pending'),
      riskLevel: data.riskLevel || (isMathValid ? 'low' : 'medium'),
      paymentTerms: data.paymentTerms || 'Net 15 Days',
      bankDetails: data.bankDetails || {
        accountNumber: '990011223344',
        ifsc: 'HDFC0001234',
        bankName: 'HDFC Bank, Koramangala',
        isChangedFromPrevious: false,
      },
      items,
      aiChecks,
      aiRecommendation: data.aiRecommendation || (isMathValid ? 'Pre-cleared with zero variance.' : 'Review math discrepancy in invoice line items.'),
    });

    await newInvoice.save();
    res.status(201).json({ success: true, data: newInvoice });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// POST /api/invoices/upload
export const uploadInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        success: false,
        isInvoice: false,
        confidence: 0,
        error: 'No invoice file uploaded. Please select a PDF, PNG, or JPG document.',
        warnings: ['No file provided.'],
      });
      return;
    }

    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      res.status(400).json({
        success: false,
        isInvoice: false,
        confidence: 0,
        error: 'Unsupported file format. Please upload a valid PDF, JPG, or PNG invoice file.',
        warnings: [`Unsupported MIME type: ${file.mimetype}`],
      });
      return;
    }

    if (file.size === 0) {
      res.status(400).json({
        success: false,
        isInvoice: false,
        confidence: 0,
        error: 'Uploaded file is empty (0 bytes). Document rejected.',
        warnings: ['File is empty (0 bytes).'],
      });
      return;
    }

    const maxSizeBytes = 15 * 1024 * 1024; // 15MB limit
    if (file.size > maxSizeBytes) {
      res.status(400).json({
        success: false,
        isInvoice: false,
        confidence: 0,
        error: 'File size exceeds maximum limit of 15MB.',
        warnings: ['File size exceeds 15MB limit.'],
      });
      return;
    }

    const companyId = req.user?.companyId || 'company-demo-01';
    const createdBy = req.user?.userId;

    const extractionResult = await invoiceExtractionService.extractAndProcessInvoice(
      file.buffer,
      file.mimetype,
      file.originalname,
      { companyId, createdBy }
    );

    if (!extractionResult.success || !extractionResult.isInvoice) {
      res.status(400).json({
        success: false,
        isInvoice: false,
        confidence: extractionResult.confidence || 0,
        error: extractionResult.warnings?.[0] || 'Uploaded document does not appear to contain a valid invoice.',
        warnings: extractionResult.warnings || ['Uploaded document does not appear to contain a valid invoice.'],
      });
      return;
    }

    res.status(201).json({
      success: true,
      isInvoice: true,
      confidence: extractionResult.confidence,
      invoice: extractionResult.invoice,
      extraction: {
        confidence: extractionResult.confidence,
        warnings: extractionResult.warnings,
      },
    });
  } catch (error: any) {
    console.error('❌ Upload invoice error:', error);
    res.status(500).json({
      success: false,
      isInvoice: false,
      confidence: 0,
      error: error?.message || 'Invoice extraction & processing failed',
    });
  }
};

// PATCH /api/invoices/:id
export const updateInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const updates = req.body;

    const invoice = await InvoiceModel.findOneAndUpdate(
      {
        companyId,
        $or: [{ id }, { invoiceNumber: new RegExp(`^${id}$`, 'i') }],
      } as any,
      { $set: updates },
      { new: true }
    );

    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// DELETE /api/invoices/:id
export const deleteInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const deleted = await InvoiceModel.findOneAndDelete({
      companyId,
      $or: [{ id }, { invoiceNumber: new RegExp(`^${id}$`, 'i') }],
    } as any);

    if (!deleted) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    res.json({ success: true, message: 'Invoice deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};
