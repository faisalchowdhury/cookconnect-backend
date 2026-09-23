import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as taxonomyAdminController from './taxonomy.admin.controller';
import {
  createTaxonomySchema,
  taxonomyKeyParamsSchema,
  updateTaxonomySchema,
} from './taxonomy.admin.validation';

const router = Router();

router.use(auth(), hasPermission('manage-admins'));

router.post('/', validateRequest({ body: createTaxonomySchema }), taxonomyAdminController.create);

router.patch(
  '/:type/:key',
  validateRequest({ params: taxonomyKeyParamsSchema, body: updateTaxonomySchema }),
  taxonomyAdminController.update,
);

router.delete(
  '/:type/:key',
  validateRequest({ params: taxonomyKeyParamsSchema }),
  taxonomyAdminController.remove,
);

export default router;
