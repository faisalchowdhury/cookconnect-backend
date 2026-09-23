import { Router } from 'express';
import { auth } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as notificationController from './notification.controller';
import {
  notificationIdParamSchema,
  notificationListQuerySchema,
} from './notification.validation';

const router = Router();

router.use(auth());

router.get(
  '/',
  validateRequest({ query: notificationListQuerySchema }),
  notificationController.list,
);

router.patch('/read-all', notificationController.markAllRead);

router.patch(
  '/:id/read',
  validateRequest({ params: notificationIdParamSchema }),
  notificationController.markRead,
);

export default router;
