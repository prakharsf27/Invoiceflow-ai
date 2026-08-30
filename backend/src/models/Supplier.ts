import mongoose, { Schema, Document } from 'mongoose';

export interface IBankAccount {
  accountNumber: string;
  bankName: string;
  ifsc: string;
  isPrimary: boolean;
  addedDate: string;
}

export interface ISupplierDocument extends Document {
  id: string;
  companyId: string;
  name: string;
  gstin: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  paymentTerms?: string;
  notes?: string;
  category?: string;
  totalSpend: number;
  outstandingAmount: number;
  invoiceCount: number;
  riskLevel: 'low' | 'medium' | 'high';
  lastInvoiceDate: string;
  status: 'active' | 'under_review' | 'blocked';
  bankAccounts: IBankAccount[];
  recentAlerts?: string[];
  bankStatus?: 'verified' | 'changed';
  totalPayable?: number;
  riskStatus?: 'low' | 'medium' | 'high';
  createdAt?: Date;
  updatedAt?: Date;
}

const SupplierSchema = new Schema<ISupplierDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    companyId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    gstin: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    pincode: { type: String, default: '', trim: true },
    paymentTerms: { type: String, default: 'Net 30', trim: true },
    notes: { type: String, default: '', trim: true },
    category: { type: String, default: 'General', trim: true },
    totalSpend: { type: Number, default: 0 },
    outstandingAmount: { type: Number, default: 0 },
    invoiceCount: { type: Number, default: 0 },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low',
    },
    lastInvoiceDate: { type: String, default: 'N/A' },
    status: {
      type: String,
      enum: ['active', 'under_review', 'blocked'],
      default: 'active',
    },
    bankAccounts: [
      {
        accountNumber: { type: String, default: '' },
        bankName: { type: String, default: '' },
        ifsc: { type: String, default: '' },
        isPrimary: { type: Boolean, default: true },
        addedDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
      },
    ],
    recentAlerts: [{ type: String }],
    bankStatus: { type: String, enum: ['verified', 'changed'], default: 'verified' },
    totalPayable: { type: Number, default: 0 },
    riskStatus: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
  },
  { timestamps: true, strict: false }
);

// Compound index for fast tenant-isolated duplicate checks
SupplierSchema.index({ companyId: 1, name: 1 });
SupplierSchema.index({ companyId: 1, gstin: 1 });

export const SupplierModel = mongoose.model<ISupplierDocument>('Supplier', SupplierSchema, 'suppliers');
