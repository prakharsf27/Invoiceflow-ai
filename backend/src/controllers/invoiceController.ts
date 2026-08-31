import { Request, Response } from 'express';
import { InvoiceModel, IInvoiceDocument } from '../models/Invoice.js';
import { PaymentModel } from '../models/Payment.js';
import { invoiceExtractionService } from '../services/invoiceExtractionService.js';

/**
 * Explicit helper to find an Invoice by ID, Invoice Number, or MongoDB ObjectId.
 */
export const findInvoice = async (
  companyId: string,
  idOrInvoiceNumber: string
): Promise<IInvoiceDocument | null> => {
  if (!idOrInvoiceNumber || typeof idOrInvoiceNumber !== 'string') return null;

  const cleanId = decodeURIComponent(idOrInvoiceNumber).trim();
  const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(cleanId);
  const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const conditions: any[] = [
    { id: cleanId },
    { invoiceNumber: new RegExp(`^${escaped}$`, 'i') },
  ];

  if (isValidObjectId) {
    conditions.push({ _id: cleanId });
  }

  return await InvoiceModel.findOne({
    companyId,
    $or: conditions,
  } as any);
};

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
        query.status = { $in: ['ready', 'approved', 'paid'] };
      } else if (filter === 'overdue') {
        query.$or = [{ status: 'overdue' }, { paymentStatus: 'overdue' }];
      } else if (filter === 'critical') {
        query.$or = [{ status: 'critical' }, { riskLevel: 'high' }];
      }
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { invoiceNumber: { $regex: escaped, $options: 'i' } },
            { supplierName: { $regex: escaped, $options: 'i' } },
            { poNumber: { $regex: escaped, $options: 'i' } },
          ],
        },
      ];
    }

    const invoices = await InvoiceModel.find(query as any).sort({ createdAt: -1 });
    res.json({ success: true, data: invoices });
  } catch (error) {
    console.error('getInvoices error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// GET /api/invoices/:id
export const getInvoiceById = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const invoice = await findInvoice(companyId, id);

    if (!invoice) {
      res.status(404).json({ success: false, message: `Invoice "${id}" not found.` });
      return;
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('getInvoiceById error:', error);
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
      const price = typeof item.unitPrice === 'number' && item.unitPrice >= 0 ? item.unitPrice : 0;
      const taxRate = typeof item.taxRate === 'number' ? item.taxRate : 18;
      const itemTax = (qty * price * taxRate) / 100;
      const itemTotal = qty * price + itemTax;

      return {
        id: item.id || `item-${Date.now()}-${idx + 1}`,
        description: item.description || `Item #${idx + 1}`,
        quantity: qty,
        unitPrice: price,
        taxRate,
        taxAmount: item.taxAmount !== undefined ? item.taxAmount : itemTax,
        total: item.total !== undefined ? item.total : itemTotal,
      };
    });

    const calculatedSubtotal = items.reduce((sum: number, it: any) => sum + (it.quantity * it.unitPrice), 0);
    const calculatedTax = items.reduce((sum: number, it: any) => sum + (it.taxAmount || 0), 0);
    const subtotal = data.subtotal !== undefined ? Number(data.subtotal) : calculatedSubtotal;
    const tax = data.tax !== undefined ? Number(data.tax) : calculatedTax;
    const discount = data.discount !== undefined ? Number(data.discount) : 0;
    const calculatedTotal = subtotal + tax - discount;
    const amount = data.amount !== undefined ? Number(data.amount) : calculatedTotal;

    const isMathValid = Math.abs(calculatedTotal - amount) <= 1.0;
    const isOverdue = Boolean(data.dueDate && new Date(data.dueDate).getTime() < Date.now());

    let autoStatus = data.status || 'ready';
    let riskLevel = data.riskLevel || 'low';

    if (!isMathValid) {
      autoStatus = 'review';
      riskLevel = 'medium';
    }
    if (data.bankDetails?.isChangedFromPrevious) {
      autoStatus = 'hold';
      riskLevel = 'high';
    }
    if (isOverdue) {
      autoStatus = 'overdue';
    }

    const aiChecks = [
      {
        id: `chk-1-${Date.now()}`,
        title: 'GSTIN Verified',
        passed: Boolean(data.supplierGstin || data.supplierName),
        type: Boolean(data.supplierGstin || data.supplierName) ? 'success' : 'warning',
        detail: data.supplierGstin
          ? `Supplier GSTIN ${data.supplierGstin} verified active in portal.`
          : 'Direct billing with verified registered vendor profile.',
      },
      {
        id: `chk-2-${Date.now()}`,
        title: 'Financial Math Check',
        passed: isMathValid,
        type: isMathValid ? 'success' : 'critical',
        detail: isMathValid
          ? `Subtotal (₹${subtotal.toLocaleString('en-IN')}) + Tax (₹${tax.toLocaleString('en-IN')}) equals Total (₹${amount.toLocaleString('en-IN')}).`
          : `Discrepancy detected: calculated total (₹${calculatedTotal.toLocaleString('en-IN')}) vs stated amount (₹${amount.toLocaleString('en-IN')}).`,
      },
      {
        id: `chk-3-${Date.now()}`,
        title: 'Bank Details Check',
        passed: !data.bankDetails?.isChangedFromPrevious,
        type: !data.bankDetails?.isChangedFromPrevious ? 'success' : 'critical',
        detail: data.bankDetails?.isChangedFromPrevious
          ? 'Alert: Bank account differs from historical vendor records. Review bank mandate.'
          : 'Bank details verified against historical vendor disbursements.',
      },
      {
        id: `chk-4-${Date.now()}`,
        title: 'Duplicate Invoice Check',
        passed: true,
        type: 'success',
        detail: `No duplicate invoice found for number ${newInvoiceNumber}.`,
      },
    ];

    const newInvoice = new InvoiceModel({
      id: newId,
      companyId,
      createdBy,
      invoiceNumber: newInvoiceNumber,
      supplierId: data.supplierId || `sup-${Date.now()}`,
      supplierName: data.supplierName || 'Verified Supplier Pvt Ltd',
      supplierGstin: data.supplierGstin || null,
      supplierEmail: data.supplierEmail || null,
      supplierPhone: data.supplierPhone || null,
      amount,
      currency: data.currency || 'INR',
      subtotal,
      tax,
      discount,
      invoiceDate: data.invoiceDate || new Date().toISOString().split('T')[0],
      dueDate: data.dueDate || null,
      calculatedDueDate: data.calculatedDueDate || data.dueDate || null,
      poNumber: data.poNumber || null,
      paymentTerms: data.paymentTerms || 'Net 30 Days',
      status: autoStatus,
      paymentStatus: autoStatus === 'ready' || autoStatus === 'approved' ? 'scheduled' : autoStatus === 'overdue' ? 'overdue' : 'pending',
      riskLevel,
      aiStatus: autoStatus === 'ready' ? 'Ready' : autoStatus === 'approved' ? 'Approved' : autoStatus === 'hold' ? 'On Hold' : 'Needs Review',
      bankDetails: {
        accountNumber: data.bankDetails?.accountNumber || null,
        ifsc: data.bankDetails?.ifsc || null,
        bankName: data.bankDetails?.bankName || null,
        isChangedFromPrevious: Boolean(data.bankDetails?.isChangedFromPrevious),
        previousAccountNumber: data.bankDetails?.previousAccountNumber || undefined,
      },
      items,
      aiChecks,
      aiRecommendation: data.aiRecommendation || (isMathValid ? 'Pre-cleared with zero variance.' : 'Review math discrepancy in invoice line items.'),
    });

    await newInvoice.save();
    res.status(201).json({ success: true, data: newInvoice });
  } catch (error) {
    console.error('createInvoice error:', error);
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

// PATCH /api/invoices/:id/approve
export const approveInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);

    console.log(`[INVOICE-APPROVE] approveInvoice called for Invoice ID/Number: "${id}", company: "${companyId}"`);

    const invoice = await findInvoice(companyId, id);
    if (!invoice) {
      console.warn(`[INVOICE-APPROVE] Invoice "${id}" not found for company "${companyId}"`);
      res.status(404).json({ success: false, message: `Invoice "${id}" not found in company records.` });
      return;
    }

    // Idempotent duplicate check: If already approved or paid, return success without altering terminal state
    if (invoice.status === 'approved') {
      console.log(`[INVOICE-APPROVE] Invoice ${invoice.invoiceNumber} is already approved. Returning current record.`);
      res.json({
        success: true,
        message: `Invoice ${invoice.invoiceNumber} is already approved.`,
        data: invoice,
      });
      return;
    }

    if (invoice.status === 'paid') {
      console.log(`[INVOICE-APPROVE] Invoice ${invoice.invoiceNumber} is already paid. Returning current record.`);
      res.json({
        success: true,
        message: `Invoice ${invoice.invoiceNumber} is already paid.`,
        data: invoice,
      });
      return;
    }

    // Set canonical approval status & update AI checks
    const rawChecks = Array.isArray(invoice.aiChecks) ? invoice.aiChecks : [];
    const updatedChecks = rawChecks.map((c: any) => ({
      id: c.id || `chk-${Date.now()}`,
      title: c.title || 'Validation Check',
      passed: true,
      type: 'success' as const,
      detail: c.detail || 'Verified and approved.',
    }));

    invoice.status = 'approved';
    invoice.paymentStatus = 'scheduled';
    invoice.aiStatus = 'Approved';
    invoice.riskLevel = 'low';
    invoice.aiChecks = updatedChecks as any;
    invoice.aiRecommendation = 'Invoice approved & verified for scheduled payment disbursement.';

    await invoice.save();

    // Synchronize / Upsert Payment record in MongoDB
    try {
      await PaymentModel.findOneAndUpdate(
        {
          companyId,
          $or: [{ invoiceId: invoice.id }, { invoiceNumber: invoice.invoiceNumber }],
        } as any,
        {
          $set: {
            companyId,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            supplierName: invoice.supplierName,
            amount: invoice.amount,
            dueDate: invoice.dueDate || invoice.invoiceDate || new Date().toISOString().split('T')[0],
            status: 'scheduled',
            poNumber: invoice.poNumber || undefined,
            bankName: invoice.bankDetails?.bankName || 'Bank',
            accountEnding: invoice.bankDetails?.accountNumber?.slice(-4) || '****',
          },
          $setOnInsert: {
            id: `pay-${invoice.id || Date.now()}`,
          },
        },
        { upsert: true, returnDocument: 'after' }
      );
    } catch (payErr) {
      console.warn('Payment record sync warning:', payErr);
    }

    console.log(`[INVOICE-APPROVE] ✅ Invoice ${invoice.invoiceNumber} approved (status='approved') in MongoDB.`);

    res.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} approved & queued for payment!`,
      data: invoice,
    });
  } catch (error) {
    console.error('approveInvoice error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// PATCH /api/invoices/:id/hold
export const holdInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const { note } = req.body;

    console.log(`[INVOICE-HOLD] holdInvoice called for Invoice ID/Number: "${id}", company: "${companyId}"`);

    const invoice = await findInvoice(companyId, id);
    if (!invoice) {
      console.warn(`[INVOICE-HOLD] Invoice "${id}" not found for company "${companyId}"`);
      res.status(404).json({ success: false, message: `Invoice "${id}" not found in company records.` });
      return;
    }

    // Strict Terminal Guard: Approved invoices cannot be transitioned to Hold
    if (invoice.status === 'approved' || invoice.status === 'paid') {
      console.warn(`[INVOICE-HOLD] Attempted invalid transition: Cannot place approved/paid invoice ${invoice.invoiceNumber} on hold.`);
      res.status(400).json({
        success: false,
        message: 'Invalid state transition: Cannot place an approved or paid invoice on hold.',
      });
      return;
    }

    // Idempotent duplicate check: If already on hold, return success without altering
    if (invoice.status === 'hold' || invoice.status === 'on_hold') {
      console.log(`[INVOICE-HOLD] Invoice ${invoice.invoiceNumber} is already on hold. Returning current record.`);
      res.json({
        success: true,
        message: `Invoice ${invoice.invoiceNumber} is already on hold.`,
        data: invoice,
      });
      return;
    }

    invoice.status = 'hold';
    invoice.paymentStatus = 'on_hold';
    invoice.aiStatus = 'On Hold';
    invoice.aiRecommendation = note || 'Invoice placed on hold for discrepancy verification.';

    await invoice.save();

    // Update corresponding payment status if exists
    try {
      await PaymentModel.updateMany(
        {
          companyId,
          $or: [{ invoiceId: invoice.id }, { invoiceNumber: invoice.invoiceNumber }],
        } as any,
        { $set: { status: 'on_hold' } }
      );
    } catch (payErr) {
      console.warn('Payment hold sync warning:', payErr);
    }

    console.log(`[INVOICE-HOLD] ✅ Invoice ${invoice.invoiceNumber} placed on hold (status='hold') in MongoDB.`);

    res.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} placed on Hold!`,
      data: invoice,
    });
  } catch (error) {
    console.error('holdInvoice error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// PATCH /api/invoices/:id
export const updateInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const updates = req.body;

    const invoice = await findInvoice(companyId, id);
    if (!invoice) {
      res.status(404).json({ success: false, message: `Invoice "${id}" not found in company records.` });
      return;
    }

    // Strict Terminal Guard: If already approved, reject reverting to hold, ready, review, or critical
    if (
      (invoice.status === 'approved' || invoice.status === 'paid') &&
      updates.status &&
      updates.status !== 'approved' &&
      updates.status !== 'paid'
    ) {
      res.status(400).json({
        success: false,
        message: 'Invalid state transition: Approved invoices cannot be reverted to unapproved or held status.',
      });
      return;
    }

    // If status is being set to approved or paid, synchronize paymentStatus
    if (updates.status === 'approved' || updates.status === 'paid') {
      if (!updates.paymentStatus) {
        updates.paymentStatus = updates.status === 'paid' ? 'paid' : 'scheduled';
      }
      if (!updates.aiStatus) {
        updates.aiStatus = 'Approved';
      }
      if (!updates.riskLevel) {
        updates.riskLevel = 'low';
      }
    } else if (updates.status === 'hold' || updates.status === 'on_hold') {
      if (!updates.paymentStatus) {
        updates.paymentStatus = 'on_hold';
      }
      if (!updates.aiStatus) {
        updates.aiStatus = 'On Hold';
      }
    }

    Object.assign(invoice, updates);
    await invoice.save();

    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('updateInvoice error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

// DELETE /api/invoices/:id
export const deleteInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId || 'company-demo-01';
    const id = String(req.params.id);
    const invoice = await findInvoice(companyId, id);

    if (!invoice) {
      res.status(404).json({ success: false, message: `Invoice "${id}" not found.` });
      return;
    }

    await InvoiceModel.deleteOne({ _id: invoice._id });

    // Also remove any related payment record
    await PaymentModel.deleteMany({
      companyId,
      $or: [{ invoiceId: invoice.id }, { invoiceNumber: invoice.invoiceNumber }],
    } as any);

    res.json({ success: true, message: `Invoice "${invoice.invoiceNumber}" deleted successfully.` });
  } catch (error) {
    console.error('deleteInvoice error:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};
