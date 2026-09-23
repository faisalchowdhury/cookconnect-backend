import { Request, Response } from 'express';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import { TaxonomyType } from './taxonomy.constant';
import * as taxonomyService from './taxonomy.service';

export const create = catchAsync(async (req: Request, res: Response) => {
  const doc = await taxonomyService.create(req.body);
  sendResponse({ res, statusCode: 201, message: 'Taxonomy entry created', data: doc });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const doc = await taxonomyService.update(
    req.params.type as TaxonomyType,
    String(req.params.key),
    req.body,
  );
  sendResponse({ res, message: 'Taxonomy entry updated', data: doc });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  const doc = await taxonomyService.remove(
    req.params.type as TaxonomyType,
    String(req.params.key),
  );
  sendResponse({ res, message: 'Taxonomy entry deleted', data: doc });
});
