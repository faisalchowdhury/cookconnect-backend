import { Router } from 'express';
import { auth, authorize } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as applicationController from './application.controller';
import {
  applicationIdParamSchema,
  createApplicationSchema,
  receivedApplicationsQuerySchema,
  updateApplicationStatusSchema,
} from './application.validation';

const router = Router();

router.post(
  '/',
  auth(),
  authorize('candidate'),
  validateRequest({ body: createApplicationSchema }),
  applicationController.create,
);

router.get('/me', auth(), authorize('candidate'), applicationController.listMine);

router.get(
  '/received',
  auth(),
  authorize('employer'),
  validateRequest({ query: receivedApplicationsQuerySchema }),
  applicationController.listReceived,
);

router.patch(
  '/:id/status',
  auth(),
  authorize('employer'),
  validateRequest({
    params: applicationIdParamSchema,
    body: updateApplicationStatusSchema,
  }),
  applicationController.updateStatus,
);

export default router;
