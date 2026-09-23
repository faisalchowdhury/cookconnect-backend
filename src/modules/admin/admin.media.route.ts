import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { uploadSingle } from '@/middlewares/upload';
import { validateRequest } from '@/middlewares/validateRequest';
import * as adminMediaController from './admin.media.controller';
import { adminMediaUploadSchema } from './admin.validation';

const router = Router();

router.use(auth(), hasPermission('manage-homepage'));

router.post(
  '/',
  uploadSingle('file'),
  validateRequest({ body: adminMediaUploadSchema }),
  adminMediaController.upload,
);

export default router;
