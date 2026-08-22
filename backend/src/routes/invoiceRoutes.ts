import { Router } from 'express';
import multer from 'multer';
import {
  getInvoices,
  getInvoiceById,
  createInvoice,
  uploadInvoice,
  updateInvoice,
  deleteInvoice,
} from '../controllers/invoiceController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

const router = Router();

router.get('/', getInvoices);
router.get('/:id', getInvoiceById);
router.post('/', createInvoice);
router.post('/upload', upload.single('file'), uploadInvoice);
router.patch('/:id', updateInvoice);
router.delete('/:id', deleteInvoice);

export default router;
