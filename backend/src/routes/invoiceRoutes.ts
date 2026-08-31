import { Router } from 'express';
import multer from 'multer';
import {
  getInvoices,
  getInvoiceById,
  createInvoice,
  uploadInvoice,
  updateInvoice,
  approveInvoice,
  holdInvoice,
  deleteInvoice,
} from '../controllers/invoiceController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

const router = Router();

router.get('/', getInvoices);
router.post('/', createInvoice);
router.post('/upload', upload.single('file'), uploadInvoice);

router.get('/:id', getInvoiceById);
router.patch('/:id/approve', approveInvoice);
router.patch('/:id/hold', holdInvoice);
router.patch('/:id', updateInvoice);
router.delete('/:id', deleteInvoice);

export default router;
