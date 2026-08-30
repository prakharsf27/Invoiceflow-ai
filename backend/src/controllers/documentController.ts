import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { DocumentModel } from '../models/Document.js';
import { documentStorageService } from '../services/storage/documentStorageService.js';
import { documentTypeService } from '../services/documentTypeService.js';
import { documentProcessingService } from '../services/documentProcessingService.js';
import { poMatchingService } from '../services/poMatchingService.js';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

/**
 * POST /api/documents/upload
 * Multi-file non-blocking upload endpoint scoped to req.user.companyId.
 * Creates Document records, enqueues background processing, and returns immediately.
 */
export const uploadDocumentsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const files = req.files as Express.Multer.File[];

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No files uploaded. Please attach at least one file.',
      });
      return;
    }

    const processedDocuments: any[] = [];
    const fileErrors: Array<{ originalFileName: string; error: string }> = [];

    for (const file of files) {
      const originalFileName = file.originalname || 'unnamed_file';
      const ext = path.extname(originalFileName).toLowerCase();

      // Validate File Size & MIME Type
      if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
        fileErrors.push({
          originalFileName,
          error: `Unsupported file format (${file.mimetype || ext}). Only PDF, PNG, JPG/JPEG are supported.`,
        });
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        fileErrors.push({
          originalFileName,
          error: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds 15MB limit.`,
        });
        continue;
      }

      try {
        // Save file to isolated company storage
        const storageResult = await documentStorageService.saveFile(
          companyId,
          file.buffer,
          originalFileName
        );

        // Calculate content file hash for content deduplication & idempotency
        const fileHash = documentProcessingService.calculateFileHash(file.buffer);

        // Detect Document Type using deterministic heuristics (0 AI calls)
        const documentType = documentTypeService.detectTypeFromFilename(originalFileName);

        const docId = `doc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

        // Create MongoDB Document in queued status
        const newDoc = await DocumentModel.create({
          id: docId,
          companyId,
          uploadedBy: userId,
          originalFileName,
          fileName: storageResult.fileName,
          mimeType: file.mimetype,
          fileSize: file.size,
          fileHash,
          documentType,
          storagePath: storageResult.storagePath,
          storageReference: storageResult.storageReference,
          processingStatus: 'queued',
          extractionStatus: 'pending',
        });

        // Trigger background processing asynchronously (non-blocking)
        documentProcessingService
          .processDocument(newDoc.id, companyId, userId)
          .catch((err) => console.error(`[BackgroundProcessing] Error processing ${newDoc.id}:`, err?.message));

        processedDocuments.push({
          id: newDoc.id,
          originalFileName: newDoc.originalFileName,
          fileName: newDoc.fileName,
          mimeType: newDoc.mimeType,
          fileSize: newDoc.fileSize,
          fileHash: newDoc.fileHash,
          documentType: newDoc.documentType,
          processingStatus: 'queued',
          extractionStatus: 'pending',
          createdAt: newDoc.createdAt,
          status: 'success',
        });
      } catch (err: any) {
        fileErrors.push({
          originalFileName,
          error: err?.message || 'Failed to process file storage.',
        });
      }
    }

    res.status(processedDocuments.length > 0 ? 201 : 400).json({
      success: processedDocuments.length > 0,
      documents: processedDocuments,
      errors: fileErrors,
      summary: {
        totalReceived: files.length,
        totalUploaded: processedDocuments.length,
        totalFailed: fileErrors.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to upload documents.',
    });
  }
};

/**
 * POST /api/documents/:id/process
 * Idempotent process trigger for a document. Returns stored extraction if already processed.
 */
export const processDocumentController = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const docId = String(req.params.id);

    const processedDoc = await documentProcessingService.processDocument(docId, companyId, userId, {
      forceReprocess: false,
    });

    res.json({
      success: true,
      document: processedDoc,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to process document.',
    });
  }
};

/**
 * POST /api/documents/:id/reprocess
 * Force re-process document (bypasses cache, calls Gemini, re-runs matching).
 */
export const reprocessDocumentController = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const docId = String(req.params.id);

    const processedDoc = await documentProcessingService.processDocument(docId, companyId, userId, {
      forceReprocess: true,
    });

    res.json({
      success: true,
      document: processedDoc,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to reprocess document.',
    });
  }
};

/**
 * GET /api/documents/:id/extraction
 * Return extracted JSON & validation checks (0 Gemini calls).
 */
export const getDocumentExtractionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params;

    const document = await DocumentModel.findOne({ id, companyId });

    if (!document) {
      res.status(404).json({
        success: false,
        error: 'Document not found or access denied.',
      });
      return;
    }

    res.json({
      success: true,
      documentId: document.id,
      documentType: document.documentType,
      extractionStatus: document.extractionStatus,
      extractedData: document.extractedData || null,
      validationResults: document.validationResults || [],
      extractedAt: document.extractedAt || null,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch document extraction.',
    });
  }
};

/**
 * GET /api/documents/:id/matches
 * Return PO match result for a document (0 Gemini calls).
 */
export const getDocumentMatchesController = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params;

    const document = await DocumentModel.findOne({ id, companyId });

    if (!document) {
      res.status(404).json({
        success: false,
        error: 'Document not found or access denied.',
      });
      return;
    }

    res.json({
      success: true,
      documentId: document.id,
      matchResult: document.matchResult || {
        matchStatus: 'no_match',
        matchScore: 0,
        matchedFields: [],
        discrepancies: ['No PO match record found for this document.'],
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch document matches.',
    });
  }
};

/**
 * GET /api/documents
 * List all documents belonging to req.user.companyId with filters and search.
 */
export const getDocumentsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { documentType, processingStatus, extractionStatus, search } = req.query;

    const query: any = { companyId };

    if (documentType && ['unknown', 'invoice', 'purchase_order'].includes(String(documentType))) {
      query.documentType = String(documentType);
    }

    if (processingStatus && ['uploaded', 'queued', 'processing', 'processed', 'failed'].includes(String(processingStatus))) {
      query.processingStatus = String(processingStatus);
    }

    if (extractionStatus && ['pending', 'processing', 'extracted', 'failed'].includes(String(extractionStatus))) {
      query.extractionStatus = String(extractionStatus);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      query.originalFileName = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    const documents = await DocumentModel.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: documents.length,
      documents,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch documents.',
    });
  }
};

/**
 * GET /api/documents/:id
 * Retrieve details for a document owned by req.user.companyId.
 */
export const getDocumentDetailsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params;

    const document = await DocumentModel.findOne({ id, companyId });

    if (!document) {
      res.status(404).json({
        success: false,
        error: 'Document not found or access denied.',
      });
      return;
    }

    res.json({
      success: true,
      document,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch document details.',
    });
  }
};

/**
 * GET /api/documents/:id/file
 * Stream stored document file for browser preview/download safely.
 */
export const getDocumentFileController = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params;

    const document = await DocumentModel.findOne({ id, companyId });

    if (!document) {
      res.status(404).json({
        success: false,
        error: 'Document not found or access denied.',
      });
      return;
    }

    const filePath = documentStorageService.getFilePath(companyId, document.fileName);

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.originalFileName)}"`);

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to stream document file.',
    });
  }
};

/**
 * DELETE /api/documents/:id
 * Delete a document owned by req.user.companyId.
 */
export const deleteDocumentController = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params;

    const document = await DocumentModel.findOne({ id, companyId });

    if (!document) {
      res.status(404).json({
        success: false,
        error: 'Document not found or access denied.',
      });
      return;
    }

    await documentStorageService.deleteFile(companyId, document.fileName);
    await DocumentModel.deleteOne({ id, companyId });

    res.json({
      success: true,
      message: 'Document deleted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to delete document.',
    });
  }
};

/**
 * POST /api/documents/:id/rematch
 * Re-run PO matching for a single invoice document without re-extraction.
 * Useful when the PO was uploaded after the invoice was already extracted.
 */
export const rematchDocumentController = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params;

    const document = await DocumentModel.findOne({ id, companyId });

    if (!document) {
      res.status(404).json({
        success: false,
        error: 'Document not found or access denied.',
      });
      return;
    }

    if (document.documentType !== 'invoice') {
      res.status(400).json({
        success: false,
        error: 'PO matching is only applicable to invoice documents.',
      });
      return;
    }

    if (!document.extractedData) {
      res.status(400).json({
        success: false,
        error: 'Document has not been extracted yet. Process the document first.',
      });
      return;
    }

    const newMatchResult = await poMatchingService.matchInvoiceToPO(companyId, document.extractedData);

    const updatedDocument = await DocumentModel.findOneAndUpdate(
      { id, companyId },
      { $set: { matchResult: newMatchResult } },
      { returnDocument: 'after' }
    );

    res.json({
      success: true,
      documentId: id,
      matchResult: newMatchResult,
      document: updatedDocument,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to re-match document.',
    });
  }
};
