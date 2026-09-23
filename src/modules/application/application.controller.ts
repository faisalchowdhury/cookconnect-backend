import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as applicationService from './application.service';

export const create = catchAsync(async (req: Request, res: Response) => {
  const application = await applicationService.create({
    jobId: req.body.jobId,
    candidateUserId: req.user!.id,
    coverNote: req.body.coverNote,
  });
  sendResponse({ res, statusCode: 201, message: 'Application submitted', data: application });
});

export const listMine = catchAsync(async (req: Request, res: Response) => {
  const data = await applicationService.listMine(req.user!.id);
  sendResponse({ res, message: 'Applications retrieved', data });
});

export const listReceived = catchAsync(async (req: Request, res: Response) => {
  const data = await applicationService.listReceived(req.user!.id, req.query.status as string | undefined);
  sendResponse({ res, message: 'Received applications retrieved', data });
});

export const updateStatus = catchAsync(async (req: Request, res: Response) => {
  const application = await applicationService.updateStatus(String(req.params.id), {
    status: req.body.status,
    note: req.body.note,
    employerUserId: req.user!.id,
  });
  sendResponse({ res, message: 'Application status updated', data: application });
});
