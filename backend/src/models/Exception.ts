import mongoose, { Schema, Document } from 'mongoose';

export interface IExceptionDocument extends Document {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  amount: number;
  issueType: string;
  severity: string;
  title: string;
  description: string;
  varianceAmount?: number;
  aiRecommendation: string;
  createdAtStr: string;
  status: string;
  companyId: string;
}

const ExceptionSchema = new Schema<IExceptionDocument>(
  {
    id: { type: String, required: true, unique: true },
    companyId: { type: String, required: true, default: 'company-demo-01', index: true },
    invoiceId: { type: String, required: true, index: true },
    invoiceNumber: { type: String, required: true },
    supplierName: { type: String, required: true },
    amount: { type: Number, required: true },
    issueType: { type: String, required: true },
    severity: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    varianceAmount: { type: Number },
    aiRecommendation: { type: String, required: true },
    createdAtStr: { type: String, required: true },
    status: { type: String, required: true, index: true },
  },
  { timestamps: true, strict: false }
);

export const ExceptionModel = mongoose.model<IExceptionDocument>('Exception', ExceptionSchema, 'exceptions');
