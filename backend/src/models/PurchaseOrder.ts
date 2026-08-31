import mongoose, { Schema, Document } from 'mongoose';

export interface IPOItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface IPurchaseOrderDocument extends Document {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierGstin?: string;
  totalAmount: number;
  issuedDate: string;
  status: string;
  invoiceId?: string;
  matchStatus?: string;
  items: IPOItem[];
  companyId: string;
}

const PurchaseOrderSchema = new Schema<IPurchaseOrderDocument>(
  {
    id: { type: String, required: true, unique: true },
    companyId: { type: String, required: true, default: 'company-demo-01', index: true },
    poNumber: { type: String, required: true, index: true },
    supplierId: { type: String, required: true },
    supplierName: { type: String, required: true },
    supplierGstin: { type: String },
    totalAmount: { type: Number, required: true },
    issuedDate: { type: String, required: true },
    status: { type: String, required: true },
    invoiceId: { type: String },
    matchStatus: { type: String },
    items: [
      {
        id: { type: String, required: true },
        description: { type: String, required: true },
        quantity: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        total: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true, strict: false }
);

export const PurchaseOrderModel = mongoose.model<IPurchaseOrderDocument>('PurchaseOrder', PurchaseOrderSchema, 'purchase_orders');
