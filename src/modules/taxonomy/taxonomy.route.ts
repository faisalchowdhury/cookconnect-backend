import { Router } from 'express';
import { validateRequest } from '@/middlewares/validateRequest';
import * as taxonomyController from './taxonomy.controller';
import { positionsBySectorQuerySchema } from './taxonomy.validation';

const router = Router();

router.get('/', taxonomyController.getAll);

router.get(
  '/positions',
  validateRequest({ query: positionsBySectorQuerySchema }),
  taxonomyController.getPositionsBySector,
);

export default router;
