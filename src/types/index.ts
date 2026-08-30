export type InvoiceStatus =
  | 'ready'
  | 'review'
  | 'critical'
  | 'paid'
  | 'overdue'
  | 'processing'
  | 'hold'
  | 'on_hold';

export type PaymentStatus =
  | 'pending'
  | 'scheduled'
  | 'paid'
  | 'overdue'
  | 'on_hold';

export type RiskLevel = 'low' | 'medium' | 'high';

export type ExceptionType =
  | 'po_mismatch'
  | 'duplicate'
  | 'bank_change'
  | 'missing_information'
  | 'calculation_error'
  | 'overdue';

export type ExceptionSeverity = 'critical' | 'review' | 'informational';

export type AppDocumentType = 'unknown' | 'invoice' | 'purchase_order';
export type AppDocumentProcessingStatus = 'uploaded' | 'queued' | 'processing' | 'processed' | 'failed';
export type AppDocumentExtractionStatus = 'pending' | 'processing' | 'extracted' | 'failed';

export interface AppDocumentValidationCheck {
  id: string;
  title: string;
  passed: boolean;
  type: 'success' | 'warning' | 'critical' | 'info';
  detail: string;
}

export interface AppDocumentPOMatchResult {
  purchaseOrderId?: string;
  poNumber?: string;
  matchStatus: 'matched' | 'partial_match' | 'mismatch' | 'no_match' | 'needs_review';
  matchScore: number;
  matchedFields: string[];
  discrepancies: string[];
  poDetails?: {
    poNumber?: string;
    supplierName?: string;
    totalAmount?: number;
  };
}

export interface AppDocumentSupplierMatchResult {
  supplierId: string;
  supplierName: string;
  isNewSupplier: boolean;
  matchedBy: 'gstin' | 'name' | 'auto_created';
  message: string;
}

export interface AppDocument {
  id: string;
  companyId: string;
  uploadedBy: string;
  originalFileName: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash?: string;
  documentType: AppDocumentType;
  storagePath: string;
  storageReference: string;
  processingStatus: AppDocumentProcessingStatus;
  extractionStatus: AppDocumentExtractionStatus;
  extractionMethod?: 'pdf_text' | 'ocr' | 'ai';
  aiAssisted?: boolean;
  extractionError?: string;
  extractedData?: any;
  validationResults?: AppDocumentValidationCheck[];
  matchResult?: AppDocumentPOMatchResult;
  supplierResult?: AppDocumentSupplierMatchResult;
  extractedAt?: string;
  linkedRecordId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  poItemMatched?: boolean;
}

export interface AICheck {
  id: string;
  title: string;
  passed: boolean;
  type: 'success' | 'warning' | 'critical' | 'info';
  detail: string;
}

export interface EvidenceDetail {
  title: string;
  invoiceValue: string;
  referenceValue?: string;
  difference?: string;
  explanation: string;
}

export interface InvoiceRiskAnalysis {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  decision: 'approve' | 'review' | 'hold';
  reasons: string[];
  warnings: string[];
  recommendation: string;
  analyzedAt?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  supplierGstin: string;
  supplierEmail: string;
  supplierPhone: string;
  amount: number;
  currency: string;
  subtotal: number;
  tax: number;
  discount: number;
  invoiceDate: string;
  dueDate: string;
  poNumber?: string;
  aiStatus: 'Ready' | 'PO Mismatch' | 'Possible Duplicate' | 'Bank Detail Change' | 'Missing Information' | 'Overdue' | 'Approved' | 'On Hold' | 'Duplicate Alert' | 'Needs Review' | string;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  riskLevel: RiskLevel | 'critical';
  paymentTerms: string;
  bankDetails: {
    accountNumber: string;
    ifsc: string;
    bankName: string;
    isChangedFromPrevious?: boolean;
    previousAccountNumber?: string;
  };
  items: InvoiceItem[];
  aiChecks: AICheck[];
  aiRecommendation: string;
  evidence?: EvidenceDetail[];
  similarityScore?: number;
  similarInvoiceId?: string;
  riskAnalysis?: InvoiceRiskAnalysis;
  aiAnalysis?: {
    status: 'completed' | 'pending' | 'failed';
    result: InvoiceRiskAnalysis;
    model: string;
    analyzedAt: string;
    analysisKey: string;
    cached?: boolean;
  };
}

export interface Supplier {
  id: string;
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
  riskLevel: RiskLevel;
  lastInvoiceDate: string;
  status: 'active' | 'under_review' | 'blocked';
  bankAccounts: {
    accountNumber: string;
    bankName: string;
    ifsc: string;
    isPrimary: boolean;
    addedDate: string;
  }[];
  recentAlerts?: string[];
  bankStatus?: 'changed' | 'verified';
  totalPayable?: number;
  riskStatus?: RiskLevel;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  issuedDate: string;
  status: 'matched' | 'mismatch' | 'partial' | 'open';
  invoiceId?: string;
  matchStatus?: 'matched' | 'mismatch' | 'partial';
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
}

export interface Exception {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  amount: number;
  issueType: ExceptionType;
  severity: ExceptionSeverity;
  title: string;
  description: string;
  varianceAmount?: number;
  aiRecommendation: string;
  createdAt: string;
  status: 'pending' | 'resolved' | 'dismissed';
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  amount: number;
  dueDate: string;
  status: PaymentStatus;
  paidDate?: string;
  paymentMethod?: string;
  scheduledDate?: string;
  bankName?: string;
  accountEnding?: string;
  poNumber?: string;
}

export interface DashboardMetrics {
  totalPayables: number; // e.g. 1240000 (₹12.4L)
  payablesGrowthPercent: number; // +2.1%
  invoicesReceivedWeek: number; // 17
  needAttentionCount: number; // 3
  overdueAmount: number; // 210000 (₹2.1L)
  overdueInvoiceCount: number; // 2
  timeSavedHours: number; // 8.6
  totalProcessedCount: number; // 147
  autoClearedCount: number; // 132
  needsReviewCount: number; // 11
  criticalCount: number; // 4
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  structuredData?: {
    type: 'invoice_list' | 'exception_summary' | 'po_comparison' | 'recommendation';
    title?: string;
    totalPayable?: string;
    highlightItem?: {
      title: string;
      amount: string;
      dueDate?: string;
      risk?: string;
      reasons?: string[];
      recommendation?: string;
      actionUrl?: string;
      actionLabel?: string;
    };
    items?: Array<{
      id: string;
      name: string;
      amount: string;
      status: string;
      actionUrl?: string;
    }>;
  };
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'member' | 'finance_admin' | 'accountant' | 'reviewer';
  isOwner: boolean;
  isCurrentUser: boolean;
  createdAt: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: 'owner' | 'member' | 'finance_admin' | 'accountant' | 'reviewer';
  invitedByName: string;
  token: string;
  invitationLink?: string;
  createdAt: string;
  expiresAt: string;
}

export interface InvitationInfo {
  id: string;
  companyId: string;
  companyName: string;
  email: string;
  role: 'owner' | 'member' | 'finance_admin' | 'accountant' | 'reviewer';
  invitedByName: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
}

export interface CompanyProfile {
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
  settings: {
    autoClearanceThreshold: number;
    riskTolerance: 'low' | 'medium' | 'high';
    requirePoMatch: boolean;
    currency?: string;
    defaultPaymentTerms?: string;
  };
  membersCount: number;
  isOwner: boolean;
  createdAt?: string;
}
