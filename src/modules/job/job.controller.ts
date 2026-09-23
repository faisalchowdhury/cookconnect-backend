import { Request, Response } from 'express';
import { ApiError } from '@/shared/ApiError';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as jobService from './job.service';

export const search = catchAsync(async (req: Request, res: Response) => {
  const isGuest = !req.user;
  const result = await jobService.search(req.query, isGuest);
  sendResponse({ res, message: 'Jobs retrieved', data: result.data, meta: result.meta });
});

export const featured = catchAsync(async (req: Request, res: Response) => {
  const data = await jobService.featured(Number(req.query.limit) || undefined);
  sendResponse({ res, message: 'Featured jobs retrieved', data });
});

export const listMine = catchAsync(async (req: Request, res: Response) => {
  const data = await jobService.listMine(req.user!.id);
  sendResponse({ res, message: 'Your jobs retrieved', data });
});

export const findById = catchAsync(async (req: Request, res: Response) => {
  const viewer = req.user ? { id: req.user.id, role: req.user.role } : null;
  const job = await jobService.findVisibleById(String(req.params.id), viewer);
  if (!job) {
    throw new ApiError(404, 'Job not found');
  }
  sendResponse({ res, message: 'Job retrieved', data: job });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.create({ ...req.body, employerUserId: req.user!.id });
  sendResponse({ res, statusCode: 201, message: 'Job created', data: job });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.update(String(req.params.id), req.user!.id, req.body);
  sendResponse({ res, message: 'Job updated', data: job });
});

export const close = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.close(String(req.params.id), req.user!.id);
  sendResponse({ res, message: 'Job closed', data: job });
});

export const republish = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.republish(String(req.params.id), req.user!.id);
  sendResponse({ res, message: 'Job submitted for republication', data: job });
});

export const report = catchAsync(async (req: Request, res: Response) => {
  const job = await jobService.report(String(req.params.id), req.body.reason, req.user?.id);
  sendResponse({ res, message: 'Job reported', data: job });
});
