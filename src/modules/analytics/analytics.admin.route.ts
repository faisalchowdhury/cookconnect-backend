import { Router } from 'express';
import { auth, hasPermission } from '@/middlewares/auth';
import { validateRequest } from '@/middlewares/validateRequest';
import * as analyticsController from './analytics.controller';
import { growthQuerySchema, statisticsQuerySchema } from './analytics.validation';

const dashboardRouter = Router();
const statisticsRouter = Router();

dashboardRouter.use(auth(), hasPermission('view-statistics'));

dashboardRouter.get('/stats', analyticsController.stats);
dashboardRouter.get(
  '/growth',
  validateRequest({ query: growthQuerySchema }),
  analyticsController.growth,
);
dashboardRouter.get('/market', analyticsController.market);

statisticsRouter.use(auth(), hasPermission('view-statistics'));
statisticsRouter.get(
  '/',
  validateRequest({ query: statisticsQuerySchema }),
  analyticsController.statistics,
);

export { dashboardRouter, statisticsRouter };
