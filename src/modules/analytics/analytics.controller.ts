import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as analyticsService from './analytics.service';

export const stats = catchAsync(async (_req: Request, res: Response) => {
  const data = await analyticsService.getStats();
  sendResponse({ res, message: 'Dashboard stats retrieved', data });
});

export const growth = catchAsync(async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  const metric = (req.query.metric as 'cooks' | 'restaurants') || 'cooks';
  const data = await analyticsService.getGrowth(year, metric);
  sendResponse({ res, message: 'Growth data retrieved', data: { year, metric, buckets: data } });
});

export const market = catchAsync(async (_req: Request, res: Response) => {
  const data = await analyticsService.getMarket();
  sendResponse({ res, message: 'Market data retrieved', data });
});

export const statistics = catchAsync(async (req: Request, res: Response) => {
  const days = Number(req.query.days) || 30;
  const data = await analyticsService.getStatistics(days);
  sendResponse({ res, message: 'Statistics retrieved', data });
});
