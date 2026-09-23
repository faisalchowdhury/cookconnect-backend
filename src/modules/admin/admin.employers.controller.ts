import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as employerService from '@/modules/employer/employer.service';

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await employerService.adminList(req.query);
  sendResponse({ res, message: 'Employers retrieved', data: result.data, meta: result.meta });
});

export const findById = catchAsync(async (req: Request, res: Response) => {
  const employer = await employerService.adminFindByIdEnriched(String(req.params.id));
  sendResponse({ res, message: 'Employer retrieved', data: employer });
});

export const getActivity = catchAsync(async (req: Request, res: Response) => {
  const activity = await employerService.getActivity(String(req.params.id));
  sendResponse({ res, message: 'Employer activity retrieved', data: activity });
});

export const requests = catchAsync(async (_req: Request, res: Response) => {
  const data = await employerService.adminRequests();
  sendResponse({ res, message: 'Pending employer requests retrieved', data });
});

export const decision = catchAsync(async (req: Request, res: Response) => {
  const employer = await employerService.adminDecision(String(req.params.id), {
    status: req.body.status,
    adminUserId: req.user!.id,
    rejectionReason: req.body.rejectionReason,
  });
  sendResponse({ res, message: 'Employer decision recorded', data: employer });
});

export const block = catchAsync(async (req: Request, res: Response) => {
  const employer = await employerService.adminBlock(
    String(req.params.id),
    req.body.blocked,
    req.body.reason,
    req.user!.id,
  );
  sendResponse({ res, message: 'Employer block status updated', data: employer });
});
