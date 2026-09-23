import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import path from 'path';
import crypto from 'crypto';
import { env } from '@/config/env';
import { globalRateLimit } from '@/middlewares/rateLimit';
import { notFound, globalErrorHandler } from '@/middlewares/globalErrorHandler';
import routes from '@/routes/index';
import { openApiDocument } from '@/docs/openapi';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(globalRateLimit);
  app.use((req, _res, next) => {
    (req as express.Request & { requestId?: string }).requestId = crypto.randomUUID();
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(hpp());
  app.use((req, _res, next) => {
    try {
      mongoSanitize.sanitize(req.body);
      mongoSanitize.sanitize(req.params);
      next();
    } catch {
      next();
    }
  });

  if (env.STORAGE_DRIVER === 'local') {
    app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)));
  }

  app.get('/api/docs', (_req, res) => {
    res.json(openApiDocument);
  });

  app.use('/api/v1', routes);

  app.use(notFound);
  app.use(globalErrorHandler);

  return app;
}

export default createApp;
