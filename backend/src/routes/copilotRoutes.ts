import { Router } from 'express';
import { askCopilot } from '../controllers/copilotController.js';

const router = Router();

router.post('/ask', askCopilot);

export default router;
