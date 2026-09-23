import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import * as bannerController from './banner.controller';
import { bannerIdParamSchema, publicBannerQuerySchema } from './banner.validation';

const router = Router();

router.get(
  '/',
  validateRequest({ query: publicBannerQuerySchema }),
  bannerController.listPublic,
);

router.post(
  '/:id/click',
  validateRequest({ params: bannerIdParamSchema }),
  bannerController.click,
);

export default router;
