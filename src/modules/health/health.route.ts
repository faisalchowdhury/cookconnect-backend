import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';

const router = Router();

router.get(
  '/',
  catchAsync(async (_req: Request, res: Response) => {
    sendResponse({ res, message: 'OK', data: { status: 'ok' } });
  }),
);

router.get(
  '/ready',
  catchAsync(async (_req: Request, res: Response) => {
    const ready = mongoose.connection.readyState === 1;
    sendResponse({
      res,
      statusCode: ready ? 200 : 503,
      message: ready ? 'Ready' : 'Database not connected',
      data: {
        status: ready ? 'ready' : 'not-ready',
        database: mongoose.connection.readyState,
      },
    });
  }),
);

export default router;
