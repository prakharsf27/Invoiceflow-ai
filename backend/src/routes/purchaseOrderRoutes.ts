import { Router } from 'express';
import {
  getPurchaseOrders,
  getPOById,
  updatePO,
  acceptPOVariance,
  requestPOClarification,
} from '../controllers/purchaseOrderController.js';

const router = Router();

router.get('/', getPurchaseOrders);
router.get('/:id', getPOById);
router.patch('/:id', updatePO);
router.patch('/:id/accept-variance', acceptPOVariance);
router.patch('/:id/request-clarification', requestPOClarification);

export default router;
