import { Request, Response } from 'express';
import { ApiError } from '@/shared/ApiError';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as mediaService from '@/modules/media/media.service';

export const upload = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(422, 'No file uploaded');
  }

  const kind = (req.body.kind as 'homepage' | 'banner') || 'homepage';
  const data = await mediaService.adminUpload(req.user!.id, kind, req.file);
  sendResponse({ res, statusCode: 201, message: 'Media uploaded', data });
});
