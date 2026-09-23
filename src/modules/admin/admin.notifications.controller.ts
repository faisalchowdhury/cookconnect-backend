import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as notificationService from '@/modules/notification/notification.service';

export const outbox = catchAsync(async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 100;
  const data = await notificationService.listAdminOutbox(limit);
  sendResponse({ res, message: 'Notification outbox retrieved', data });
});
