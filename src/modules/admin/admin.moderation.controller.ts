import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as activityLogService from '@/modules/activityLog/activityLog.service';
import * as candidateService from '@/modules/candidate/candidate.service';
import type { ModerationStatus } from '@/modules/media/media.interface';
import * as mediaService from '@/modules/media/media.service';
import * as notificationService from '@/modules/notification/notification.service';

function pageOf(req: Request): { limit: number; skip: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 100);
  return { limit, skip: (page - 1) * limit };
}

export const listPhotos = catchAsync(async (req: Request, res: Response) => {
  const { limit, skip } = pageOf(req);
  const status = (req.query.status as ModerationStatus | undefined) ?? 'pending';

  const assets = await mediaService.listByStatus(status, limit, skip);
  // Moderators may lack manage-candidates, so the uploader is summarised here.
  const owners = await candidateService.summariesByUserIds(
    assets.map((asset) => asset.ownerUserId),
  );

  const data = assets.map((asset) => {
    const candidate = owners.get(String(asset.ownerUserId)) ?? null;
    return {
      ...(asset.toJSON() as unknown as Record<string, unknown>),
      candidateId: candidate?.id ?? null,
      candidate,
    };
  });

  sendResponse({ res, message: 'Photos retrieved', data });
});

export const decidePhoto = catchAsync(async (req: Request, res: Response) => {
  const asset = await mediaService.decideModeration(String(req.params.id), {
    status: req.body.status,
    reason: req.body.reason,
    reviewedBy: req.user!.id,
  });

  await activityLogService.log({
    actorUserId: req.user!.id,
    actorLabel: 'Admin',
    action: req.body.status === 'approved' ? 'photo.approved' : 'photo.rejected',
    targetType: 'media',
    targetId: String(asset._id),
    detail: {
      fr:
        req.body.status === 'approved'
          ? 'Photo approuvée'
          : `Photo refusée${req.body.reason ? ` : ${req.body.reason}` : ''}`,
      en:
        req.body.status === 'approved'
          ? 'Photo approved'
          : `Photo rejected${req.body.reason ? `: ${req.body.reason}` : ''}`,
    },
  });

  if (req.body.status === 'rejected') {
    await candidateService.detachRejectedMedia(asset);
    await notificationService.notifyPhotoRejected(asset, req.body.reason);
  }

  sendResponse({ res, message: 'Moderation decision recorded', data: asset });
});

export const listReports = catchAsync(async (req: Request, res: Response) => {
  const { limit, skip } = pageOf(req);
  const data = await mediaService.listReports(limit, skip);
  sendResponse({ res, message: 'Reports retrieved', data });
});
