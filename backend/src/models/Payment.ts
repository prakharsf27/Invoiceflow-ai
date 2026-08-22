import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentDocument extends Document {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  amount: number;
  dueDate: string;
  status: string;
  paidDate?: string;
  paymentMethod?: string;
  scheduledDate?: string;
  bankName?: string;
  accountEnding?: string;
  poNumber?: string;
  companyId: string;
}

const PaymentSchema = new Schema<IPaymentDocument>(
  {
    id: { type: String, required: true, unique: true },
    companyId: { type: String, required: true, default: 'company-demo-01', index: true },
    invoiceId: { type: String, required: true, index: true },
    invoiceNumber: { type: String, required: true },
    supplierName: { type: String, required: true },
    amount: { type: Number, required: true },
    dueDate: { type: String, required: true },
    status: { type: String, required: true, index: true },
    paidDate: { type: String },
    paymentMethod: { type: String },
    scheduledDate: { type: String },
    bankName: { type: String },
    accountEnding: { type: String },
    poNumber: { type: String },
  },
  { timestamps: true, strict: false }
);

export const PaymentModel = mongoose.model<IPaymentDocument>('Payment', PaymentSchema, 'payments');
