import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as siteSettingsService from './siteSettings.service';

export const getPublic = catchAsync(async (_req: Request, res: Response) => {
  const data = await siteSettingsService.getPublic();
  sendResponse({ res, message: 'Site settings retrieved', data });
});

export const getAdmin = catchAsync(async (_req: Request, res: Response) => {
  const data = await siteSettingsService.getAdmin();
  sendResponse({ res, message: 'Site settings retrieved', data });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const data = await siteSettingsService.update(req.body);
  sendResponse({ res, message: 'Site settings updated', data });
});
