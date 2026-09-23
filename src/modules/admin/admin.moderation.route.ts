import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as adminModerationController from './admin.moderation.controller';
import {
  mediaIdParamSchema,
  moderationDecisionSchema,
  moderationPhotosQuerySchema,
} from './admin.validation';

const router = Router();

router.use(auth(), hasPermission('approve-photos'));

router.get(
  '/photos',
  validateRequest({ query: moderationPhotosQuerySchema }),
  adminModerationController.listPhotos,
);

router.patch(
  '/photos/:id',
  validateRequest({ params: mediaIdParamSchema, body: moderationDecisionSchema }),
  adminModerationController.decidePhoto,
);

router.get('/reports', adminModerationController.listReports);

export default router;
