import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as taxonomyService from './taxonomy.service';

export const getAll = catchAsync(async (_req: Request, res: Response) => {
  const data = await taxonomyService.getAll();
  sendResponse({ res, message: 'Taxonomies retrieved', data });
});

export const getPositionsBySector = catchAsync(async (req: Request, res: Response) => {
  const sectorId = String(req.query.sectorId ?? '').trim();
  if (!sectorId) {
    sendResponse({ res, message: 'Positions retrieved', data: [] });
    return;
  }
  const data = await taxonomyService.getPositionsBySector(sectorId);
  sendResponse({ res, message: 'Positions retrieved', data });
});
