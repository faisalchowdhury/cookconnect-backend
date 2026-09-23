import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as partnerService from './partner.service';

export const listPublic = catchAsync(async (_req: Request, res: Response) => {
  const data = await partnerService.listPublic();
  sendResponse({ res, message: 'Partners retrieved', data });
});

export const listAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await partnerService.adminList(req.query);
  sendResponse({ res, message: 'Partners retrieved', data: result.data, meta: result.meta });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const partner = await partnerService.create(req.body);
  sendResponse({ res, statusCode: 201, message: 'Partner created', data: partner });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const partner = await partnerService.update(String(req.params.id), req.body);
  sendResponse({ res, message: 'Partner updated', data: partner });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const partner = await partnerService.remove(String(req.params.id));
  sendResponse({ res, message: 'Partner deleted', data: partner });
});
