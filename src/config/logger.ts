import winston from 'winston';
import { env } from './env';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const pretty = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} ${level}: ${stack || message}${rest}`;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp(),
    env.NODE_ENV === 'production' ? json() : combine(colorize(), pretty),
  ),
  defaultMeta: { service: 'cookconnect-api' },
  transports: [new winston.transports.Console()],
});
