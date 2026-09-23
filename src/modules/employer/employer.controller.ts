import { Request, Response } from 'express';
import { ApiError } from '@/shared/ApiError';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as employerService from './employer.service';

export const getMe = catchAsync(async (req: Request, res: Response) => {
  const data = await employerService.getMe(req.user!.id);
  sendResponse({ res, message: 'Profile retrieved', data });
});

export const updateMe = catchAsync(async (req: Request, res: Response) => {
  const data = await employerService.updateMe(req.user!.id, req.body);
  sendResponse({ res, message: 'Profile updated', data });
});

export const uploadLogo = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(422, 'No file uploaded');
  }
  const data = await employerService.uploadLogo(req.user!.id, req.file);
  sendResponse({ res, message: 'Logo uploaded', data });
});

export const uploadCover = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(422, 'No file uploaded');
  }
  const data = await employerService.uploadCover(req.user!.id, req.file);
  sendResponse({ res, message: 'Cover uploaded', data });
});

export const getDashboard = catchAsync(async (req: Request, res: Response) => {
  const data = await employerService.getDashboardCounters(req.user!.id);
  sendResponse({ res, message: 'Dashboard counters retrieved', data });
});

export const getPublic = catchAsync(async (req: Request, res: Response) => {
  const data = await employerService.getPublic(String(req.params.id));
  if (!data) {
    throw new ApiError(404, 'Employer not found');
  }
  sendResponse({ res, message: 'Employer retrieved', data });
});
