import mongoose, { Schema, Document } from 'mongoose';

export interface ICompanySettings {
  autoClearanceThreshold?: number;
  riskTolerance?: 'low' | 'medium' | 'high';
  requirePoMatch?: boolean;
  currency?: string;
  defaultPaymentTerms?: string;
}

export interface ICompanyDocument extends Document {
  id: string;
  name: string;
  ownerId: string;
  gstin?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  settings: ICompanySettings;
  membersCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<ICompanyDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    ownerId: { type: String, required: true, index: true },
    gstin: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    pincode: { type: String, default: '', trim: true },
    settings: {
      autoClearanceThreshold: { type: Number, default: 500000 },
      riskTolerance: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
      requirePoMatch: { type: Boolean, default: true },
      currency: { type: String, default: 'INR' },
      defaultPaymentTerms: { type: String, default: 'Net 30' },
    },
    membersCount: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const CompanyModel = mongoose.model<ICompanyDocument>('Company', CompanySchema, 'companies');
