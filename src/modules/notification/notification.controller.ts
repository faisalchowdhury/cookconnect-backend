import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as notificationService from './notification.service';

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await notificationService.list(req.user!.id, req.query);
  sendResponse({
    res,
    message: 'Notifications retrieved',
    data: result.data,
    meta: result.meta,
  });
});

export const markRead = catchAsync(async (req: Request, res: Response) => {
  const notification = await notificationService.markRead(req.user!.id, String(req.params.id));
  sendResponse({ res, message: 'Notification marked as read', data: notification });
});

export const markAllRead = catchAsync(async (req: Request, res: Response) => {
  const count = await notificationService.markAllRead(req.user!.id);
  sendResponse({ res, message: 'All notifications marked as read', data: { count } });
});
