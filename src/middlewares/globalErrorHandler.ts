import { NextFunction, Request, Response } from 'express';
import { ApiError } from '@/shared/ApiError';
import { env } from '@/config/env';
import { logger } from '@/config/logger';

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'Route not found'));
}

type LibraryError = Error & {
  status?: number;
  expose?: boolean;
  type?: string;
  code?: number | string;
  path?: string;
  keyValue?: Record<string, unknown>;
  errors?: Record<string, { path: string; message: string }>;
};

// Body parsing, multer and Mongoose errors describe bad input, not a server fault.
function toApiError(err: unknown): ApiError | null {
  if (!(err instanceof Error)) return null;
  const e = err as LibraryError;

  if (e.type === 'entity.parse.failed') return new ApiError(400, 'Malformed JSON body');
  if (e.type === 'entity.too.large') return new ApiError(413, 'Request body too large');
  if (e.name === 'MulterError') {
    return e.code === 'LIMIT_FILE_SIZE'
      ? new ApiError(413, 'File too large')
      : new ApiError(400, e.message);
  }
  if (e.name === 'CastError') return new ApiError(400, `Invalid value for ${e.path ?? 'field'}`);
  if (e.name === 'ValidationError' && e.errors) {
    return new ApiError(
      422,
      'Validation failed',
      Object.values(e.errors).map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }
  if (e.code === 11000) {
    const fields = Object.keys(e.keyValue ?? {});
    return new ApiError(
      409,
      'Duplicate value',
      fields.map((path) => ({ path, message: `${path} already exists` })),
    );
  }
  if (e.expose && typeof e.status === 'number' && e.status >= 400 && e.status < 500) {
    return new ApiError(e.status, e.message);
  }
  return null;
}

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as Request & { requestId?: string }).requestId;
  const apiError = err instanceof ApiError ? err : toApiError(err);

  if (apiError) {
    res.status(apiError.statusCode).json({
      success: false,
      statusCode: apiError.statusCode,
      message: apiError.message,
      errorSources: apiError.errorSources,
      ...(env.NODE_ENV === 'development' && err instanceof Error ? { stack: err.stack } : {}),
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  logger.error('Unhandled error', {
    err,
    requestId,
    path: req.path,
  });

  const statusCode = 500;
  res.status(statusCode).json({
    success: false,
    statusCode,
    message: 'Internal server error',
    errorSources: [],
    ...(env.NODE_ENV === 'development' && err instanceof Error ? { stack: err.stack } : {}),
    ...(requestId ? { requestId } : {}),
  });
}
