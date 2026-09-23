import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as jobService from './job.service';

export const listByEmployer = catchAsync(async (_req: Request, res: Response) => {
  const data = await jobService.adminListByEmployer();
  sendResponse({ res, message: 'Jobs by employer retrieved', data });
});

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await jobService.adminList(req.query);
  sendResponse({ res, message: 'Jobs retrieved', data: result.data, meta: result.meta });
});

export const findById = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.adminFindById(String(req.params.id));
  sendResponse({ res, message: 'Job retrieved', data: job });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.adminUpdate(String(req.params.id), {
    ...req.body,
    adminUserId: req.user!.id,
  });
  sendResponse({ res, message: 'Job updated', data: job });
});

export const decision = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.adminDecision(String(req.params.id), {
    ...req.body,
    adminUserId: req.user!.id,
  });
  sendResponse({ res, message: 'Job decision recorded', data: job });
});

export const close = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.adminClose(String(req.params.id), req.user!.id);
  sendResponse({ res, message: 'Job closed', data: job });
});

export const republish = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.adminRepublish(String(req.params.id), req.user!.id);
  sendResponse({ res, message: 'Job republished', data: job });
});

export const extend = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.adminExtend(String(req.params.id), {
    extendedUntil: req.body.extendedUntil,
    adminUserId: req.user!.id,
  });
  sendResponse({ res, message: 'Job extended', data: job });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.adminDelete(String(req.params.id), req.user!.id);
  sendResponse({ res, message: 'Job deleted', data: job });
});
