import { Router } from 'express';
import { getPurchaseOrders, getPOById } from '../controllers/purchaseOrderController.js';

const router = Router();

router.get('/', getPurchaseOrders);
router.get('/:id', getPOById);

export default router;
