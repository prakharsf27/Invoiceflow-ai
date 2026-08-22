import { Router } from 'express';
import { testGemini, getAiStatus, analyzeInvoiceRiskController } from '../controllers/aiController.js';

const router = Router();

// Test prompt generation
router.post('/test', testGemini);

// Status check
router.get('/status', getAiStatus);

// AI Risk Analysis
router.post('/analyze-invoice/:id', analyzeInvoiceRiskController);
router.get('/analyze-invoice/:id', analyzeInvoiceRiskController);

export default router;
