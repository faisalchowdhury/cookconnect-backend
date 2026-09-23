import { Router } from 'express';
import { auth, authorize } from '@/middlewares/auth';
import { uploadSingle } from '@/middlewares/upload';
import { validateRequest } from '@/middlewares/validateRequest';
import * as employerController from './employer.controller';
import { employerIdParamSchema, updateEmployerSchema } from './employer.validation';

const router = Router();

router.get('/me', auth(), authorize('employer'), employerController.getMe);

router.patch(
  '/me',
  auth(),
  authorize('employer'),
  validateRequest({ body: updateEmployerSchema }),
  employerController.updateMe,
);

router.post(
  '/me/logo',
  auth(),
  authorize('employer'),
  uploadSingle('logo'),
  employerController.uploadLogo,
);

router.post(
  '/me/cover',
  auth(),
  authorize('employer'),
  uploadSingle('cover'),
  employerController.uploadCover,
);

router.get(
  '/me/dashboard',
  auth(),
  authorize('employer'),
  employerController.getDashboard,
);

router.get(
  '/:id',
  validateRequest({ params: employerIdParamSchema }),
  employerController.getPublic,
);

export default router;
