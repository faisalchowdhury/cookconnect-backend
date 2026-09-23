import { Types } from 'mongoose';
import type { FilterQuery } from '@/types/mongoose';
import { ApiError } from '@/shared/ApiError';
import { resolveMediaUrl } from '@/shared/enrichMedia';
import { paginationMeta, QueryBuilder } from '@/shared/QueryBuilder';
import * as activityLogService from '@/modules/activityLog/activityLog.service';
import * as mediaService from '@/modules/media/media.service';
import { User } from '@/modules/user/user.model';
import { SEARCH_PAGE_SIZE } from '@/modules/job/job.constant';
import { getStorage } from '@/utils/storage';
import { validateImageBuffer, validateImageMime } from '@/middlewares/upload';
import {
  AdminEmployerListQuery,
  DashboardCounters,
  EmployerActivityStats,
  EmployerDecisionInput,
  IEmployerProfileDocument,
  UpdateEmployerInput,
} from './employer.interface';
import { EmployerProfile } from './employer.model';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

async function findByUserId(userId: string): Promise<IEmployerProfileDocument | null> {
  return EmployerProfile.findOne({ userId: toObjectId(userId) });
}

async function requireByUserId(userId: string): Promise<IEmployerProfileDocument> {
  const profile = await findByUserId(userId);
  if (!profile) {
    throw new ApiError(404, 'Employer profile not found');
  }
  return profile;
}

export function assertCanPublish(profile: IEmployerProfileDocument): void {
  if (profile.status !== 'active') {
    throw new ApiError(
      403,
      'Your establishment must be approved before publishing offers',
    );
  }
}

export async function createStub(userId: string): Promise<IEmployerProfileDocument> {
  return EmployerProfile.create({ userId: toObjectId(userId) });
}

export async function getMe(userId: string): Promise<Record<string, unknown>> {
  const profile = await requireByUserId(userId);
  const json = profile.toJSON() as unknown as Record<string, unknown>;
  json.logoUrl = await resolveMediaUrl(profile.logoId);
  json.coverUrl = await resolveMediaUrl(profile.coverId);
  return json;
}

export async function updateMe(
  userId: string,
  input: UpdateEmployerInput,
): Promise<Record<string, unknown>> {
  const profile = await requireByUserId(userId);

  if (input.name !== undefined) profile.name = input.name;
  if (input.type !== undefined) profile.type = input.type;
  if (input.city !== undefined) profile.city = input.city;
  if (input.address !== undefined) profile.address = input.address;
  if (input.about !== undefined) profile.about = input.about;
  if (input.phone !== undefined) profile.phone = input.phone;
  if (input.phonePublic !== undefined) profile.phonePublic = input.phonePublic;
  if (input.socials !== undefined) profile.socials = { ...profile.socials, ...input.socials };
  if (input.since !== undefined) profile.since = input.since;
  if (input.staffCount !== undefined) profile.staffCount = input.staffCount;

  await profile.save();
  const json = profile.toJSON() as unknown as Record<string, unknown>;
  json.logoUrl = await resolveMediaUrl(profile.logoId);
  json.coverUrl = await resolveMediaUrl(profile.coverId);
  return json;
}

export async function getPublic(id: string): Promise<Record<string, unknown> | null> {
  if (!Types.ObjectId.isValid(id)) return null;

  const profile = await EmployerProfile.findOne({
    _id: id,
    status: 'active',
    deletedAt: null,
  });

  if (!profile) return null;

  const json = profile.toJSON() as unknown as Record<string, unknown>;
  if (!profile.phonePublic) {
    delete json.phone;
  }

  json.logoUrl = await resolveMediaUrl(profile.logoId);
  json.coverUrl = await resolveMediaUrl(profile.coverId);

  return json;
}

export async function getDashboardCounters(userId: string): Promise<DashboardCounters> {
  const profile = await requireByUserId(userId);

  let activeOffers = 0;
  let applicants = 0;
  let savedProfiles = 0;
  let profileViews = 0;

  try {
    const { Job } = await import('../job/job.model');
    const employerId = profile._id;
    const [activeCount, viewAgg] = await Promise.all([
      Job.countDocuments({ employerId, status: 'active', deletedAt: null }),
      Job.aggregate([
        { $match: { employerId, deletedAt: null } },
        { $group: { _id: null, total: { $sum: '$viewCount' } } },
      ]),
    ]);
    activeOffers = activeCount;
    profileViews = viewAgg[0]?.total ?? 0;
  } catch {
    // job module optional at compile time
  }

  try {
    const { Application } = await import('../application/application.model');
    applicants = await Application.countDocuments({ employerId: profile._id });
  } catch {
    // application module optional
  }

  try {
    // Same filtered list the employer sees, so the counter never includes hidden profiles.
    const bookmarkService = await import('../bookmark/bookmark.service');
    savedProfiles = (await bookmarkService.list(userId, 'saved-profile')).length;
  } catch {
    // bookmark module optional
  }

  return {
    activeOffers,
    applicants,
    savedProfiles,
    profileViews,
  };
}

async function uploadBrandImage(
  userId: string,
  file: UploadedFile,
  kind: 'logo' | 'cover',
): Promise<IEmployerProfileDocument> {
  validateImageMime(file.mimetype);
  // Covers are wide banners (e.g. 1600×400); the square 600×600 minimum would reject them.
  const dimensions = await validateImageBuffer(
    file.buffer,
    kind === 'cover' ? { minHeight: 300 } : undefined,
  );
  const profile = await requireByUserId(userId);

  const key = mediaService.uniqueStorageKey(
    `employers/${userId}`,
    kind,
    mediaService.imageExtension(file.mimetype),
  );
  const stored = await getStorage().upload(key, file.buffer, file.mimetype);

  const asset = await mediaService.createAsset({
    ownerUserId: userId,
    kind,
    storageKey: stored.storageKey,
    url: stored.url,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    width: dimensions.width,
    height: dimensions.height,
  });

  const previousId = kind === 'logo' ? profile.logoId : profile.coverId;
  if (kind === 'logo') {
    profile.logoId = asset._id as Types.ObjectId;
  } else {
    profile.coverId = asset._id as Types.ObjectId;
  }

  const saved = await profile.save();
  await mediaService.retireAsset(previousId);
  return saved;
}

export async function uploadLogo(
  userId: string,
  file: UploadedFile,
): Promise<Record<string, unknown>> {
  const profile = await uploadBrandImage(userId, file, 'logo');
  const json = profile.toJSON() as unknown as Record<string, unknown>;
  json.logoUrl = await resolveMediaUrl(profile.logoId);
  json.coverUrl = await resolveMediaUrl(profile.coverId);
  return json;
}

export async function uploadCover(
  userId: string,
  file: UploadedFile,
): Promise<Record<string, unknown>> {
  const profile = await uploadBrandImage(userId, file, 'cover');
  const json = profile.toJSON() as unknown as Record<string, unknown>;
  json.logoUrl = await resolveMediaUrl(profile.logoId);
  json.coverUrl = await resolveMediaUrl(profile.coverId);
  return json;
}

async function enrichEmployerAdmin(
  profile: IEmployerProfileDocument,
): Promise<Record<string, unknown>> {
  const json = profile.toJSON() as unknown as Record<string, unknown>;
  const user = await User.findById(profile.userId).select('email status').lean();

  if (user) {
    json.user = {
      id: String((user as any)._id),
      email: (user as any).email,
      status: (user as any).status,
    };
  }

  json.logoUrl = await resolveMediaUrl(profile.logoId);
  json.coverUrl = await resolveMediaUrl(profile.coverId);

  return json;
}

async function enrichEmployersAdmin(
  profiles: IEmployerProfileDocument[],
): Promise<Record<string, unknown>[]> {
  const userIds = profiles.map((p) => p.userId);
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select('email status')
        .lean()
    : [];
  const userById = new Map(
    users.map((u: any) => [
      String(u._id),
      { id: String(u._id), email: u.email, status: u.status },
    ]),
  );

  const logoIds = profiles.map((p) => p.logoId).filter(Boolean) as Types.ObjectId[];
  const coverIds = profiles.map((p) => p.coverId).filter(Boolean) as Types.ObjectId[];
  const mediaIds = [...logoIds, ...coverIds];

  const { MediaAsset } = await import('@/modules/media/media.model');
  const assets = mediaIds.length
    ? await MediaAsset.find({ _id: { $in: mediaIds } })
        .select('url')
        .lean()
    : [];
  const urlById = new Map(assets.map((a: any) => [String(a._id), a.url]));

  return profiles.map((profile) => {
    const json = profile.toJSON() as unknown as Record<string, unknown>;
    const user = userById.get(String(profile.userId));
    if (user) json.user = user;
    json.logoUrl = profile.logoId ? urlById.get(String(profile.logoId)) ?? null : null;
    json.coverUrl = profile.coverId ? urlById.get(String(profile.coverId)) ?? null : null;
    return json;
  });
}

async function logEmployerAdminAction(
  adminUserId: string,
  action: string,
  profile: IEmployerProfileDocument,
  detail?: { fr: string; ar?: string; en?: string },
): Promise<void> {
  await activityLogService.log({
    actorUserId: adminUserId,
    actorLabel: 'Admin',
    action,
    targetType: 'employer',
    targetId: String(profile._id),
    detail: detail ?? {
      fr: profile.name,
      en: profile.name,
    },
  });
}

export async function getActivity(employerId: string): Promise<EmployerActivityStats> {
  const profile = await adminFindById(employerId);
  const employerObjectId = profile._id;

  const { Job } = await import('@/modules/job/job.model');
  const { Application } = await import('@/modules/application/application.model');
  const { ActivityLog } = await import('@/modules/activityLog/activityLog.model');
  const { ProfileView } = await import('@/modules/analytics/profileViews.model');

  const [jobs, applicationsReceived, declaredHires, contactRequests, profileViewCount] =
    await Promise.all([
      Job.find({ employerId: employerObjectId, deletedAt: null }).lean(),
      Application.countDocuments({ employerId: employerObjectId }),
      Application.countDocuments({ employerId: employerObjectId, status: 'hired' }),
      ActivityLog.countDocuments({
        action: 'contact.viewed',
        actorUserId: profile.userId,
      }),
      ProfileView.countDocuments({ viewerUserId: profile.userId }),
    ]);

  const offersPublished = jobs.length;
  const offersActive = jobs.filter((j: any) => j.status === 'active').length;

  const lastJobUpdate = jobs.reduce((max: Date | null, j: any) => {
    const updated = j.updatedAt ? new Date(j.updatedAt) : null;
    if (!updated) return max;
    return !max || updated > max ? updated : max;
  }, null);

  return {
    offersPublished,
    offersActive,
    applicationsReceived,
    profilesViewed: profileViewCount,
    contactRequests,
    declaredHires,
    lastActivity: lastJobUpdate ? lastJobUpdate.toISOString().slice(0, 10) : null,
  };
}

export async function adminList(query: AdminEmployerListQuery): Promise<{
  data: Record<string, unknown>[];
  meta: ReturnType<typeof paginationMeta>;
}> {
  const filter: FilterQuery<IEmployerProfileDocument> = {};
  if (query.status) filter.status = query.status;

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || SEARCH_PAGE_SIZE), 100);

  const modelQuery = EmployerProfile.find(filter);
  const builder = new QueryBuilder<IEmployerProfileDocument>(modelQuery, query)
    .search(['name', 'city', 'address', 'phone'])
    .sort('-createdAt')
    .paginate(SEARCH_PAGE_SIZE);

  const [profiles, total] = await Promise.all([
    builder.query.exec(),
    EmployerProfile.countDocuments(builder.countFilter(filter)),
  ]);

  const data = await enrichEmployersAdmin(profiles);

  return { data, meta: paginationMeta(page, limit, total) };
}

export async function adminRequests(): Promise<Record<string, unknown>[]> {
  const profiles = await EmployerProfile.find({ status: 'pending' }).sort({ createdAt: -1 });
  return enrichEmployersAdmin(profiles);
}

export async function adminFindById(id: string): Promise<IEmployerProfileDocument> {
  const profile = await EmployerProfile.findById(id);
  if (!profile) {
    throw new ApiError(404, 'Employer profile not found');
  }
  return profile;
}

export async function adminFindByIdEnriched(id: string): Promise<Record<string, unknown>> {
  const profile = await adminFindById(id);
  return enrichEmployerAdmin(profile);
}

export async function adminDecision(
  id: string,
  input: EmployerDecisionInput,
): Promise<Record<string, unknown>> {
  const profile = await adminFindById(id);

  if (input.status === 'active') {
    profile.status = 'active';
    profile.verified = true;
    profile.reviewedBy = toObjectId(input.adminUserId);
    profile.reviewedAt = new Date();
    profile.rejectionReason = null;
  } else {
    if (!input.rejectionReason?.trim()) {
      throw new ApiError(422, 'A rejection reason is required');
    }
    profile.status = 'rejected';
    profile.verified = false;
    profile.reviewedBy = toObjectId(input.adminUserId);
    profile.reviewedAt = new Date();
    profile.rejectionReason = input.rejectionReason.trim();
  }

  await profile.save();
  await logEmployerAdminAction(
    input.adminUserId,
    input.status === 'active' ? 'employer.approved' : 'employer.rejected',
    profile,
  );

  const notificationService = await import('@/modules/notification/notification.service');
  await notificationService.notifyEmployerDecision(profile, input.status, profile.rejectionReason);

  return enrichEmployerAdmin(profile);
}

export async function adminBlock(
  id: string,
  blocked: boolean,
  reason?: string,
  adminUserId?: string,
): Promise<Record<string, unknown>> {
  const profile = await adminFindById(id);
  // Unblocking must not approve an establishment that was never approved.
  profile.status = blocked ? 'blocked' : profile.verified ? 'active' : 'pending';
  if (blocked && reason?.trim()) {
    profile.rejectionReason = reason.trim();
  }
  if (!blocked) {
    profile.rejectionReason = null;
  }
  await profile.save();

  if (adminUserId) {
    await logEmployerAdminAction(
      adminUserId,
      blocked ? 'employer.blocked' : 'employer.unblocked',
      profile,
      reason ? { fr: reason, en: reason } : undefined,
    );
  }

  if (blocked) {
    const notificationService = await import('@/modules/notification/notification.service');
    await notificationService.notifyEmployerBlocked(profile, reason);
  }

  return enrichEmployerAdmin(profile);
}
