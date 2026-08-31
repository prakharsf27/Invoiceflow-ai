import mongoose, { Schema, Document } from 'mongoose';

export interface IInvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  poItemMatched?: boolean;
}

export interface IAICheck {
  id: string;
  title: string;
  passed: boolean;
  type: 'success' | 'warning' | 'critical' | 'info';
  detail: string;
}

export interface IEvidenceDetail {
  title: string;
  invoiceValue: string;
  referenceValue?: string;
  difference?: string;
  explanation: string;
}

export interface IInvoiceRiskAnalysis {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  decision: 'approve' | 'review' | 'hold';
  reasons: string[];
  warnings: string[];
  recommendation: string;
  analyzedAt?: string;
}

export interface IStoredAIAnalysis {
  status: 'completed' | 'pending' | 'failed';
  result: IInvoiceRiskAnalysis;
  model: string;
  analyzedAt: string;
  analysisKey: string;
  cached?: boolean;
}

export interface IInvoiceDocument extends Document {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  supplierGstin?: string | null;
  supplierEmail?: string | null;
  supplierPhone?: string | null;
  amount: number;
  currency: string;
  subtotal: number;
  tax: number;
  discount: number;
  invoiceDate: string;
  dueDate?: string | null;
  calculatedDueDate?: string | null;
  poNumber?: string | null;
  aiStatus: string;
  status: string;
  paymentStatus: string;
  riskLevel: string;
  paymentTerms?: string | null;
  bankDetails?: {
    accountNumber?: string | null;
    ifsc?: string | null;
    bankName?: string | null;
    isChangedFromPrevious?: boolean;
    previousAccountNumber?: string;
  };
  items: IInvoiceItem[];
  aiChecks: IAICheck[];
  aiRecommendation: string;
  evidence?: IEvidenceDetail[];
  similarityScore?: number;
  similarInvoiceId?: string;
  riskAnalysis?: IInvoiceRiskAnalysis;
  aiAnalysis?: IStoredAIAnalysis;
  companyId: string;
  createdBy?: string;
}

const InvoiceSchema = new Schema<IInvoiceDocument>(
  {
    id: { type: String, required: true, unique: true },
    invoiceNumber: { type: String, required: true, index: true },
    companyId: { type: String, required: true, default: 'company-demo-01', index: true },
    createdBy: { type: String },
    supplierId: { type: String, required: true },
    supplierName: { type: String, required: true },
    supplierGstin: { type: String },
    supplierEmail: { type: String },
    supplierPhone: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    invoiceDate: { type: String, required: true },
    dueDate: { type: String },
    calculatedDueDate: { type: String },
    poNumber: { type: String },
    aiStatus: { type: String, required: true },
    status: { type: String, required: true, index: true },
    paymentStatus: { type: String, required: true },
    riskLevel: { type: String, required: true },
    paymentTerms: { type: String },
    bankDetails: {
      accountNumber: { type: String },
      ifsc: { type: String },
      bankName: { type: String },
      isChangedFromPrevious: { type: Boolean, default: false },
      previousAccountNumber: { type: String },
    },
    items: [
      {
        id: { type: String, required: true },
        description: { type: String, required: true },
        quantity: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        taxRate: { type: Number, required: true },
        taxAmount: { type: Number, required: true },
        total: { type: Number, required: true },
        poItemMatched: { type: Boolean },
      },
    ],
    aiChecks: [
      {
        id: { type: String, required: true },
        title: { type: String, required: true },
        passed: { type: Boolean, required: true },
        type: { type: String, required: true },
        detail: { type: String, required: true },
      },
    ],
    aiRecommendation: { type: String, required: true },
    evidence: [
      {
        title: { type: String, required: true },
        invoiceValue: { type: String, required: true },
        referenceValue: { type: String },
        difference: { type: String },
        explanation: { type: String, required: true },
      },
    ],
    similarityScore: { type: Number },
    similarInvoiceId: { type: String },
  },
  { timestamps: true, strict: false }
);

export const InvoiceModel = mongoose.model<IInvoiceDocument>('Invoice', InvoiceSchema, 'invoices');
