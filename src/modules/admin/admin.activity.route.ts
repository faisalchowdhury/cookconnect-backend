import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as adminActivityController from './admin.activity.controller';
import { activityListQuerySchema } from './admin.validation';

const router = Router();

// The audit trail includes who viewed candidate contacts; the dashboard gates it the same way.
router.use(auth(), hasPermission('view-activity'));

router.get(
  '/',
  validateRequest({ query: activityListQuerySchema }),
  adminActivityController.list,
);

export default router;
