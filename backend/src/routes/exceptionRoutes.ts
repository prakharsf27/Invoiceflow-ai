import { Router } from 'express';
import { getExceptions, updateException } from '../controllers/exceptionController.js';

const router = Router();

router.get('/', getExceptions);
router.patch('/:id', updateException);

export default router;
