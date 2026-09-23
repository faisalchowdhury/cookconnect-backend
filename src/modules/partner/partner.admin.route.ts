import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as partnerController from './partner.controller';
import {
  adminPartnerListQuerySchema,
  createPartnerSchema,
  partnerIdParamSchema,
  updatePartnerSchema,
} from './partner.validation';

const router = Router();

router.use(auth(), hasPermission('manage-banners'));

router.get(
  '/',
  validateRequest({ query: adminPartnerListQuerySchema }),
  partnerController.listAdmin,
);

router.post('/', validateRequest({ body: createPartnerSchema }), partnerController.create);

router.patch(
  '/:id',
  validateRequest({ params: partnerIdParamSchema, body: updatePartnerSchema }),
  partnerController.update,
);

router.delete(
  '/:id',
  validateRequest({ params: partnerIdParamSchema }),
  partnerController.remove,
);

export default router;
