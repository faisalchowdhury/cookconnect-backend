import rateLimit from 'express-rate-limit';
import { env } from '@/config/env';

export const globalRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests',
    errorSources: [],
  },
});

export const authRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  // Only failures count: this guards against guessing, and legitimate sign-ins must not lock people out.
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many authentication attempts',
    errorSources: [],
  },
});
