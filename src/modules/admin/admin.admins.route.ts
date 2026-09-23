import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as adminController from './admin.controller';
import {
  adminIdParamSchema,
  createAdminSchema,
  updateAdminPermissionsSchema,
} from './admin.validation';

const router = Router();

router.use(auth(), hasPermission('manage-admins'));

router.get('/', adminController.listAdmins);
router.post('/', validateRequest({ body: createAdminSchema }), adminController.createAdmin);

router.patch(
  '/:id',
  validateRequest({ params: adminIdParamSchema, body: updateAdminPermissionsSchema }),
  adminController.updateAdmin,
);

router.delete(
  '/:id',
  validateRequest({ params: adminIdParamSchema }),
  adminController.disableAdmin,
);

export default router;
