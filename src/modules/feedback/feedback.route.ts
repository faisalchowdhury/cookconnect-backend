import { Router } from 'express';
import { auth } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as feedbackController from './feedback.controller';
import { createFeedbackSchema } from './feedback.validation';

const router = Router();

router.post(
  '/',
  auth(),
  validateRequest({ body: createFeedbackSchema }),
  feedbackController.create,
);

export default router;
