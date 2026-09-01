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

export interface ISupplierMatchResult {
  supplierId: string;
  supplierName: string;
  isNewSupplier: boolean;
  matchedBy: 'gstin' | 'name' | 'auto_created';
  message: string;
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
  extractionMethod?: 'pdf_text' | 'ocr' | 'ai';
  extractionQuality?: 'high' | 'incomplete' | 'ambiguous';
  aiAssisted?: boolean;
  extractionError?: string;
  extractedText?: string;
  extractedData?: any;
  validationResults?: IDocumentValidationCheck[];
  matchResult?: IPOMatchResult;
  supplierResult?: ISupplierMatchResult;
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
    extractionMethod: {
      type: String,
      enum: ['pdf_text', 'ocr', 'ai'],
    },
    extractionQuality: {
      type: String,
      enum: ['high', 'incomplete', 'ambiguous'],
      default: 'high',
    },
    aiAssisted: { type: Boolean, default: false },
    extractionError: { type: String },
    extractedText: { type: String },
    extractedData: { type: Schema.Types.Mixed },
    validationResults: [{ type: Schema.Types.Mixed }],
    matchResult: { type: Schema.Types.Mixed },
    supplierResult: { type: Schema.Types.Mixed },
    extractedAt: { type: String },
    linkedRecordId: { type: String },
  },
  { timestamps: true }
);

DocumentSchema.index({ companyId: 1, processingStatus: 1 });
DocumentSchema.index({ companyId: 1, documentType: 1 });

export const DocumentModel = mongoose.model<IDocumentEntity>('Document', DocumentSchema, 'documents');
