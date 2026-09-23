import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as siteSettingsController from './siteSettings.controller';
import { updateSiteSettingsSchema } from './siteSettings.validation';

const router = Router();

router.use(auth(), hasPermission('manage-homepage'));

router.get('/', siteSettingsController.getAdmin);

router.patch(
  '/',
  validateRequest({ body: updateSiteSettingsSchema }),
  siteSettingsController.update,
);

export default router;
