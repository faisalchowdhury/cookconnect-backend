import http from 'http';
import cron from 'node-cron';
import { createApp } from '@/app';
import { env } from '@/config/env';
import { connectDatabase, disconnectDatabase } from '@/config/database';
import { logger } from '@/config/logger';
import * as taxonomyService from '@/modules/taxonomy/taxonomy.service';
import { expireOffers } from '@/jobs/expireOffers';
import { processEmailOutbox } from '@/jobs/processEmailOutbox';

async function main() {
  await connectDatabase();
  await taxonomyService.loadCache();

  const app = createApp();
  const server = http.createServer(app);

  cron.schedule('15 2 * * *', () => {
    expireOffers().catch((err: unknown) => logger.error('expireOffers failed', { err }));
  });
  cron.schedule('*/2 * * * *', () => {
    processEmailOutbox().catch((err: unknown) => logger.error('email outbox failed', { err }));
  });

  server.listen(env.PORT, () => {
    logger.info(`API listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal boot error', { err });
  process.exit(1);
});
