import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, CheckCircle2, Loader2, ArrowRight, AlertCircle, FileText } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useApp } from '../context/AppContext';
import { invoiceService } from '../services/invoiceService';

export const UploadInvoicePage: React.FC = () => {
  const navigate = useNavigate();
  const { refreshData, showToast } = useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [completedInvoiceId, setCompletedInvoiceId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processingSteps = [
    'Uploading document to backend server',
    'Gemini 2.5 Flash strict OCR & JSON extraction',
    'Validating mandatory fields (Invoice #, Supplier, Total)',
    'Running 3-way PO match against procurement records',
    'Checking vendor identity & duplicate records in MongoDB',
    'Persisting verified invoice document to MongoDB Atlas',
    'AI extraction & validation complete',
  ];

  const handleFileUpload = async (file: File) => {
    setErrorMsg(null);
    setWarnings([]);
    setSelectedFileName(file.name);
    setIsProcessing(true);
    setCurrentStep(0);

    try {
      // Step 1: Uploading
      setCurrentStep(0);
      await new Promise((r) => setTimeout(r, 200));

      // Step 2: Gemini OCR & Extraction
      setCurrentStep(1);

      const response = await invoiceService.uploadInvoiceFile(file);

      // Step 3: Mandatory Validation
      setCurrentStep(2);
      await new Promise((r) => setTimeout(r, 250));

      // Step 4: 3-Way PO Match
      setCurrentStep(3);
      await new Promise((r) => setTimeout(r, 250));

      // Step 5: Vendor & Duplicate Check
      setCurrentStep(4);
      await new Promise((r) => setTimeout(r, 250));

      // Step 6: Persisting to MongoDB
      setCurrentStep(5);
      await new Promise((r) => setTimeout(r, 200));

      // Step 7: Complete
      setCurrentStep(6);

      const createdInvoice = response.invoice;
      const extractionWarnings = response.extraction?.warnings || [];

      setWarnings(extractionWarnings);
      setCompletedInvoiceId(createdInvoice.id || createdInvoice.invoiceNumber);

      await refreshData();
      showToast(`Invoice ${createdInvoice.invoiceNumber} extracted & saved to MongoDB Atlas!`, 'success');
    } catch (err: any) {
      console.error('Extraction flow error:', err);
      const msg = err?.message || 'Uploaded document does not appear to contain a valid invoice.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Upload Invoice
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Select or drop any invoice file (PDF, PNG, JPG) to run real Gemini 2.5 Flash anti-hallucination extraction and 3-way PO matching.
        </p>
      </div>

      {errorMsg && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-3 text-red-800 text-xs">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-red-900 font-sans">Document Rejected</h4>
            <p className="font-sans text-red-800">{errorMsg}</p>
          </div>
        </Card>
      )}

      {!isProcessing && !completedInvoiceId && (
        <Card
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="p-8 border-dashed border-2 border-slate-300 hover:border-brand-500 transition-colors text-center space-y-4 cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileChange}
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
          />

          <div className="w-14 h-14 mx-auto rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
            <UploadCloud className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">
              Drag & drop any invoice file here, or click to browse
            </h3>
            <p className="text-xs text-slate-500">
              Supports real PDF, PNG, JPG documents (Max file size: 15MB)
            </p>
          </div>

          <div className="flex justify-center gap-3 pt-2" onClick={(e) => e.stopPropagation()}>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="brand"
              size="sm"
              className="cursor-pointer gap-2"
            >
              <FileText className="w-4 h-4" />
              <span>Select File from Computer</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Processing Stepper */}
      {isProcessing && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Gemini 2.5 Flash is extracting {selectedFileName || 'your document'}...
              </h3>
              <p className="text-xs text-slate-500">
                Validating mandatory fields, checking totals, and performing 3-way PO matching
              </p>
            </div>
          </div>

          <div className="space-y-3 pl-2">
            {processingSteps.map((step, idx) => {
              const isDone = idx < currentStep;
              const isCurrent = idx === currentStep;

              return (
                <div key={step} className="flex items-center gap-3 text-xs">
                  <div className="w-5 h-5 flex items-center justify-center">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : isCurrent ? (
                      <div className="w-3 h-3 rounded-full bg-brand-600 animate-ping" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-slate-300" />
                    )}
                  </div>
                  <span
                    className={`font-medium ${
                      isDone
                        ? 'text-slate-900'
                        : isCurrent
                        ? 'text-brand-700 font-semibold'
                        : 'text-slate-400'
                    }`}
                  >
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Complete State */}
      {completedInvoiceId && (
        <Card className="p-6 text-center space-y-4 bg-emerald-50/40 border-emerald-200">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <div>
            <h3 className="text-base font-bold text-slate-900">
              Invoice Extracted & Persisted to MongoDB Atlas!
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Gemini 2.5 Flash validated mandatory fields, verified line items, and saved to MongoDB.
            </p>
          </div>

          {warnings.length > 0 && (
            <div className="text-left bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs space-y-1 max-w-xl mx-auto">
              <span className="font-semibold text-amber-900">Extraction Warnings:</span>
              <ul className="list-disc list-inside text-amber-800 space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-center gap-3 pt-2">
            <Button
              onClick={() => {
                setCompletedInvoiceId(null);
                setIsProcessing(false);
                setWarnings([]);
                setSelectedFileName(null);
              }}
              variant="outline"
              size="sm"
              className="cursor-pointer"
            >
              Upload Another
            </Button>
            <Button
              onClick={() => navigate(`/app/invoices/${completedInvoiceId}`)}
              variant="brand"
              size="sm"
              className="cursor-pointer"
            >
              <span>View Extracted Invoice</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
