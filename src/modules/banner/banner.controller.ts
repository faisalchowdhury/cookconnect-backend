import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as bannerService from './banner.service';

export const listPublic = catchAsync(async (req: Request, res: Response) => {
  const data = await bannerService.listPublic(req.query);
  if (data.length > 0) {
    await bannerService.recordImpressions(
      data.map((banner) => String(banner.id || banner._id)),
    );
  }
  sendResponse({ res, message: 'Banners retrieved', data });
});

export const click = catchAsync(async (req: Request, res: Response) => {
  const banner = await bannerService.recordClick(String(req.params.id));
  sendResponse({ res, message: 'Click recorded', data: banner });
});

export const listAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await bannerService.adminList(req.query);
  sendResponse({ res, message: 'Banners retrieved', data: result.data, meta: result.meta });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const banner = await bannerService.create(req.body);
  sendResponse({ res, statusCode: 201, message: 'Banner created', data: banner });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const banner = await bannerService.update(String(req.params.id), req.body);
  sendResponse({ res, message: 'Banner updated', data: banner });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const banner = await bannerService.remove(String(req.params.id));
  sendResponse({ res, message: 'Banner deleted', data: banner });
});
