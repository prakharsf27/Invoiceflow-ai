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
  name: string;
  gstin: string;
  email: string;
  phone: string;
  totalSpend: number;
  outstandingAmount: number;
  invoiceCount: number;
  riskLevel: string;
  lastInvoiceDate: string;
  status: string;
  bankAccounts: IBankAccount[];
  recentAlerts?: string[];
  bankStatus?: string;
  totalPayable?: number;
  riskStatus?: string;
  companyId: string;
}

const SupplierSchema = new Schema<ISupplierDocument>(
  {
    id: { type: String, required: true, unique: true },
    companyId: { type: String, required: true, default: 'company-demo-01', index: true },
    name: { type: String, required: true, index: true },
    gstin: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    totalSpend: { type: Number, required: true },
    outstandingAmount: { type: Number, required: true },
    invoiceCount: { type: Number, required: true },
    riskLevel: { type: String, required: true },
    lastInvoiceDate: { type: String, required: true },
    status: { type: String, required: true },
    bankAccounts: [
      {
        accountNumber: { type: String, required: true },
        bankName: { type: String, required: true },
        ifsc: { type: String, required: true },
        isPrimary: { type: Boolean, required: true },
        addedDate: { type: String, required: true },
      },
    ],
    recentAlerts: [{ type: String }],
    bankStatus: { type: String },
    totalPayable: { type: Number },
    riskStatus: { type: String },
  },
  { timestamps: true, strict: false }
);

export const SupplierModel = mongoose.model<ISupplierDocument>('Supplier', SupplierSchema, 'suppliers');
