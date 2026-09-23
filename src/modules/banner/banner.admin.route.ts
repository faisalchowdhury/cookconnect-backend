import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as bannerController from './banner.controller';
import {
  adminBannerListQuerySchema,
  bannerIdParamSchema,
  createBannerSchema,
  updateBannerSchema,
} from './banner.validation';

const router = Router();

router.use(auth(), hasPermission('manage-banners'));

router.get(
  '/',
  validateRequest({ query: adminBannerListQuerySchema }),
  bannerController.listAdmin,
);

router.post('/', validateRequest({ body: createBannerSchema }), bannerController.create);

router.patch(
  '/:id',
  validateRequest({ params: bannerIdParamSchema, body: updateBannerSchema }),
  bannerController.update,
);

router.delete(
  '/:id',
  validateRequest({ params: bannerIdParamSchema }),
  bannerController.remove,
);

export default router;
