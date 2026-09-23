import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { paginationMeta, QueryBuilder } from '@/shared/QueryBuilder';
import { sendResponse } from '@/shared/sendResponse';
import {
  activityTypeFromAction,
  buildActivityListFilter,
} from '@/modules/activityLog/activityLog.service';
import { ActivityLog } from '@/modules/activityLog/activityLog.model';
import { IActivityLogDocument } from '@/modules/activityLog/activityLog.interface';

export const list = catchAsync(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 100);

  const filter = buildActivityListFilter(
    typeof req.query.type === 'string' ? req.query.type : undefined,
  );

  const modelQuery = ActivityLog.find(filter);
  const builder = new QueryBuilder<IActivityLogDocument>(modelQuery, req.query);
  builder.sort('-createdAt').paginate(20);

  const [rows, total] = await Promise.all([
    builder.query.exec(),
    ActivityLog.countDocuments(filter),
  ]);

  const data = rows.map((entry: any) => {
    const json = entry.toJSON ? entry.toJSON() : entry;
    return {
      ...json,
      type: activityTypeFromAction(json.action),
    };
  });

  sendResponse({
    res,
    message: 'Activity log retrieved',
    data,
    meta: paginationMeta(page, limit, total),
  });
});
