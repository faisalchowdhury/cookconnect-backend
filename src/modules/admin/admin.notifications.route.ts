import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as adminNotificationsController from './admin.notifications.controller';
import { adminOutboxQuerySchema } from './admin.validation';

const router = Router();

// Matches the dashboard's /settings/notifications gate.
router.use(auth(), hasPermission('manage-feedback'));

router.get(
  '/outbox',
  validateRequest({ query: adminOutboxQuerySchema }),
  adminNotificationsController.outbox,
);

export default router;
