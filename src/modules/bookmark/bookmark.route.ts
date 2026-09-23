import { Router } from 'express';
import { auth, authorize } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as bookmarkController from './bookmark.controller';
import {
  createJobBookmarkSchema,
  createProfileBookmarkSchema,
  deleteBookmarkQuerySchema,
} from './bookmark.validation';

const router = Router();

router.get('/profiles', auth(), authorize('employer'), bookmarkController.listProfiles);

router.post(
  '/profiles',
  auth(),
  authorize('employer'),
  validateRequest({ body: createProfileBookmarkSchema }),
  bookmarkController.createProfile,
);

router.delete(
  '/profiles',
  auth(),
  authorize('employer'),
  validateRequest({ query: deleteBookmarkQuerySchema }),
  bookmarkController.deleteProfile,
);

router.get('/jobs', auth(), authorize('candidate'), bookmarkController.listJobs);

router.post(
  '/jobs',
  auth(),
  authorize('candidate'),
  validateRequest({ body: createJobBookmarkSchema }),
  bookmarkController.createJob,
);

router.delete(
  '/jobs',
  auth(),
  authorize('candidate'),
  validateRequest({ query: deleteBookmarkQuerySchema }),
  bookmarkController.deleteJob,
);

export default router;
