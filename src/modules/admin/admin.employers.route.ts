import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import { employerIdParamSchema } from '@/modules/employer/employer.validation';
import * as adminEmployersController from './admin.employers.controller';
import {
  adminEmployerListQuerySchema,
  employerBlockSchema,
  employerDecisionSchema,
} from './admin.validation';

const router = Router();

router.use(auth(), hasPermission('manage-employers'));

router.get(
  '/',
  validateRequest({ query: adminEmployerListQuerySchema }),
  adminEmployersController.list,
);

router.get('/requests', adminEmployersController.requests);

router.get(
  '/:id/activity',
  validateRequest({ params: employerIdParamSchema }),
  adminEmployersController.getActivity,
);

router.get(
  '/:id',
  validateRequest({ params: employerIdParamSchema }),
  adminEmployersController.findById,
);

router.patch(
  '/:id/decision',
  validateRequest({ params: employerIdParamSchema, body: employerDecisionSchema }),
  adminEmployersController.decision,
);

router.patch(
  '/:id/block',
  validateRequest({ params: employerIdParamSchema, body: employerBlockSchema }),
  adminEmployersController.block,
);

export default router;
