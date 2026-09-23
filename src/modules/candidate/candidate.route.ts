import { Router } from 'express';
import { auth, authOptional, authorize } from '@/middlewares/auth';
import { uploadSingle } from '@/middlewares/upload';
import { validateRequest } from '@/middlewares/validateRequest';
import multer from 'multer';
import * as candidateController from './candidate.controller';
import {
  candidateIdParamSchema,
  candidateSearchQuerySchema,
  dishPhotoAssetParamSchema,
  updateCandidateSchema,
} from './candidate.validation';

const router = Router();
const dishUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).array('photos', 8);

router.get(
  '/',
  authOptional(),
  validateRequest({ query: candidateSearchQuerySchema }),
  candidateController.search,
);

router.get('/me', auth(), authorize('candidate'), candidateController.getMe);

router.patch(
  '/me',
  auth(),
  authorize('candidate'),
  validateRequest({ body: updateCandidateSchema }),
  candidateController.updateMe,
);

router.post(
  '/me/photo',
  auth(),
  authorize('candidate'),
  uploadSingle('photo'),
  candidateController.uploadPhoto,
);

router.post(
  '/me/dish-photos',
  auth(),
  authorize('candidate'),
  dishUpload,
  candidateController.uploadDishPhotos,
);

router.delete(
  '/me/dish-photos/:assetId',
  auth(),
  authorize('candidate'),
  validateRequest({ params: dishPhotoAssetParamSchema }),
  candidateController.deleteDishPhoto,
);

router.post(
  '/me/cv',
  auth(),
  authorize('candidate'),
  uploadSingle('cv'),
  candidateController.uploadCv,
);

router.get(
  '/:id',
  authOptional(),
  validateRequest({ params: candidateIdParamSchema }),
  candidateController.findById,
);

export default router;
