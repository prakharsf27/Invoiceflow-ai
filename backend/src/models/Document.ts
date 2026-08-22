import mongoose, { Schema, Document } from 'mongoose';

export type DocumentType = 'unknown' | 'invoice' | 'purchase_order';
export type ProcessingStatus = 'uploaded' | 'queued' | 'processing' | 'processed' | 'failed';
export type ExtractionStatus = 'pending' | 'processing' | 'extracted' | 'failed';

export interface IDocumentValidationCheck {
  id: string;
  title: string;
  passed: boolean;
  type: 'success' | 'warning' | 'critical' | 'info';
  detail: string;
}

export interface IPOMatchResult {
  invoiceId?: string;
  purchaseOrderId?: string;
  poNumber?: string;
  matchStatus: 'matched' | 'partial_match' | 'mismatch' | 'no_match' | 'needs_review';
  matchScore: number; // 0 to 100
  matchedFields: string[];
  discrepancies: string[];
  poDetails?: any;
}

export interface IDocumentEntity extends Document {
  id: string;
  companyId: string;
  uploadedBy: string;
  originalFileName: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash?: string;
  documentType: DocumentType;
  storagePath: string;
  storageReference: string;
  processingStatus: ProcessingStatus;
  extractionStatus: ExtractionStatus;
  extractionError?: string;
  extractedData?: any;
  validationResults?: IDocumentValidationCheck[];
  matchResult?: IPOMatchResult;
  extractedAt?: string;
  linkedRecordId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocumentEntity>(
  {
    id: { type: String, required: true, unique: true },
    companyId: { type: String, required: true, index: true },
    uploadedBy: { type: String, required: true },
    originalFileName: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileHash: { type: String, index: true },
    documentType: {
      type: String,
      enum: ['unknown', 'invoice', 'purchase_order'],
      default: 'unknown',
      index: true,
    },
    storagePath: { type: String, required: true },
    storageReference: { type: String, required: true, unique: true },
    processingStatus: {
      type: String,
      enum: ['uploaded', 'queued', 'processing', 'processed', 'failed'],
      default: 'uploaded',
      index: true,
    },
    extractionStatus: {
      type: String,
      enum: ['pending', 'processing', 'extracted', 'failed'],
      default: 'pending',
      index: true,
    },
    extractionError: { type: String },
    extractedData: { type: Schema.Types.Mixed },
    validationResults: [
      {
        id: { type: String },
        title: { type: String },
        passed: { type: Boolean },
        type: { type: String },
        detail: { type: String },
      },
    ],
    matchResult: { type: Schema.Types.Mixed },
    extractedAt: { type: String },
    linkedRecordId: { type: String },
  },
  { timestamps: true }
);

export const DocumentModel = mongoose.model<IDocumentEntity>('Document', DocumentSchema, 'documents');
