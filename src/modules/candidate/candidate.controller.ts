import { Request, Response } from 'express';
import { ApiError } from '@/shared/ApiError';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as candidateService from './candidate.service';

export const search = catchAsync(async (req: Request, res: Response) => {
  const isGuest = !req.user;
  const result = await candidateService.search(req.query, isGuest);
  sendResponse({ res, message: 'Candidates retrieved', data: result.data, meta: result.meta });
});

export const getMe = catchAsync(async (req: Request, res: Response) => {
  const data = await candidateService.getMe(req.user!.id);
  sendResponse({ res, message: 'Profile retrieved', data });
});

export const updateMe = catchAsync(async (req: Request, res: Response) => {
  const data = await candidateService.updateMe(req.user!.id, req.body);
  sendResponse({ res, message: 'Profile updated', data });
});

export const uploadPhoto = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(422, 'No file uploaded');
  }
  const data = await candidateService.uploadPhoto(req.user!.id, req.file);
  sendResponse({ res, message: 'Profile photo uploaded', data });
});

export const uploadDishPhotos = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) {
    throw new ApiError(422, 'No files uploaded');
  }
  const data = await candidateService.uploadDishPhotos(req.user!.id, files);
  sendResponse({ res, message: 'Dish photos uploaded', data });
});

export const deleteDishPhoto = catchAsync(async (req: Request, res: Response) => {
  const data = await candidateService.deleteDishPhoto(req.user!.id, String(req.params.assetId));
  sendResponse({ res, message: 'Dish photo removed', data });
});

export const uploadCv = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(422, 'No file uploaded');
  }
  const data = await candidateService.uploadCv(req.user!.id, req.file);
  sendResponse({ res, message: 'CV uploaded', data });
});

export const findById = catchAsync(async (req: Request, res: Response) => {
  const viewer = req.user
    ? {
        id: req.user.id,
        role: req.user.role,
        permissions: req.user.permissions,
        adminLevel: req.user.adminLevel,
      }
    : null;

  const data = await candidateService.findPublicById(String(req.params.id), viewer, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (!data) {
    throw new ApiError(404, 'Candidate not found');
  }

  sendResponse({ res, message: 'Candidate retrieved', data });
});
