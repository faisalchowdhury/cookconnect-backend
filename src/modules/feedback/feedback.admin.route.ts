import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as feedbackController from './feedback.controller';
import {
  adminFeedbackListQuerySchema,
  feedbackIdParamSchema,
  replyFeedbackSchema,
} from './feedback.validation';

const router = Router();

router.use(auth(), hasPermission('manage-feedback'));

router.get(
  '/',
  validateRequest({ query: adminFeedbackListQuerySchema }),
  feedbackController.listAdmin,
);

router.post(
  '/:id/reply',
  validateRequest({ params: feedbackIdParamSchema, body: replyFeedbackSchema }),
  feedbackController.reply,
);

export default router;
