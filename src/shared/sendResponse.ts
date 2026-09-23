import { Response } from 'express';

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  gated?: boolean;
};

type SendArgs<T> = {
  res: Response;
  statusCode?: number;
  message?: string;
  data?: T;
  meta?: PaginationMeta;
};

export function sendResponse<T>({
  res,
  statusCode = 200,
  message = 'OK',
  data,
  meta,
}: SendArgs<T>): void {
  res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    ...(meta ? { meta } : {}),
    data: data ?? null,
  });
}
