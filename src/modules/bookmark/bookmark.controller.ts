import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as bookmarkService from './bookmark.service';

export const listProfiles = catchAsync(async (req: Request, res: Response) => {
  const data = await bookmarkService.list(req.user!.id, 'saved-profile');
  sendResponse({ res, message: 'Saved profiles retrieved', data });
});

export const createProfile = catchAsync(async (req: Request, res: Response) => {
  const bookmark = await bookmarkService.create({
    ownerUserId: req.user!.id,
    kind: 'saved-profile',
    targetId: req.body.targetId,
    note: req.body.note,
  });
  sendResponse({ res, statusCode: 201, message: 'Profile saved', data: bookmark });
});

export const deleteProfile = catchAsync(async (req: Request, res: Response) => {
  await bookmarkService.remove(req.user!.id, 'saved-profile', req.query.targetId as string);
  sendResponse({ res, message: 'Profile bookmark removed', data: null });
});

export const listJobs = catchAsync(async (req: Request, res: Response) => {
  const data = await bookmarkService.list(req.user!.id, 'saved-job');
  sendResponse({ res, message: 'Saved jobs retrieved', data });
});

export const createJob = catchAsync(async (req: Request, res: Response) => {
  const bookmark = await bookmarkService.create({
    ownerUserId: req.user!.id,
    kind: 'saved-job',
    targetId: req.body.targetId,
    note: req.body.note,
  });
  sendResponse({ res, statusCode: 201, message: 'Job saved', data: bookmark });
});

export const deleteJob = catchAsync(async (req: Request, res: Response) => {
  await bookmarkService.remove(req.user!.id, 'saved-job', req.query.targetId as string);
  sendResponse({ res, message: 'Job bookmark removed', data: null });
});
