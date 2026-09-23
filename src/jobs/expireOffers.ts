import * as jobService from '@/modules/job/job.service';

/** Cron entrypoint — expire active offers past their effective expiry date. */
export async function expireOffers(): Promise<number> {
  return jobService.expireDueJobs();
}
