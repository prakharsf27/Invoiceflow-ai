import { Router } from 'express';
import { getSuppliers, getSupplierById } from '../controllers/supplierController.js';

const router = Router();

router.get('/', getSuppliers);
router.get('/:id', getSupplierById);

export default router;
