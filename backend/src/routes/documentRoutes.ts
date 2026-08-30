import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import {
  uploadDocumentsController,
  getDocumentsController,
  getDocumentDetailsController,
  getDocumentFileController,
  deleteDocumentController,
  processDocumentController,
  reprocessDocumentController,
  getDocumentExtractionController,
  getDocumentMatchesController,
  rematchDocumentController,
} from '../controllers/documentController.js';

const router = Router();

// Configure Multer for in-memory upload buffering
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit per file
    files: 15, // Up to 15 files per batch
  },
});

// All document routes require authentication and are companyId scoped
router.use(requireAuth);

// POST /api/documents/upload (Multi-file upload & enqueue)
router.post('/upload', upload.array('files', 15), uploadDocumentsController);

// GET /api/documents (List company documents with filters)
router.get('/', getDocumentsController);

// GET /api/documents/:id (Get single document metadata)
router.get('/:id', getDocumentDetailsController);

// GET /api/documents/:id/file (Stream file content safely)
router.get('/:id/file', getDocumentFileController);

// POST /api/documents/:id/process (Idempotent processing)
router.post('/:id/process', processDocumentController);

// POST /api/documents/:id/reprocess (Force re-processing bypassing cache)
router.post('/:id/reprocess', reprocessDocumentController);

// GET /api/documents/:id/extraction (Get extracted JSON & checks - 0 AI calls)
router.get('/:id/extraction', getDocumentExtractionController);

// GET /api/documents/:id/matches (Get PO match result - 0 AI calls)
router.get('/:id/matches', getDocumentMatchesController);

// POST /api/documents/:id/rematch (Re-run PO matching without re-extraction)
router.post('/:id/rematch', rematchDocumentController);

// DELETE /api/documents/:id (Delete document & file)
router.delete('/:id', deleteDocumentController);

export default router;
