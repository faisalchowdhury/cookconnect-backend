import { Router } from 'express';
import { auth, authOptional, authorize } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as jobController from './job.controller';
import {
  createJobSchema,
  featuredJobsQuerySchema,
  jobIdParamSchema,
  jobSearchQuerySchema,
  reportJobSchema,
  updateJobSchema,
} from './job.validation';

const router = Router();

router.get(
  '/',
  authOptional(),
  validateRequest({ query: jobSearchQuerySchema }),
  jobController.search,
);

router.get(
  '/featured',
  validateRequest({ query: featuredJobsQuerySchema }),
  jobController.featured,
);

router.get('/me/list', auth(), authorize('employer'), jobController.listMine);

router.get(
  '/:id',
  authOptional(),
  validateRequest({ params: jobIdParamSchema }),
  jobController.findById,
);

router.post(
  '/',
  auth(),
  authorize('employer'),
  validateRequest({ body: createJobSchema }),
  jobController.create,
);

router.patch(
  '/:id',
  auth(),
  authorize('employer'),
  validateRequest({ params: jobIdParamSchema, body: updateJobSchema }),
  jobController.update,
);

router.post(
  '/:id/close',
  auth(),
  authorize('employer'),
  validateRequest({ params: jobIdParamSchema }),
  jobController.close,
);

router.post(
  '/:id/republish',
  auth(),
  authorize('employer'),
  validateRequest({ params: jobIdParamSchema }),
  jobController.republish,
);

router.post(
  '/:id/report',
  authOptional(),
  validateRequest({ params: jobIdParamSchema, body: reportJobSchema }),
  jobController.report,
);

export default router;
