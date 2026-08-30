import { Request, Response } from 'express';
import { SupplierModel } from '../models/Supplier.js';

const escapeRegExp = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * GET /api/suppliers
 * List all suppliers for the authenticated user's organization.
 */
export const getSuppliers = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const suppliers = await SupplierModel.find({ companyId }).sort({ createdAt: -1 });
    res.json({ success: true, data: suppliers });
  } catch (error: any) {
    console.error('❌ Error fetching suppliers:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch suppliers' });
  }
};

/**
 * GET /api/suppliers/:id
 * Retrieve a specific supplier by ID scoped strictly to authenticated companyId.
 */
export const getSupplierById = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const id = String(req.params.id);
    const supplier = await SupplierModel.findOne({
      companyId,
      $or: [{ id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!supplier) {
      res.status(404).json({ success: false, error: 'Supplier not found or access denied.' });
      return;
    }

    res.json({ success: true, data: supplier });
  } catch (error: any) {
    console.error(`❌ Error fetching supplier ${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to retrieve supplier' });
  }
};

/**
 * POST /api/suppliers
 * Create a new supplier manually for the authenticated organization.
 */
export const createSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const {
      name,
      gstin,
      email,
      phone,
      address,
      paymentTerms,
      notes,
      category,
      bankAccount,
      bankAccounts,
      status,
      riskLevel,
    } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'Supplier name is required.',
      });
      return;
    }

    const cleanName = name.trim();
    const cleanGstin = typeof gstin === 'string' ? gstin.trim().toUpperCase() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({
        success: false,
        error: 'Please enter a valid email address.',
      });
      return;
    }

    // Duplicate check within tenant
    const duplicateConditions: any[] = [
      { name: new RegExp(`^${escapeRegExp(cleanName)}$`, 'i') },
    ];
    if (cleanGstin) {
      duplicateConditions.push({ gstin: new RegExp(`^${escapeRegExp(cleanGstin)}$`, 'i') });
    }

    const existingSupplier = await SupplierModel.findOne({
      companyId,
      $or: duplicateConditions,
    });

    if (existingSupplier) {
      const matchReason = existingSupplier.name.toLowerCase() === cleanName.toLowerCase()
        ? `Supplier with name "${cleanName}"`
        : `Supplier with GSTIN "${cleanGstin}"`;
      res.status(409).json({
        success: false,
        error: `${matchReason} already exists in your organization workspace.`,
      });
      return;
    }

    // Format Bank Accounts array
    let parsedBankAccounts: any[] = [];
    if (Array.isArray(bankAccounts) && bankAccounts.length > 0) {
      parsedBankAccounts = bankAccounts.map((b: any, idx: number) => ({
        accountNumber: String(b.accountNumber || '').trim(),
        bankName: String(b.bankName || '').trim(),
        ifsc: String(b.ifsc || '').trim().toUpperCase(),
        isPrimary: idx === 0,
        addedDate: b.addedDate || new Date().toISOString().split('T')[0],
      }));
    } else if (bankAccount && (bankAccount.accountNumber || bankAccount.bankName)) {
      parsedBankAccounts = [
        {
          accountNumber: String(bankAccount.accountNumber || '').trim(),
          bankName: String(bankAccount.bankName || 'Bank').trim(),
          ifsc: String(bankAccount.ifsc || '').trim().toUpperCase(),
          isPrimary: true,
          addedDate: new Date().toISOString().split('T')[0],
        },
      ];
    }

    const supplierId = `sup-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

    const newSupplier = await SupplierModel.create({
      id: supplierId,
      companyId,
      name: cleanName,
      gstin: cleanGstin,
      email: cleanEmail,
      phone: cleanPhone,
      address: typeof address === 'string' ? address.trim() : '',
      paymentTerms: typeof paymentTerms === 'string' && paymentTerms.trim() ? paymentTerms.trim() : 'Net 30',
      notes: typeof notes === 'string' ? notes.trim() : '',
      category: typeof category === 'string' && category.trim() ? category.trim() : 'General',
      totalSpend: 0,
      outstandingAmount: 0,
      invoiceCount: 0,
      riskLevel: ['low', 'medium', 'high'].includes(riskLevel) ? riskLevel : 'low',
      lastInvoiceDate: 'N/A',
      status: ['active', 'under_review', 'blocked'].includes(status) ? status : 'active',
      bankAccounts: parsedBankAccounts,
      bankStatus: 'verified',
      totalPayable: 0,
      riskStatus: ['low', 'medium', 'high'].includes(riskLevel) ? riskLevel : 'low',
    });

    console.log(`✅ [Supplier] Created supplier "${cleanName}" (${newSupplier.id}) for company ${companyId}`);

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully.',
      data: newSupplier,
    });
  } catch (error: any) {
    console.error('❌ Error creating supplier:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to create supplier.',
    });
  }
};

/**
 * PUT /api/suppliers/:id
 * Update an existing supplier scoped strictly to companyId.
 */
export const updateSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const id = String(req.params.id);
    const existingSupplier = await SupplierModel.findOne({
      companyId,
      $or: [{ id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!existingSupplier) {
      res.status(404).json({ success: false, error: 'Supplier not found or access denied.' });
      return;
    }

    const {
      name,
      gstin,
      email,
      phone,
      address,
      paymentTerms,
      notes,
      category,
      bankAccount,
      bankAccounts,
      status,
      riskLevel,
    } = req.body;

    const updates: any = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ success: false, error: 'Supplier name cannot be empty.' });
        return;
      }
      const cleanName = name.trim();
      // Check collision with another supplier in the same company
      const collision = await SupplierModel.findOne({
        companyId,
        id: { $ne: existingSupplier.id },
        name: new RegExp(`^${escapeRegExp(cleanName)}$`, 'i'),
      });
      if (collision) {
        res.status(409).json({ success: false, error: `Another supplier named "${cleanName}" already exists.` });
        return;
      }
      updates.name = cleanName;
    }

    if (gstin !== undefined) {
      const cleanGstin = String(gstin).trim().toUpperCase();
      if (cleanGstin) {
        const collision = await SupplierModel.findOne({
          companyId,
          id: { $ne: existingSupplier.id },
          gstin: new RegExp(`^${escapeRegExp(cleanGstin)}$`, 'i'),
        });
        if (collision) {
          res.status(409).json({ success: false, error: `Another supplier with GSTIN "${cleanGstin}" already exists.` });
          return;
        }
      }
      updates.gstin = cleanGstin;
    }

    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
        return;
      }
      updates.email = cleanEmail;
    }

    if (phone !== undefined) updates.phone = String(phone).trim();
    if (address !== undefined) updates.address = String(address).trim();
    if (paymentTerms !== undefined) updates.paymentTerms = String(paymentTerms).trim();
    if (notes !== undefined) updates.notes = String(notes).trim();
    if (category !== undefined) updates.category = String(category).trim();

    if (status && ['active', 'under_review', 'blocked'].includes(status)) {
      updates.status = status;
    }

    if (riskLevel && ['low', 'medium', 'high'].includes(riskLevel)) {
      updates.riskLevel = riskLevel;
      updates.riskStatus = riskLevel;
    }

    if (Array.isArray(bankAccounts)) {
      updates.bankAccounts = bankAccounts.map((b: any, idx: number) => ({
        accountNumber: String(b.accountNumber || '').trim(),
        bankName: String(b.bankName || '').trim(),
        ifsc: String(b.ifsc || '').trim().toUpperCase(),
        isPrimary: idx === 0,
        addedDate: b.addedDate || new Date().toISOString().split('T')[0],
      }));
    } else if (bankAccount) {
      updates.bankAccounts = [
        {
          accountNumber: String(bankAccount.accountNumber || '').trim(),
          bankName: String(bankAccount.bankName || 'Bank').trim(),
          ifsc: String(bankAccount.ifsc || '').trim().toUpperCase(),
          isPrimary: true,
          addedDate: new Date().toISOString().split('T')[0],
        },
      ];
    }

    const updatedSupplier = await SupplierModel.findOneAndUpdate(
      { id: existingSupplier.id, companyId },
      { $set: updates },
      { returnDocument: 'after' }
    );

    res.json({
      success: true,
      message: 'Supplier updated successfully.',
      data: updatedSupplier,
    });
  } catch (error: any) {
    console.error(`❌ Error updating supplier ${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to update supplier.' });
  }
};

/**
 * DELETE /api/suppliers/:id
 * Delete a supplier record scoped strictly to companyId.
 */
export const deleteSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const id = String(req.params.id);
    const supplier = await SupplierModel.findOneAndDelete({
      companyId,
      $or: [{ id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!supplier) {
      res.status(404).json({ success: false, error: 'Supplier not found or access denied.' });
      return;
    }

    console.log(`🗑️ [Supplier] Deleted supplier "${supplier.name}" (${supplier.id}) from company ${companyId}`);

    res.json({
      success: true,
      message: 'Supplier deleted successfully.',
      data: { id: supplier.id, name: supplier.name },
    });
  } catch (error: any) {
    console.error(`❌ Error deleting supplier ${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to delete supplier.' });
  }
};
