import { NextFunction, Request, Response } from 'express';
import { ZodObject, ZodError } from 'zod';
import { ApiError } from '@/shared/ApiError';

type Schemas = {
  body?: ZodObject;
  query?: ZodObject;
  params?: ZodObject;
};

export const validateRequest =
  (schemas: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        // Express 5 re-parses req.query on every read, so writing into it is silently lost.
        // Raw keys stay so params a schema doesn't list still reach the controller.
        const query = { ...req.query, ...schemas.query.parse(req.query) };
        Object.defineProperty(req, 'query', {
          value: query,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          new ApiError(
            422,
            'Validation failed',
            err.issues.map((i) => ({
              path: i.path.join('.') || 'body',
              message: i.message,
            })),
          ),
        );
        return;
      }
      next(err);
    }
  };
