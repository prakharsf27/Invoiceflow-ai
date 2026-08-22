import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileText,
  Search,
  Eye,
  Trash2,
  X,
  FileCheck,
  Building2,
  Clock,
  HardDrive,
  Download,
  AlertTriangle,
  FolderOpen,
  RefreshCw,
  Sparkles,
  Link as LinkIcon,
  Check,
  XCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import { documentService } from '../services/documentService';
import type { AppDocument, AppDocumentType } from '../types';

interface StagedFile {
  id: string;
  file: File;
  typeGuess: AppDocumentType;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  errorMessage?: string;
}

export const UploadInvoicePage: React.FC = () => {
  const { showToast } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Staging state
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [batchErrors, setBatchErrors] = useState<Array<{ originalFileName: string; error: string }>>([]);

  // Library state
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'invoices' | 'pos' | 'processing' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected document modal state & detail tabs
  const [selectedDoc, setSelectedDoc] = useState<AppDocument | null>(null);
  const [docModalTab, setDocModalTab] = useState<'extracted' | 'validation' | 'matching'>('extracted');
  const [isReprocessing, setIsReprocessing] = useState(false);

  // Fetch company documents on mount & after uploads
  const loadCompanyDocuments = async (showSpinner = true) => {
    if (showSpinner) setIsLoadingDocs(true);
    try {
      let docTypeFilter: string | undefined = undefined;
      let procStatusFilter: string | undefined = undefined;
      let extStatusFilter: string | undefined = undefined;

      if (activeTab === 'invoices') docTypeFilter = 'invoice';
      if (activeTab === 'pos') docTypeFilter = 'purchase_order';
      if (activeTab === 'processing') procStatusFilter = 'processing';
      if (activeTab === 'failed') procStatusFilter = 'failed';

      const docs = await documentService.getDocuments({
        documentType: docTypeFilter,
        processingStatus: procStatusFilter,
        extractionStatus: extStatusFilter,
        search: searchQuery,
      });

      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      if (showSpinner) setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadCompanyDocuments();
  }, [activeTab, searchQuery]);

  // Auto-polling for queued/processing background documents
  useEffect(() => {
    const hasPendingDocs = documents.some(
      (d) => d.processingStatus === 'queued' || d.processingStatus === 'processing'
    );
    if (!hasPendingDocs) return;

    const interval = setInterval(() => {
      loadCompanyDocuments(false);
    }, 2500);

    return () => clearInterval(interval);
  }, [documents]);

  // Deterministic Document Type Guess
  const guessDocumentType = (fileName: string): AppDocumentType => {
    const fn = fileName.toLowerCase();
    if (/\bpo[-_]?\d+/i.test(fn) || fn.includes('purchase') || fn.includes('po_') || fn.includes('po-')) {
      return 'purchase_order';
    }
    if (/\binv[-_]?\d+/i.test(fn) || fn.includes('invoice') || fn.includes('bill') || fn.includes('inv_') || fn.includes('inv-')) {
      return 'invoice';
    }
    return 'unknown';
  };

  // Add files to pre-upload staging queue
  const addFilesToStage = (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validStaged: StagedFile[] = [];

    fileArray.forEach((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['pdf', 'png', 'jpg', 'jpeg'].includes(ext || '')) {
        showToast(`File "${file.name}" rejected: Only PDF, PNG, JPG files are supported.`, 'error');
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        showToast(`File "${file.name}" rejected: Exceeds 15MB limit.`, 'error');
        return;
      }

      validStaged.push({
        id: `stage-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        typeGuess: guessDocumentType(file.name),
        status: 'pending',
      });
    });

    if (validStaged.length > 0) {
      setStagedFiles((prev) => [...prev, ...validStaged]);
    }
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToStage(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToStage(e.target.files);
    }
  };

  // Execute batch multi-file upload
  const executeBatchUpload = async () => {
    if (stagedFiles.length === 0) return;

    setIsUploading(true);
    setBatchErrors([]);

    setStagedFiles((prev) => prev.map((f) => ({ ...f, status: 'uploading' })));

    try {
      const filesToUpload = stagedFiles.map((s) => s.file);
      const result = await documentService.uploadDocuments(filesToUpload);

      const uploadedDocs = result.documents || [];
      const errors = result.errors || [];

      setBatchErrors(errors);

      setStagedFiles((prev) =>
        prev.map((s) => {
          const failed = errors.find((e) => e.originalFileName === s.file.name);
          if (failed) {
            return { ...s, status: 'failed', errorMessage: failed.error };
          }
          return { ...s, status: 'uploaded' };
        })
      );

      if (uploadedDocs.length > 0) {
        showToast(
          `Uploaded ${uploadedDocs.length} document(s). Processing AI extraction & 3-way PO matching in background!`,
          'success'
        );
        setTimeout(() => {
          setStagedFiles((prev) => prev.filter((f) => f.status === 'failed'));
        }, 2000);
      }

      await loadCompanyDocuments();
    } catch (err: any) {
      console.error('Batch upload error:', err);
      showToast(err?.message || 'Failed to upload document batch.', 'error');
      setStagedFiles((prev) => prev.map((f) => ({ ...f, status: 'failed', errorMessage: err?.message })));
    } finally {
      setIsUploading(false);
    }
  };

  const handleReprocessDoc = async (docId: string) => {
    setIsReprocessing(true);
    try {
      const updated = await documentService.reprocessDocument(docId);
      if (updated) {
        setSelectedDoc(updated);
        showToast('Document reprocessed with Gemini 2.5 Flash & PO matching updated!', 'success');
        await loadCompanyDocuments(false);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to reprocess document.', 'error');
    } finally {
      setIsReprocessing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this document from company storage?')) return;
    const ok = await documentService.deleteDocument(id);
    if (ok) {
      showToast('Document removed from company storage.', 'info');
      setSelectedDoc(null);
      await loadCompanyDocuments();
    } else {
      showToast('Failed to delete document.', 'error');
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Upload Center
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Batch ingest invoices and purchase orders. Automatic Gemini OCR extraction & 3-way PO matching.
        </p>
      </div>

      {/* Upload Drop Zone Card */}
      <Card className="p-6 bg-white border-slate-200/90 shadow-xs space-y-6">
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="p-8 border-dashed border-2 border-slate-300 hover:border-brand-500 bg-slate-50/50 hover:bg-brand-50/20 rounded-xl transition-all text-center space-y-3 cursor-pointer"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
          />

          <div className="w-12 h-12 mx-auto rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
            <UploadCloud className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">
              Drop invoices or purchase orders here, or <span className="text-brand-600 underline">browse files</span>
            </h3>
            <p className="text-xs text-slate-500">
              Supported formats: PDF, PNG, JPG/JPEG (Max 15MB per file) — Upload invoices & POs together without manual pairing
            </p>
          </div>
        </div>

        {/* Pre-Upload Staging Queue */}
        {stagedFiles.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-brand-600" /> Selected Files ({stagedFiles.length})
              </h4>
              <button
                onClick={() => setStagedFiles([])}
                disabled={isUploading}
                className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Clear Queue
              </button>
            </div>

            <div className="divide-y divide-slate-100 border rounded-xl overflow-hidden bg-white text-xs">
              {stagedFiles.map((sf) => (
                <div key={sf.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="truncate">
                      <span className="font-medium text-slate-900 truncate block">
                        {sf.file.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {formatFileSize(sf.file.size)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Type Guess Badge */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        sf.typeGuess === 'purchase_order'
                          ? 'bg-purple-100 text-purple-800'
                          : sf.typeGuess === 'invoice'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {sf.typeGuess === 'purchase_order' ? 'PO?' : sf.typeGuess === 'invoice' ? 'Invoice?' : 'Unknown'}
                    </span>

                    {/* Status Badge */}
                    {sf.status === 'pending' && (
                      <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        Pending
                      </span>
                    )}
                    {sf.status === 'uploading' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 bg-brand-50 text-brand-700 rounded flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
                      </span>
                    )}
                    {sf.status === 'uploaded' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Uploaded
                      </span>
                    )}
                    {sf.status === 'failed' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 bg-rose-50 text-rose-700 rounded flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-rose-600" /> Failed
                      </span>
                    )}

                    {!isUploading && sf.status === 'pending' && (
                      <button
                        onClick={() => removeStagedFile(sf.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Batch Errors Banner */}
            {batchErrors.length > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-1 text-rose-800">
                <span className="font-bold flex items-center gap-1.5 text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-600" /> Batch Upload Warnings:
                </span>
                <ul className="list-disc list-inside space-y-0.5">
                  {batchErrors.map((e, idx) => (
                    <li key={idx}>
                      <span className="font-semibold">{e.originalFileName}:</span> {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={executeBatchUpload}
                disabled={isUploading}
                variant="brand"
                size="sm"
                className="cursor-pointer gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading & Ingesting...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload & Auto-Process ({stagedFiles.filter((f) => f.status === 'pending').length})</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Document Library Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Document Repository & Auto-Matching</h2>
            <p className="text-xs text-slate-500">Uploaded documents, Gemini extractions, and 3-way PO match status</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadCompanyDocuments(true)}
              className="p-2 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDocs ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search filename..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 text-xs font-medium text-slate-500 pb-px overflow-x-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'all'
                ? 'border-brand-600 text-brand-700 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            All Documents
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-3 py-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'invoices'
                ? 'border-brand-600 text-brand-700 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Invoices
          </button>
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-3 py-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'pos'
                ? 'border-brand-600 text-brand-700 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Purchase Orders
          </button>
          <button
            onClick={() => setActiveTab('processing')}
            className={`px-3 py-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'processing'
                ? 'border-brand-600 text-brand-700 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Processing
          </button>
          <button
            onClick={() => setActiveTab('failed')}
            className={`px-3 py-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'failed'
                ? 'border-brand-600 text-brand-700 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Failed
          </button>
        </div>

        {/* Documents Table */}
        <Card className="p-0 border-slate-200/90 overflow-hidden shadow-xs">
          {isLoadingDocs ? (
            <div className="py-12 text-center space-y-2">
              <Loader2 className="w-6 h-6 text-brand-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-500">Loading document repository & match statuses...</p>
            </div>
          ) : documents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Document</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Extraction Status</th>
                    <th className="py-3 px-4">PO Match Status</th>
                    <th className="py-3 px-4">Uploaded</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {documents.map((doc) => {
                    const isInvoice = doc.documentType === 'invoice';
                    const match = doc.matchResult;

                    return (
                      <tr key={doc.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900 block truncate max-w-xs">
                                {doc.originalFileName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatFileSize(doc.fileSize)} • ID: {doc.id}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                              doc.documentType === 'purchase_order'
                                ? 'bg-purple-100 text-purple-800'
                                : doc.documentType === 'invoice'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {doc.documentType === 'purchase_order'
                              ? 'Purchase Order'
                              : doc.documentType === 'invoice'
                              ? 'Invoice'
                              : 'Unknown'}
                          </span>
                        </td>

                        {/* Pipeline Status */}
                        <td className="py-3 px-4">
                          {doc.processingStatus === 'queued' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                              Queued
                            </span>
                          )}
                          {doc.processingStatus === 'processing' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-amber-50 text-amber-700 rounded flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Processing AI...
                            </span>
                          )}
                          {doc.extractionStatus === 'extracted' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Extracted
                            </span>
                          )}
                          {doc.extractionStatus === 'failed' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-rose-50 text-rose-700 rounded flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-rose-600" /> Failed
                            </span>
                          )}
                        </td>

                        {/* PO Match Column */}
                        <td className="py-3 px-4">
                          {isInvoice && match ? (
                            match.matchStatus === 'matched' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded flex items-center gap-1 w-max">
                                <Check className="w-3 h-3" /> MATCHED ({match.matchScore}%)
                              </span>
                            ) : match.matchStatus === 'partial_match' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded flex items-center gap-1 w-max">
                                <AlertTriangle className="w-3 h-3" /> PARTIAL ({match.matchScore}%)
                              </span>
                            ) : match.matchStatus === 'mismatch' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded flex items-center gap-1 w-max">
                                <XCircle className="w-3 h-3" /> MISMATCH
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                                No PO Match
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-slate-500">
                          {formatDate(doc.createdAt)}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <Button
                            onClick={() => {
                              setSelectedDoc(doc);
                              setDocModalTab('extracted');
                            }}
                            variant="outline"
                            size="sm"
                            className="cursor-pointer gap-1 text-xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Empty State */
            <div className="py-16 text-center space-y-3 px-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <FolderOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-sm font-bold text-slate-900">No documents uploaded yet</h3>
                <p className="text-xs text-slate-500">
                  Upload invoices and purchase orders together to run automatic AI extraction and 3-way PO matching.
                </p>
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="brand"
                size="sm"
                className="cursor-pointer gap-1.5"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload First Batch</span>
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Upgraded Phase 3 Document Details Drawer / Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 border border-slate-200 shadow-2xl my-8">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 truncate max-w-md">
                    {selectedDoc.originalFileName}
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">
                    ID: {selectedDoc.id} • Hash: {selectedDoc.fileHash ? `${selectedDoc.fileHash.substring(0, 12)}...` : 'N/A'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-100 text-xs font-semibold">
              <button
                onClick={() => setDocModalTab('extracted')}
                className={`pb-2 px-1 border-b-2 cursor-pointer transition-colors ${
                  docModalTab === 'extracted'
                    ? 'border-brand-600 text-brand-700 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Extracted Data
              </button>
              <button
                onClick={() => setDocModalTab('validation')}
                className={`pb-2 px-1 border-b-2 cursor-pointer transition-colors ${
                  docModalTab === 'validation'
                    ? 'border-brand-600 text-brand-700 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Validation Checks ({selectedDoc.validationResults?.length || 0})
              </button>
              {selectedDoc.documentType === 'invoice' && (
                <button
                  onClick={() => setDocModalTab('matching')}
                  className={`pb-2 px-1 border-b-2 cursor-pointer transition-colors ${
                    docModalTab === 'matching'
                      ? 'border-brand-600 text-brand-700 font-bold'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  PO Matching Result
                </button>
              )}
            </div>

            {/* TAB 1: Extracted Data */}
            {docModalTab === 'extracted' && (
              <div className="space-y-4 text-xs">
                {selectedDoc.extractionStatus === 'extracted' && selectedDoc.extractedData ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-400 font-medium block">Document Type</span>
                        <span className="font-bold text-slate-900 uppercase">
                          {selectedDoc.documentType}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-400 font-medium block">
                          {selectedDoc.documentType === 'purchase_order' ? 'PO #' : 'Invoice #'}
                        </span>
                        <span className="font-bold text-slate-900">
                          {selectedDoc.extractedData.poNumber || selectedDoc.extractedData.invoiceNumber || 'N/A'}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-400 font-medium block">Supplier Name</span>
                        <span className="font-semibold text-slate-900 truncate block">
                          {selectedDoc.extractedData.supplierName || 'N/A'}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-400 font-medium block">Supplier GSTIN</span>
                        <span className="font-mono text-slate-900">
                          {selectedDoc.extractedData.supplierGstin || 'N/A'}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-400 font-medium block">Total Amount</span>
                        <span className="font-bold text-slate-900 text-sm">
                          ₹{(selectedDoc.extractedData.amount || selectedDoc.extractedData.total || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-400 font-medium block">Extracted At</span>
                        <span className="text-slate-700">
                          {formatDate(selectedDoc.extractedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    {Array.isArray(selectedDoc.extractedData.lineItems) && selectedDoc.extractedData.lineItems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-bold text-slate-900 text-xs">Extracted Line Items</h4>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-50 border-b text-slate-500 uppercase font-semibold">
                              <tr>
                                <th className="py-2 px-3">Description</th>
                                <th className="py-2 px-3">Qty</th>
                                <th className="py-2 px-3">Unit Price</th>
                                <th className="py-2 px-3">Tax %</th>
                                <th className="py-2 px-3 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {selectedDoc.extractedData.lineItems.map((item: any, idx: number) => (
                                <tr key={idx}>
                                  <td className="py-2 px-3 font-medium text-slate-900">{item.description}</td>
                                  <td className="py-2 px-3">{item.quantity || 1}</td>
                                  <td className="py-2 px-3">₹{(item.unitPrice || 0).toLocaleString('en-IN')}</td>
                                  <td className="py-2 px-3">{item.taxRate || 18}%</td>
                                  <td className="py-2 px-3 text-right font-bold">
                                    ₹{(item.total || (item.quantity * item.unitPrice) || 0).toLocaleString('en-IN')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-6 text-center space-y-2 bg-slate-50 rounded-xl">
                    <Clock className="w-6 h-6 text-slate-400 mx-auto" />
                    <p className="font-semibold text-slate-700">Document not processed yet</p>
                    <p className="text-slate-500">Click Reprocess with AI below to run Gemini 2.5 Flash OCR extraction.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Validation Checks */}
            {docModalTab === 'validation' && (
              <div className="space-y-3 text-xs">
                {selectedDoc.validationResults && selectedDoc.validationResults.length > 0 ? (
                  selectedDoc.validationResults.map((valCheck) => (
                    <div
                      key={valCheck.id}
                      className={`p-3 rounded-lg border flex items-start gap-3 ${
                        valCheck.passed
                          ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                          : 'bg-rose-50/50 border-rose-200 text-rose-900'
                      }`}
                    >
                      {valCheck.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h5 className="font-bold text-xs">{valCheck.title}</h5>
                        <p className="text-[11px] mt-0.5">{valCheck.detail}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 italic">No validation checks available yet.</p>
                )}
              </div>
            )}

            {/* TAB 3: PO Matching Result */}
            {docModalTab === 'matching' && (
              <div className="space-y-4 text-xs">
                {selectedDoc.matchResult ? (
                  <div className="p-4 rounded-xl border space-y-3 bg-slate-50 border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">PO Matching Evaluation</span>
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-1 rounded uppercase tracking-wider ${
                          selectedDoc.matchResult.matchStatus === 'matched'
                            ? 'bg-emerald-100 text-emerald-800'
                            : selectedDoc.matchResult.matchStatus === 'partial_match'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {selectedDoc.matchResult.matchStatus} ({selectedDoc.matchResult.matchScore}%)
                      </span>
                    </div>

                    {selectedDoc.matchResult.poNumber ? (
                      <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span className="flex items-center gap-1.5 text-brand-700">
                            <LinkIcon className="w-4 h-4" /> Matched Purchase Order: {selectedDoc.matchResult.poNumber}
                          </span>
                          {selectedDoc.matchResult.poDetails?.totalAmount && (
                            <span>₹{selectedDoc.matchResult.poDetails.totalAmount.toLocaleString('en-IN')}</span>
                          )}
                        </div>

                        {selectedDoc.matchResult.matchedFields.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-slate-500">Verified Matched Signals:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedDoc.matchResult.matchedFields.map((field, i) => (
                                <span key={i} className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded flex items-center gap-1">
                                  <Check className="w-3 h-3" /> {field}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 font-semibold">
                        No matching purchase order found in company procurement records.
                      </div>
                    )}

                    {selectedDoc.matchResult.discrepancies.length > 0 && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-1">
                        <span className="font-bold text-rose-900 block">Identified Discrepancies:</span>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                          {selectedDoc.matchResult.discrepancies.map((disc, i) => (
                            <li key={i}>{disc}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 italic">No PO matching outcome generated for this document.</p>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                onClick={() => handleDeleteDocument(selectedDoc.id)}
                className="text-xs text-rose-600 hover:text-rose-800 font-medium cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete File</span>
              </button>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleReprocessDoc(selectedDoc.id)}
                  disabled={isReprocessing}
                  variant="outline"
                  size="sm"
                  className="cursor-pointer gap-1.5"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-brand-600 ${isReprocessing ? 'animate-spin' : ''}`} />
                  <span>{isReprocessing ? 'Extracting with Gemini...' : 'Reprocess with AI'}</span>
                </Button>
                <a
                  href={documentService.getDocumentFileUrl(selectedDoc.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Open Original File</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
