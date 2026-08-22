import { Router } from 'express';
import { getPayments, updatePayment } from '../controllers/paymentController.js';

const router = Router();

router.get('/', getPayments);
router.patch('/:id', updatePayment);

export default router;
