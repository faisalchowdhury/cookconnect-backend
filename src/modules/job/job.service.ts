import { Types } from 'mongoose';
import { ApiError } from '@/shared/ApiError';
import { resolveMediaUrl } from '@/shared/enrichMedia';
import { paginationMeta, QueryBuilder, textSearchFilter } from '@/shared/QueryBuilder';
import * as activityLogService from '@/modules/activityLog/activityLog.service';
import { Application } from '@/modules/application/application.model';
import { EmployerProfile } from '@/modules/employer/employer.model';
import { assertCanPublish } from '@/modules/employer/employer.service';
import { ModerationReport } from '@/modules/media/moderationReport.model';
import * as notificationService from '@/modules/notification/notification.service';
import { User } from '@/modules/user/user.model';
import {
  DEFAULT_CURRENCY,
  JobStatus,
  OFFER_DURATION_DAYS,
  SEARCH_PAGE_SIZE,
} from './job.constant';
import {
  assertTransition,
  getEffectiveExpiry,
  getTransitionTarget,
} from './job.lifecycle';
import {
  AdminDecisionInput,
  AdminUpdateJobInput,
  CreateJobInput,
  ExtendJobInput,
  GroupedEmployerJobs,
  IJobDocument,
  JobSearchQuery,
  UpdateJobInput,
} from './job.interface';
import { Job } from './job.model';

/** Statuses an offer can be in once it has been published at least once. */
const PUBLIC_JOB_STATUSES: JobStatus[] = ['active', 'expired', 'closed'];

type EmployerSummary = { id: string; name: string; city: string; logoUrl: string | null };

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function assertSalaryRange(min: number | null | undefined, max: number | null | undefined): void {
  if (min != null && max != null && min > max) {
    throw new ApiError(422, 'Validation failed', [
      { path: 'salaryMax', message: 'Maximum salary must be greater than or equal to the minimum' },
    ]);
  }
}

async function resolveEmployerProfile(userId: string) {
  const profile = await EmployerProfile.findOne({ userId: toObjectId(userId) });
  if (!profile) {
    throw new ApiError(404, 'Employer profile not found');
  }
  return profile;
}

const INACTIVE_USER_FILTER = {
  $or: [{ status: { $in: ['suspended', 'deleted'] } }, { deletedAt: { $ne: null } }],
};

/** Offers of blocked establishments, and of suspended or deleted accounts, are not public. */
export async function hiddenEmployerIds(): Promise<Types.ObjectId[]> {
  const inactiveUsers = await User.find({ role: 'employer', ...INACTIVE_USER_FILTER })
    .setOptions({ includeDeleted: true })
    .select('_id')
    .lean();

  const profiles = await EmployerProfile.find({
    $or: [
      { status: 'blocked' },
      { deletedAt: { $ne: null } },
      { userId: { $in: inactiveUsers.map((u: { _id: Types.ObjectId }) => u._id) } },
    ],
  })
    .setOptions({ includeDeleted: true })
    .select('_id')
    .lean();

  return profiles.map((p: { _id: Types.ObjectId }) => p._id);
}

export async function isEmployerHidden(employerId: Types.ObjectId | string): Promise<boolean> {
  const profile = await EmployerProfile.findById(employerId)
    .setOptions({ includeDeleted: true })
    .select('status deletedAt userId')
    .lean();
  if (!profile || profile.status === 'blocked' || profile.deletedAt) return true;

  const hiddenUser = await User.exists({ _id: profile.userId, ...INACTIVE_USER_FILTER }).setOptions({
    includeDeleted: true,
  });
  return Boolean(hiddenUser);
}

// Publishing (approval, or reactivation by extension) needs an approved, visible establishment.
async function assertEmployerCanPublishOffer(job: IJobDocument): Promise<void> {
  const employer = await EmployerProfile.findById(job.employerId).select('status').lean();
  if (!employer || employer.status !== 'active' || (await isEmployerHidden(job.employerId))) {
    throw new ApiError(
      409,
      'The establishment must be approved and not blocked before its offers can be published',
    );
  }
}

export async function create(input: CreateJobInput): Promise<IJobDocument> {
  const employer = await resolveEmployerProfile(input.employerUserId);
  if (!input.asDraft) {
    assertCanPublish(employer);
  }
  assertSalaryRange(input.salaryMin, input.salaryMax);
  const status = input.asDraft ? 'draft' : 'pending';

  return Job.create({
    employerId: employer._id,
    title: input.title,
    description: input.description,
    sectorId: input.sectorId,
    positionId: input.positionId,
    city: input.city,
    country: input.country ?? 'MA',
    contractType: input.contractType,
    salaryMin: input.salaryMin ?? null,
    salaryMax: input.salaryMax ?? null,
    currency: input.currency ?? DEFAULT_CURRENCY,
    experience: input.experience,
    requirements: input.requirements ?? [],
    benefits: input.benefits ?? [],
    status,
    viewCount: 0,
    applicationCount: 0,
    reportCount: 0,
  });
}

async function findOwnedJob(jobId: string, employerUserId: string) {
  const employer = await resolveEmployerProfile(employerUserId);
  const job: IJobDocument | null = await Job.findOne({ _id: jobId, employerId: employer._id });
  if (!job) {
    throw new ApiError(404, 'Job not found');
  }
  return { job, employer };
}

export async function update(
  jobId: string,
  employerUserId: string,
  input: UpdateJobInput,
): Promise<IJobDocument> {
  const { job, employer } = await findOwnedJob(jobId, employerUserId);
  const wasActive = job.status === 'active';

  if (input.title) job.title = input.title;
  if (input.description) job.description = input.description;
  if (input.sectorId) job.sectorId = input.sectorId;
  if (input.positionId) job.positionId = input.positionId;
  if (input.city) job.city = input.city;
  if (input.country) job.country = input.country;
  if (input.contractType) job.contractType = input.contractType;
  if (input.salaryMin !== undefined) job.salaryMin = input.salaryMin;
  if (input.salaryMax !== undefined) job.salaryMax = input.salaryMax;
  if (input.currency) job.currency = input.currency;
  if (input.experience) job.experience = input.experience;
  if (input.requirements) job.requirements = input.requirements;
  if (input.benefits) job.benefits = input.benefits;

  assertSalaryRange(job.salaryMin, job.salaryMax);

  if (input.submit && job.status === 'draft') {
    assertCanPublish(employer);
    job.status = assertTransition(job.status, 'submit');
  } else if (wasActive) {
    // Editing a live offer sends it back for approval, which is a new publication.
    assertCanPublish(employer);
    job.status = assertTransition(job.status, 'editActive');
    job.postedAt = null;
    job.expiresAt = null;
    job.approvedBy = null;
    job.approvedAt = null;
  }

  return job.save();
}

export async function close(jobId: string, employerUserId: string): Promise<IJobDocument> {
  const { job } = await findOwnedJob(jobId, employerUserId);
  job.status = assertTransition(job.status, 'close');
  return job.save();
}

export async function republish(jobId: string, employerUserId: string): Promise<IJobDocument> {
  const { job, employer } = await findOwnedJob(jobId, employerUserId);
  assertCanPublish(employer);
  job.status = assertTransition(job.status, 'republish');
  job.republishedAt = new Date();
  job.postedAt = null;
  job.expiresAt = null;
  job.extendedUntil = null;
  job.approvedBy = null;
  job.approvedAt = null;
  job.rejectionReason = null;
  return job.save();
}

type JobListFilter = Record<string, unknown>;

async function buildSearchFilter(query: JobSearchQuery): Promise<JobListFilter> {
  const filter: JobListFilter = { status: 'active' };

  if (query.city) filter.city = query.city;
  if (query.sectorId) filter.sectorId = query.sectorId;
  if (query.positionId) filter.positionId = query.positionId;
  if (query.contractType) filter.contractType = query.contractType;
  if (query.experience) filter.experience = query.experience;

  const employerFilter: Record<string, unknown> = { $nin: await hiddenEmployerIds() };
  if (query.establishmentType) {
    const employers = await EmployerProfile.find({ type: query.establishmentType }).select('_id');
    employerFilter.$in = employers.map((e: { _id: Types.ObjectId }) => e._id);
  }
  filter.employerId = employerFilter;

  return filter;
}

export async function search(
  query: JobSearchQuery,
  isGuest: boolean,
): Promise<{ data: IJobDocument[]; meta: ReturnType<typeof paginationMeta> }> {
  const page = Math.max(1, Number(query.page) || 1);
  // Guests only get the first page; letting them raise the limit would widen that page.
  const limit = isGuest
    ? SEARCH_PAGE_SIZE
    : Math.min(Math.max(1, Number(query.limit) || SEARCH_PAGE_SIZE), 100);

  if (isGuest && page > 1) {
    throw new ApiError(401, 'Sign in to browse more results');
  }

  const baseFilter = await buildSearchFilter(query);
  const builder = new QueryBuilder<IJobDocument>(Job.find(baseFilter), { ...query, limit })
    .search(['title.fr', 'title.en', 'description.fr', 'description.en'])
    .sort('-postedAt')
    .paginate(SEARCH_PAGE_SIZE);

  const [data, total] = await Promise.all([
    builder.query.exec(),
    Job.countDocuments(builder.countFilter(baseFilter)),
  ]);

  return {
    data,
    meta: paginationMeta(page, limit, total, isGuest),
  };
}

export async function featured(limit = 6): Promise<IJobDocument[]> {
  return Job.find({ status: 'active', employerId: { $nin: await hiddenEmployerIds() } })
    .sort({ postedAt: -1 })
    .limit(limit);
}

export async function findById(id: string): Promise<IJobDocument | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  return Job.findById(id);
}

async function isOwner(employerUserId: string, job: IJobDocument): Promise<boolean> {
  const owner = await EmployerProfile.findOne({ userId: toObjectId(employerUserId) })
    .select('_id')
    .lean();
  return Boolean(owner && String(owner._id) === String(job.employerId));
}

/**
 * Offer detail for the public site. Unpublished offers, and offers of hidden establishments,
 * are only visible to the employer who owns them and to administrators.
 */
export async function findVisibleById(
  id: string,
  viewer: { id: string; role: string } | null,
): Promise<IJobDocument | null> {
  const job = await findById(id);
  if (!job) return null;

  if (viewer?.role === 'admin') return job;
  if (viewer?.role === 'employer' && (await isOwner(viewer.id, job))) return job;

  if (!PUBLIC_JOB_STATUSES.includes(job.status) || (await isEmployerHidden(job.employerId))) {
    return null;
  }

  // Only the public counts as views; owner and admin checks above return first.
  if (job.status === 'active') {
    await Job.updateOne({ _id: job._id }, { $inc: { viewCount: 1 } });
    job.viewCount += 1;
  }

  return job;
}

export async function listMine(employerUserId: string): Promise<GroupedEmployerJobs> {
  const employer = await resolveEmployerProfile(employerUserId);
  const jobs = await Job.find({ employerId: employer._id }).sort({ updatedAt: -1 });

  const grouped: GroupedEmployerJobs = {
    active: [],
    pending: [],
    expired: [],
    draft: [],
    rejected: [],
    closed: [],
  };

  for (const job of jobs) {
    const status = job.status as keyof GroupedEmployerJobs;
    if (grouped[status]) {
      grouped[status].push(job);
    }
  }

  return grouped;
}

export async function report(
  jobId: string,
  reason: string,
  reporterUserId?: string,
): Promise<IJobDocument> {
  const job = await findById(jobId);
  if (!job || job.status !== 'active' || (await isEmployerHidden(job.employerId))) {
    throw new ApiError(404, 'Job not found');
  }

  if (reporterUserId) {
    const alreadyReported = await ModerationReport.exists({
      targetType: 'job',
      targetId: job._id,
      reporterUserId: toObjectId(reporterUserId),
      status: 'open',
    });
    // A second report from the same person must not count twice while the first is open.
    if (alreadyReported) return job;
  }

  await ModerationReport.create({
    targetType: 'job',
    targetId: job._id,
    reporterUserId: reporterUserId ? toObjectId(reporterUserId) : null,
    reason: reason.trim(),
    status: 'open',
  });

  const updated = await Job.findOneAndUpdate(
    { _id: job._id },
    { $inc: { reportCount: 1 } },
    { new: true },
  );
  return updated ?? job;
}

async function loadEmployerSummaries(
  employerIds: Types.ObjectId[],
): Promise<Map<string, EmployerSummary>> {
  if (!employerIds.length) return new Map();

  const employers = await EmployerProfile.find({ _id: { $in: employerIds } })
    .select('name city logoId')
    .lean();

  const summaries = await Promise.all(
    employers.map(async (e: any) => ({
      id: String(e._id),
      name: e.name,
      city: e.city,
      logoUrl: await resolveMediaUrl(e.logoId),
    })),
  );

  return new Map(summaries.map((s) => [s.id, s]));
}

async function enrichJobsAdmin(jobs: IJobDocument[]): Promise<Record<string, unknown>[]> {
  const employerIds = [...new Set(jobs.map((j) => String(j.employerId)))].map(
    (id) => toObjectId(id),
  );
  const employerMap = await loadEmployerSummaries(employerIds);

  return jobs.map((job) => {
    const json = job.toJSON() as unknown as Record<string, unknown>;
    const employer = employerMap.get(String(job.employerId));
    if (employer) json.employer = employer;
    return json;
  });
}

async function enrichJobAdmin(job: IJobDocument): Promise<Record<string, unknown>> {
  const [enriched] = await enrichJobsAdmin([job]);
  return enriched;
}

async function logJobAdminAction(
  adminUserId: string,
  action: string,
  job: IJobDocument,
  detail?: { fr: string; ar?: string; en?: string },
): Promise<void> {
  await activityLogService.log({
    actorUserId: adminUserId,
    actorLabel: 'Admin',
    action,
    targetType: 'job',
    targetId: String(job._id),
    detail: detail ?? {
      fr: job.title?.fr ?? 'Offre',
      en: job.title?.en ?? job.title?.fr ?? 'Job offer',
    },
  });
}

// Admins search offers by title, city or establishment name.
async function adminSearchFilter(q: unknown): Promise<JobListFilter | null> {
  const byText = textSearchFilter(q, ['title.fr', 'title.ar', 'title.en', 'city']);
  if (!byText) return null;

  const employers = await EmployerProfile.find(textSearchFilter(q, ['name'])!)
    .setOptions({ includeDeleted: true })
    .select('_id')
    .lean();

  return {
    $or: [
      ...byText.$or,
      { employerId: { $in: employers.map((e: { _id: Types.ObjectId }) => e._id) } },
    ],
  };
}

export async function adminList(query: JobSearchQuery): Promise<{
  data: Record<string, unknown>[];
  meta: ReturnType<typeof paginationMeta>;
}> {
  const filter: JobListFilter = {};
  if (query.employerId) filter.employerId = toObjectId(String(query.employerId));
  if (query.status) filter.status = query.status;

  const searchFilter = await adminSearchFilter(query.q);
  const listFilter = searchFilter ? { ...filter, ...searchFilter } : filter;

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || SEARCH_PAGE_SIZE), 100);

  const builder = new QueryBuilder<IJobDocument>(Job.find(listFilter), query)
    .sort('-createdAt')
    .paginate(SEARCH_PAGE_SIZE);

  const [jobs, total] = await Promise.all([builder.query.exec(), Job.countDocuments(listFilter)]);
  const data = await enrichJobsAdmin(jobs);

  return { data, meta: paginationMeta(page, limit, total) };
}

export async function adminListByEmployer(): Promise<
  Array<{
    employerId: string;
    employer: EmployerSummary | null;
    counts: Record<string, number>;
    total: number;
    applications: number;
  }>
> {
  const [rows, applicationRows] = await Promise.all([
    Job.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: { employerId: '$employerId', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]),
    // Applications to deleted offers are left out, like the offers themselves.
    Application.aggregate([
      { $lookup: { from: 'jobs', localField: 'jobId', foreignField: '_id', as: 'job' } },
      { $match: { job: { $elemMatch: { deletedAt: null } } } },
      { $group: { _id: '$employerId', count: { $sum: 1 } } },
    ]),
  ]);

  const counts = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const employerId = String(row._id.employerId);
    if (!counts.has(employerId)) counts.set(employerId, {});
    counts.get(employerId)![row._id.status as string] = row.count;
  }

  const applications = new Map<string, number>(
    applicationRows.map((row: { _id: Types.ObjectId; count: number }) => [String(row._id), row.count]),
  );
  const employers = await loadEmployerSummaries([...counts.keys()].map((id) => toObjectId(id)));

  return [...counts.entries()].map(([employerId, byStatus]) => ({
    employerId,
    employer: employers.get(employerId) ?? null,
    counts: byStatus,
    total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
    applications: applications.get(employerId) ?? 0,
  }));
}

export async function adminFindById(id: string): Promise<Record<string, unknown>> {
  const job = await findById(id);
  if (!job) throw new ApiError(404, 'Job not found');
  return enrichJobAdmin(job);
}

export async function adminDecision(id: string, input: AdminDecisionInput): Promise<Record<string, unknown>> {
  const job = await Job.findById(id);
  if (!job) throw new ApiError(404, 'Job not found');

  if (input.status === 'active') {
    if (job.status === 'expired') {
      job.status = assertTransition(job.status, 'republish');
      job.republishedAt = new Date();
      job.postedAt = null;
      job.expiresAt = null;
      job.extendedUntil = null;
      job.approvedBy = null;
      job.approvedAt = null;
      job.rejectionReason = null;
    }
    job.status = assertTransition(job.status, 'approve');
    await assertEmployerCanPublishOffer(job);
    const now = new Date();
    job.postedAt = now;
    job.expiresAt = addDays(now, OFFER_DURATION_DAYS);
    job.approvedBy = toObjectId(input.adminUserId);
    job.approvedAt = now;
    job.rejectionReason = null;
    await job.save();
    await logJobAdminAction(input.adminUserId, 'job.approved', job);
  } else if (input.status === 'closed') {
    job.status = assertTransition(job.status, 'close');
    await job.save();
    await logJobAdminAction(input.adminUserId, 'job.closed', job);
  } else {
    job.status = assertTransition(job.status, 'reject');
    if (!input.rejectionReason?.trim()) {
      throw new ApiError(422, 'A rejection reason is required');
    }
    job.rejectionReason = input.rejectionReason.trim();
    job.approvedBy = null;
    job.approvedAt = null;
    await job.save();
    await logJobAdminAction(input.adminUserId, 'job.rejected', job);
  }

  await notificationService.notifyJobDecision(job, input.status, job.rejectionReason);

  return enrichJobAdmin(job);
}

export async function adminUpdate(
  id: string,
  input: AdminUpdateJobInput,
): Promise<Record<string, unknown>> {
  const job = await Job.findById(id);
  if (!job) throw new ApiError(404, 'Job not found');

  if (input.title) job.title = input.title;
  if (input.description) job.description = input.description;
  if (input.salaryMin !== undefined) job.salaryMin = input.salaryMin;
  if (input.salaryMax !== undefined) job.salaryMax = input.salaryMax;
  if (input.city) job.city = input.city;
  if (input.requirements) job.requirements = input.requirements;
  if (input.benefits) job.benefits = input.benefits;

  assertSalaryRange(job.salaryMin, job.salaryMax);

  await job.save();
  await logJobAdminAction(input.adminUserId, 'job.updated', job);

  return enrichJobAdmin(job);
}

export async function adminClose(id: string, adminUserId: string): Promise<Record<string, unknown>> {
  const job = await Job.findById(id);
  if (!job) throw new ApiError(404, 'Job not found');

  job.status = assertTransition(job.status, 'close');
  await job.save();
  await logJobAdminAction(adminUserId, 'job.closed', job);
  await notificationService.notifyJobDecision(job, 'closed');

  return enrichJobAdmin(job);
}

export async function adminRepublish(
  id: string,
  adminUserId: string,
): Promise<Record<string, unknown>> {
  const job = await Job.findById(id);
  if (!job) throw new ApiError(404, 'Job not found');

  job.status = assertTransition(job.status, 'republish');
  job.republishedAt = new Date();
  job.postedAt = null;
  job.expiresAt = null;
  job.extendedUntil = null;
  job.approvedBy = null;
  job.approvedAt = null;
  job.rejectionReason = null;

  await job.save();
  await logJobAdminAction(adminUserId, 'job.republished', job);

  return enrichJobAdmin(job);
}

export async function adminExtend(id: string, input: ExtendJobInput): Promise<Record<string, unknown>> {
  if (input.extendedUntil.getTime() <= Date.now()) {
    throw new ApiError(422, 'The extension date must be in the future');
  }

  const job = await Job.findById(id);
  if (!job) throw new ApiError(404, 'Job not found');

  if (job.status !== 'active' && job.status !== 'expired') {
    throw new ApiError(409, 'Only active or expired offers can be extended');
  }

  const currentExpiry = getEffectiveExpiry(job.expiresAt, job.extendedUntil);
  if (currentExpiry && input.extendedUntil.getTime() <= currentExpiry.getTime()) {
    throw new ApiError(422, 'The extension date must be later than the current expiry date');
  }

  job.extendedUntil = input.extendedUntil;
  if (job.status === 'expired') {
    await assertEmployerCanPublishOffer(job);
    job.status = getTransitionTarget('approve');
    if (!job.postedAt) job.postedAt = new Date();
    if (!job.expiresAt) job.expiresAt = addDays(job.postedAt, OFFER_DURATION_DAYS);
  }
  await job.save();
  await logJobAdminAction(input.adminUserId, 'job.extended', job);

  return enrichJobAdmin(job);
}

export async function adminDelete(id: string, adminUserId: string): Promise<IJobDocument> {
  const job = await Job.findById(id);
  if (!job) throw new ApiError(404, 'Job not found');
  const deleted = await job.softDelete();
  await logJobAdminAction(adminUserId, 'job.deleted', job);
  return deleted;
}

export async function expireDueJobs(): Promise<number> {
  const now = new Date();
  const activeJobs = await Job.find({ status: 'active' });
  let expiredCount = 0;

  for (const job of activeJobs) {
    const effectiveExpiry = getEffectiveExpiry(job.expiresAt, job.extendedUntil);
    if (effectiveExpiry && effectiveExpiry <= now) {
      job.status = assertTransition(job.status, 'expire');
      await job.save();
      expiredCount += 1;
    }
  }

  return expiredCount;
}
