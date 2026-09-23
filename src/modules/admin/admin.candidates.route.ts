import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as adminCandidatesController from './admin.candidates.controller';
import {
  addCandidateSkillSchema,
  adminCandidateFindQuerySchema,
  adminCandidateListQuerySchema,
  adminUpdateCandidateSchema,
  candidateIdParamSchema,
  candidateSkillParamSchema,
  setCandidateStatusSchema,
  setVerificationSchema,
} from './admin.validation';

const router = Router();

router.use(auth());

router.get(
  '/export',
  hasPermission('export-cv'),
  adminCandidatesController.exportCsv,
);

router.get(
  '/',
  hasPermission('manage-candidates'),
  validateRequest({ query: adminCandidateListQuerySchema }),
  adminCandidatesController.list,
);

router.get(
  '/:id/applications',
  hasPermission('manage-candidates'),
  validateRequest({ params: candidateIdParamSchema }),
  adminCandidatesController.listApplications,
);

router.get(
  '/:id/history',
  hasPermission('manage-candidates'),
  validateRequest({ params: candidateIdParamSchema }),
  adminCandidatesController.getHistory,
);

router.get(
  '/:id',
  hasPermission('manage-candidates'),
  validateRequest({ params: candidateIdParamSchema, query: adminCandidateFindQuerySchema }),
  adminCandidatesController.findById,
);

router.patch(
  '/:id',
  hasPermission('manage-candidates'),
  validateRequest({ params: candidateIdParamSchema, body: adminUpdateCandidateSchema }),
  adminCandidatesController.update,
);

router.post(
  '/:id/skills',
  hasPermission('manage-candidates'),
  validateRequest({ params: candidateIdParamSchema, body: addCandidateSkillSchema }),
  adminCandidatesController.addSkill,
);

router.delete(
  '/:id/skills/:skillId',
  hasPermission('manage-candidates'),
  validateRequest({ params: candidateSkillParamSchema }),
  adminCandidatesController.removeSkill,
);

router.patch(
  '/:id/verification',
  hasPermission('manage-candidates'),
  validateRequest({ params: candidateIdParamSchema, body: setVerificationSchema }),
  adminCandidatesController.setVerification,
);

router.patch(
  '/:id/status',
  hasPermission('manage-candidates'),
  validateRequest({ params: candidateIdParamSchema, body: setCandidateStatusSchema }),
  adminCandidatesController.setStatus,
);

router.delete(
  '/:id',
  hasPermission('delete-users'),
  validateRequest({ params: candidateIdParamSchema }),
  adminCandidatesController.remove,
);

export default router;
