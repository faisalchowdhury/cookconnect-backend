import { Types } from 'mongoose';
import type { FilterQuery } from '@/types/mongoose';
import { ApiError } from '@/shared/ApiError';
import {
  resolveMediaUrl,
  resolveMediaWithModeration,
} from '@/shared/enrichMedia';
import { paginationMeta, QueryBuilder, textSearchFilter } from '@/shared/QueryBuilder';
import * as activityLogService from '@/modules/activityLog/activityLog.service';
import * as mediaService from '@/modules/media/media.service';
import { MediaAsset } from '@/modules/media/media.model';
import * as notificationService from '@/modules/notification/notification.service';
import * as taxonomyService from '@/modules/taxonomy/taxonomy.service';
import { User } from '@/modules/user/user.model';
import { getStorage } from '@/utils/storage';
import {
  validateCvBuffer,
  validateImageBuffer,
  validateImageMime,
} from '@/middlewares/upload';
import {
  MAX_FOOD_PHOTOS,
  SEARCH_PAGE_SIZE,
} from './candidate.constant';
import {
  AdminCandidateListQuery,
  AdminFindCandidateOptions,
  AdminUpdateCandidateInput,
  CandidateSearchQuery,
  CandidateViewer,
  ICandidateProfileDocument,
  SetCandidateStatusInput,
  SetVerificationInput,
  UpdateCandidateInput,
} from './candidate.interface';
import { CandidateProfile, computeCompletionPercent } from './candidate.model';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

type MediaView = { id: string; url: string; moderationStatus: string };

type ContactViewer = {
  permissions: string[];
  adminLevel?: 'super' | 'sub' | null;
} | null | undefined;

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

async function findByUserId(userId: string): Promise<ICandidateProfileDocument | null> {
  return CandidateProfile.findOne({ userId: toObjectId(userId) }).select('+phone');
}

async function requireByUserId(userId: string): Promise<ICandidateProfileDocument> {
  const profile = await findByUserId(userId);
  if (!profile) {
    throw new ApiError(404, 'Candidate profile not found');
  }
  return profile;
}

// Deleted accounts are soft-deleted, and admin reads and restores still need to reach them.
function findUserIncludingDeleted(userId: string) {
  return User.findOne({ _id: toObjectId(userId) }).setOptions({ includeDeleted: true });
}

function mayViewContact(viewer: ContactViewer): boolean {
  return Boolean(
    viewer && (viewer.adminLevel === 'super' || viewer.permissions.includes('view-contact')),
  );
}

/** Needs the profile loaded with `+phone`, or completion scores the phone as missing. */
async function refreshSearchable(profile: ICandidateProfileDocument): Promise<void> {
  const user = await findUserIncludingDeleted(String(profile.userId));
  profile.searchable =
    !profile.deletedAt &&
    computeCompletionPercent(profile) === 100 &&
    user?.status !== 'suspended' &&
    user?.status !== 'deleted';
}

function inOrder(ids: (Types.ObjectId | string)[], media: MediaView[]): MediaView[] {
  const byId = new Map(media.map((m) => [m.id, m]));
  return ids.map((id) => byId.get(String(id))).filter((m): m is MediaView => Boolean(m));
}

// Rejected media stays stored for the audit trail but must never be shown publicly.
async function publicMedia(ids: (Types.ObjectId | string)[]): Promise<MediaView[]> {
  const media = await resolveMediaWithModeration(ids);
  return inOrder(ids, media).filter((m) => m.moderationStatus !== 'rejected');
}

/** The candidate's own view: their media resolved, pending uploads included with their status. */
export async function toOwnerView(
  profile: ICandidateProfileDocument,
): Promise<Record<string, unknown>> {
  const json = profile.toJSON() as unknown as Record<string, unknown>;

  const [photo] = profile.photoId ? await resolveMediaWithModeration([profile.photoId]) : [];
  json.photoUrl = photo?.url ?? null;
  json.photoModerationStatus = photo?.moderationStatus ?? null;

  json.dishPhotos = inOrder(
    profile.foodPhotoIds,
    await resolveMediaWithModeration(profile.foodPhotoIds),
  );

  json.cvUrl = await resolveMediaUrl(profile.cvAssetId);

  return json;
}

export async function createStub(userId: string): Promise<ICandidateProfileDocument> {
  return CandidateProfile.create({ userId: toObjectId(userId) });
}

export async function getMe(userId: string): Promise<Record<string, unknown>> {
  return toOwnerView(await requireByUserId(userId));
}

export async function isProfileComplete(userId: string): Promise<boolean> {
  const profile = await CandidateProfile.findOne({ userId: toObjectId(userId) });
  return Boolean(profile && profile.completionPercent === 100);
}

export async function updateMe(
  userId: string,
  input: UpdateCandidateInput,
): Promise<Record<string, unknown>> {
  const profile = await requireByUserId(userId);

  if (input.sectorId !== undefined) profile.sectorId = input.sectorId;
  if (input.positionId !== undefined) profile.positionId = input.positionId;

  if (profile.sectorId && profile.positionId) {
    taxonomyService.ensurePositionBelongsToSector(profile.positionId, profile.sectorId);
  }

  if (input.firstName !== undefined) profile.firstName = input.firstName;
  if (input.lastName !== undefined) profile.lastName = input.lastName;
  if (input.city !== undefined) profile.city = input.city;
  if (input.country !== undefined) profile.country = input.country;
  if (input.experience !== undefined) profile.experience = input.experience;
  if (input.availability !== undefined) profile.availability = input.availability;
  if (input.contractType !== undefined) profile.contractType = input.contractType;
  if (input.expectedSalary !== undefined) profile.expectedSalary = input.expectedSalary;
  if (input.phone !== undefined) profile.phone = input.phone;
  if (input.about !== undefined) profile.about = input.about;
  if (input.skills !== undefined) profile.skills = input.skills;
  if (input.languages !== undefined) profile.languages = input.languages;
  if (input.training !== undefined) profile.training = input.training;
  if (input.history !== undefined) profile.history = input.history;

  await refreshSearchable(profile);

  return toOwnerView(await profile.save());
}

export async function search(
  query: CandidateSearchQuery,
  isGuest: boolean,
): Promise<{ data: Record<string, unknown>[]; meta: ReturnType<typeof paginationMeta> }> {
  const page = Math.max(1, Number(query.page) || 1);
  // Guests only get the first page; letting them raise the limit would widen that page.
  const limit = isGuest
    ? SEARCH_PAGE_SIZE
    : Math.min(Math.max(1, Number(query.limit) || SEARCH_PAGE_SIZE), 100);

  if (isGuest && page > 1) {
    throw new ApiError(401, 'Sign in to browse more results');
  }

  const baseFilter: FilterQuery<ICandidateProfileDocument> = {
    searchable: true,
    deletedAt: null,
  };

  if (query.city) baseFilter.city = query.city;
  if (query.sectorId) baseFilter.sectorId = query.sectorId;
  if (query.positionId) baseFilter.positionId = query.positionId;
  if (query.experience) baseFilter.experience = query.experience;
  if (query.availability) baseFilter.availability = query.availability;

  const builder = new QueryBuilder<ICandidateProfileDocument>(
    CandidateProfile.find(baseFilter),
    { ...query, limit },
  )
    .search(['firstName', 'lastName'])
    .sort('-createdAt')
    .paginate(SEARCH_PAGE_SIZE);

  const [rows, total] = await Promise.all([
    builder.query.exec(),
    CandidateProfile.countDocuments(builder.countFilter(baseFilter)),
  ]);

  const photos = await publicMedia(
    rows.map((p: ICandidateProfileDocument) => p.photoId).filter(Boolean) as Types.ObjectId[],
  );
  const photoUrlById = new Map(photos.map((m) => [m.id, m.url]));

  const data = rows.map((profile: ICandidateProfileDocument) => {
    const json = profile.toJSON() as unknown as Record<string, unknown>;
    delete json.phone;
    json.photoUrl = profile.photoId ? photoUrlById.get(String(profile.photoId)) ?? null : null;
    return json;
  });

  return {
    data,
    meta: paginationMeta(page, limit, total, isGuest),
  };
}

async function canViewPhone(viewer: CandidateViewer): Promise<boolean> {
  if (!viewer) return false;

  if (viewer.role === 'admin') {
    return mayViewContact(viewer);
  }

  if (viewer.role === 'employer') {
    try {
      const { EmployerProfile } = await import('../employer/employer.model');
      const employer = await EmployerProfile.findOne({ userId: toObjectId(viewer.id) });
      return Boolean(employer?.verified && employer.status === 'active');
    } catch {
      return false;
    }
  }

  return false;
}

async function logContactView(
  viewer: CandidateViewer,
  profile: ICandidateProfileDocument,
  meta?: { ip?: string; userAgent?: string },
): Promise<void> {
  if (!viewer) return;

  let actorLabel = 'User';

  if (viewer.role === 'employer') {
    const { EmployerProfile } = await import('../employer/employer.model');
    const employer = await EmployerProfile.findOne({ userId: toObjectId(viewer.id) });
    actorLabel = employer?.name || 'Employer';
  } else if (viewer.role === 'admin') {
    actorLabel = 'Admin';
  }

  await activityLogService.log({
    actorUserId: viewer.id,
    actorLabel,
    action: 'contact.viewed',
    targetType: 'candidate',
    targetId: String(profile._id),
    detail: {
      fr: `Consultation du contact de ${profile.firstName} ${profile.lastName}`,
      en: `Viewed contact for ${profile.firstName} ${profile.lastName}`,
    },
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
}

async function logAdminCandidateAction(
  adminUserId: string,
  action: string,
  profile: ICandidateProfileDocument,
  detail?: { fr: string; ar?: string; en?: string },
): Promise<void> {
  await activityLogService.log({
    actorUserId: adminUserId,
    actorLabel: 'Admin',
    action,
    targetType: 'candidate',
    targetId: String(profile._id),
    detail: detail ?? {
      fr: `${profile.firstName} ${profile.lastName}`,
      en: `${profile.firstName} ${profile.lastName}`,
    },
  });
}

type UserSummary = {
  id: string;
  email: string;
  status: string;
  lastLoginAt?: Date | null;
};

async function loadUserSummaries(userIds: Types.ObjectId[]): Promise<Map<string, UserSummary>> {
  if (!userIds.length) return new Map();

  const users = await User.find({ _id: { $in: userIds } })
    .setOptions({ includeDeleted: true })
    .select('email status lastLoginAt')
    .lean();

  return new Map(
    users.map((u: any) => [
      String(u._id),
      {
        id: String(u._id),
        email: u.email,
        status: u.status,
        lastLoginAt: u.lastLoginAt ?? null,
      },
    ]),
  );
}

async function enrichCandidateAdmin(
  profile: ICandidateProfileDocument,
  options?: { includeContact?: boolean },
): Promise<Record<string, unknown>> {
  const json = profile.toJSON() as unknown as Record<string, unknown>;
  const userId = String(profile.userId);

  const user: any = await findUserIncludingDeleted(userId)
    .select('email status lastLoginAt')
    .lean();

  if (user) {
    json.user = {
      id: String(user._id),
      status: user.status,
      lastLoginAt: user.lastLoginAt ?? null,
      // Email is contact data too: it only ships with a permitted, logged reveal.
      ...(options?.includeContact ? { email: user.email } : {}),
    };
  }

  json.photoUrl = await resolveMediaUrl(profile.photoId);
  json.dishPhotos = inOrder(
    profile.foodPhotoIds,
    await resolveMediaWithModeration(profile.foodPhotoIds),
  );

  const pendingPhotos = await MediaAsset.find({
    ownerUserId: toObjectId(userId),
    kind: { $in: mediaService.MODERATED_PHOTO_KINDS },
    moderationStatus: 'pending',
    deletedAt: null,
  })
    .select('url moderationStatus kind')
    .lean();

  json.pendingPhotos = pendingPhotos.map((p: any) => ({
    id: String(p._id),
    url: p.url,
    moderationStatus: p.moderationStatus,
    kind: p.kind,
  }));

  if (!options?.includeContact) {
    delete json.phone;
  }

  return json;
}

async function enrichCandidatesAdmin(
  profiles: ICandidateProfileDocument[],
  options: { includeEmail: boolean },
): Promise<Record<string, unknown>[]> {
  const userMap = await loadUserSummaries(profiles.map((p) => toObjectId(String(p.userId))));

  const photoIds = profiles.map((p) => p.photoId).filter(Boolean) as Types.ObjectId[];
  const photoUrls = photoIds.length
    ? await MediaAsset.find({ _id: { $in: photoIds } })
        .select('url')
        .lean()
    : [];
  const photoUrlById = new Map(photoUrls.map((a: any) => [String(a._id), a.url]));

  return profiles.map((profile) => {
    const json = profile.toJSON() as unknown as Record<string, unknown>;
    const user = userMap.get(String(profile.userId));

    if (user) {
      json.user = {
        id: user.id,
        status: user.status,
        lastLoginAt: user.lastLoginAt ?? null,
        ...(options.includeEmail ? { email: user.email } : {}),
      };
    }

    json.photoUrl = profile.photoId ? photoUrlById.get(String(profile.photoId)) ?? null : null;

    delete json.phone;
    return json;
  });
}

async function userIdsForStatus(status: string): Promise<Types.ObjectId[] | null> {
  if (!status) return null;

  const users = await User.find({ status }).select('_id').lean();
  return users.map((u: any) => u._id as Types.ObjectId);
}

export async function findPublicById(
  id: string,
  viewer: CandidateViewer,
  meta?: { ip?: string; userAgent?: string },
): Promise<Record<string, unknown> | null> {
  if (!Types.ObjectId.isValid(id)) return null;

  const profile = await CandidateProfile.findOneAndUpdate(
    { _id: id, searchable: true, deletedAt: null },
    { $inc: { profileViews: 1 } },
    { new: true },
  );

  if (!profile) return null;

  const json = profile.toJSON() as unknown as Record<string, unknown>;
  const showPhone = await canViewPhone(viewer);

  if (showPhone) {
    const withPhone = await CandidateProfile.findById(profile._id).select('+phone');
    if (withPhone?.phone) {
      json.phone = withPhone.phone;
      await logContactView(viewer, profile, meta);
    }
  }

  const [photo] = profile.photoId ? await publicMedia([profile.photoId]) : [];
  json.photoUrl = photo?.url ?? null;
  json.dishPhotos = await publicMedia(profile.foodPhotoIds);

  return json;
}

function storeImage(userId: string, kind: string, file: UploadedFile) {
  const key = mediaService.uniqueStorageKey(
    `candidates/${userId}`,
    kind,
    mediaService.imageExtension(file.mimetype),
  );
  return getStorage().upload(key, file.buffer, file.mimetype);
}

export async function uploadPhoto(
  userId: string,
  file: UploadedFile,
): Promise<Record<string, unknown>> {
  validateImageMime(file.mimetype);
  const dimensions = await validateImageBuffer(file.buffer);
  const profile = await requireByUserId(userId);

  const stored = await storeImage(userId, 'photo', file);
  const asset = await mediaService.createAsset({
    ownerUserId: userId,
    kind: 'profile-photo',
    storageKey: stored.storageKey,
    url: stored.url,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    width: dimensions.width,
    height: dimensions.height,
  });

  const previousId = profile.photoId;
  profile.photoId = asset._id as Types.ObjectId;
  await refreshSearchable(profile);
  const saved = await profile.save();
  await mediaService.retireAsset(previousId);

  return toOwnerView(saved);
}

export async function uploadDishPhotos(
  userId: string,
  files: UploadedFile[],
): Promise<Record<string, unknown>> {
  if (!files.length) {
    throw new ApiError(422, 'No files uploaded');
  }

  const profile = await requireByUserId(userId);

  if (!profile.positionId) {
    throw new ApiError(422, 'Set your position before uploading food photos');
  }

  const allowed = await taxonomyService.allowsFoodPhotos(profile.positionId);
  if (!allowed) {
    throw new ApiError(422, 'Your position is not eligible for food photos');
  }

  if (profile.foodPhotoIds.length + files.length > MAX_FOOD_PHOTOS) {
    throw new ApiError(422, `You can upload at most ${MAX_FOOD_PHOTOS} food photos`);
  }

  // Validate the whole batch first, so one bad file cannot leave its siblings stored and orphaned.
  const dimensions: Array<{ width: number; height: number }> = [];
  for (const file of files) {
    validateImageMime(file.mimetype);
    dimensions.push(await validateImageBuffer(file.buffer));
  }

  const newIds: Types.ObjectId[] = [];

  for (const [index, file] of files.entries()) {
    const stored = await storeImage(userId, 'dish', file);
    const asset = await mediaService.createAsset({
      ownerUserId: userId,
      kind: 'dish-photo',
      storageKey: stored.storageKey,
      url: stored.url,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      width: dimensions[index].width,
      height: dimensions[index].height,
    });

    newIds.push(asset._id as Types.ObjectId);
  }

  profile.foodPhotoIds.push(...newIds);
  return toOwnerView(await profile.save());
}

export async function deleteDishPhoto(
  userId: string,
  assetId: string,
): Promise<Record<string, unknown>> {
  const profile = await requireByUserId(userId);
  const assetObjectId = toObjectId(assetId);

  if (!profile.foodPhotoIds.some((id) => id.equals(assetObjectId))) {
    throw new ApiError(404, 'Food photo not found on this profile');
  }

  profile.foodPhotoIds = profile.foodPhotoIds.filter((id) => !id.equals(assetObjectId));
  await profile.save();
  await mediaService.retireAsset(assetObjectId);

  return toOwnerView(profile);
}

export async function uploadCv(
  userId: string,
  file: UploadedFile,
): Promise<Record<string, unknown>> {
  validateCvBuffer(file.buffer, file.mimetype);
  const profile = await requireByUserId(userId);

  const key = mediaService.uniqueStorageKey(
    `candidates/${userId}`,
    'cv',
    mediaService.cvExtension(file.buffer, file.mimetype),
  );
  const stored = await getStorage().upload(key, file.buffer, file.mimetype);

  const asset = await mediaService.createAsset({
    ownerUserId: userId,
    kind: 'cv',
    storageKey: stored.storageKey,
    url: stored.url,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  });

  const previousId = profile.cvAssetId;
  profile.cvAssetId = asset._id as Types.ObjectId;
  const saved = await profile.save();
  await mediaService.retireAsset(previousId);

  return toOwnerView(saved);
}

async function buildAdminFilter(query: AdminCandidateListQuery): Promise<{
  filter: FilterQuery<ICandidateProfileDocument>;
  findOptions?: { includeDeleted: boolean };
}> {
  const filter: FilterQuery<ICandidateProfileDocument> = {};

  if (query.verified === 'true') filter.verified = true;
  if (query.verified === 'false') filter.verified = false;

  const sectorId = query.sectorId || query.sector;
  const positionId = query.positionId || query.position;
  if (sectorId) filter.sectorId = sectorId;
  if (positionId) filter.positionId = positionId;
  if (query.city) filter.city = query.city;
  if (query.experience) filter.experience = query.experience;
  if (query.availability) filter.availability = query.availability;

  const minCompletion = Number(query.minCompletion);
  if (minCompletion > 0) {
    filter.completionPercent = { $gte: minCompletion };
  }

  if (query.status === 'deleted') {
    filter.deletedAt = { $ne: null };
  } else if (query.status) {
    filter.deletedAt = null;
    const userIds = await userIdsForStatus(query.status);
    if (userIds) {
      filter.userId = { $in: userIds };
    }
  }

  const findOptions = query.status === 'deleted' ? { includeDeleted: true } : undefined;

  return { filter, findOptions };
}

export async function adminList(
  query: AdminCandidateListQuery,
  viewer?: ContactViewer,
): Promise<{
  data: Record<string, unknown>[];
  meta: ReturnType<typeof paginationMeta>;
}> {
  const { filter, findOptions } = await buildAdminFilter(query);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || SEARCH_PAGE_SIZE), 100);

  const modelQuery = CandidateProfile.find(filter, null, findOptions).select('+phone');
  const builder = new QueryBuilder<ICandidateProfileDocument>(modelQuery, query)
    .search(['firstName', 'lastName', 'phone'])
    .sort('-createdAt')
    .paginate(SEARCH_PAGE_SIZE);

  const [profiles, total] = await Promise.all([
    builder.query.exec(),
    CandidateProfile.countDocuments(builder.countFilter(filter), findOptions),
  ]);

  const data = await enrichCandidatesAdmin(profiles, { includeEmail: mayViewContact(viewer) });

  return { data, meta: paginationMeta(page, limit, total) };
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Spreadsheets run cells that start with these characters as formulas; phone numbers are safe.
  if (/^[=+\-@\t\r]/.test(text) && !/^\+?[\d\s().-]+$/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV of the candidates matching the dashboard's filters. Contact columns are only included
 * when explicitly requested by an admin allowed to see contacts, and that export is logged.
 */
export async function adminExportCsv(
  query: AdminCandidateListQuery & { withContact?: string },
  viewer: { id: string; permissions: string[]; adminLevel?: 'super' | 'sub' | null },
): Promise<string> {
  const { filter, findOptions } = await buildAdminFilter(query);
  const searchFilter = textSearchFilter(query.q, ['firstName', 'lastName']);
  if (searchFilter) Object.assign(filter, searchFilter);

  const includeContact = query.withContact === 'true' && mayViewContact(viewer);

  let modelQuery = CandidateProfile.find(filter, null, findOptions).sort({ createdAt: -1 });
  if (includeContact) modelQuery = modelQuery.select('+phone');
  const candidates: any[] = await modelQuery.lean();

  const emailByUser = new Map<string, string>();
  if (includeContact && candidates.length) {
    const users = await User.find({ _id: { $in: candidates.map((c) => c.userId) } })
      .setOptions({ includeDeleted: true })
      .select('email')
      .lean();
    users.forEach((u: any) => emailByUser.set(String(u._id), u.email));
  }

  const contactColumns: Array<[string, (c: any) => unknown]> = includeContact
    ? [
        ['phone', (c) => c.phone],
        ['email', (c) => emailByUser.get(String(c.userId)) ?? ''],
      ]
    : [];

  const columns: Array<[string, (c: any) => unknown]> = [
    ['id', (c) => String(c._id)],
    ['firstName', (c) => c.firstName],
    ['lastName', (c) => c.lastName],
    ['city', (c) => c.city],
    ['positionId', (c) => c.positionId],
    ['sectorId', (c) => c.sectorId],
    ...contactColumns,
    ['verified', (c) => c.verified],
    ['completionPercent', (c) => c.completionPercent],
    ['createdAt', (c) => (c.createdAt ? new Date(c.createdAt).toISOString() : '')],
  ];

  const rows = candidates.map((candidate) =>
    columns.map(([, read]) => csvCell(read(candidate))).join(','),
  );

  if (includeContact) {
    await activityLogService.log({
      actorUserId: viewer.id,
      actorLabel: 'Admin',
      action: 'contact.exported',
      targetType: 'candidate-export',
      targetId: viewer.id,
      detail: {
        fr: `Export CSV avec coordonnées (${candidates.length} candidats)`,
        en: `CSV export with contact details (${candidates.length} candidates)`,
      },
    });
  }

  return `﻿${[columns.map(([name]) => name).join(','), ...rows].join('\n')}`;
}

export async function adminFindById(
  id: string,
  options: AdminFindCandidateOptions = {},
): Promise<Record<string, unknown>> {
  const findOptions = { includeDeleted: true };
  const profile = await CandidateProfile.findById(id, null, findOptions).select('+phone');
  if (!profile) {
    throw new ApiError(404, 'Candidate profile not found');
  }

  const mayReveal = Boolean(options.revealContact && mayViewContact(options.viewer));

  if (mayReveal) {
    await logContactView(options.viewer!, profile, {
      ip: options.ip,
      userAgent: options.userAgent,
    });
  }

  return enrichCandidateAdmin(profile, { includeContact: mayReveal });
}

export async function adminUpdate(
  id: string,
  input: AdminUpdateCandidateInput,
  adminUserId: string,
): Promise<Record<string, unknown>> {
  const profile = await CandidateProfile.findById(id).select('+phone');
  if (!profile) {
    throw new ApiError(404, 'Candidate profile not found');
  }

  if (input.sectorId !== undefined) profile.sectorId = input.sectorId;
  if (input.positionId !== undefined) profile.positionId = input.positionId;

  if (profile.sectorId && profile.positionId) {
    taxonomyService.ensurePositionBelongsToSector(profile.positionId, profile.sectorId);
  }

  if (input.firstName !== undefined) profile.firstName = input.firstName;
  if (input.lastName !== undefined) profile.lastName = input.lastName;
  if (input.city !== undefined) profile.city = input.city;
  if (input.experience !== undefined) profile.experience = input.experience;
  if (input.availability !== undefined) profile.availability = input.availability;
  if (input.contractType !== undefined) profile.contractType = input.contractType;
  if (input.expectedSalary !== undefined) profile.expectedSalary = input.expectedSalary;
  if (input.phone !== undefined) profile.phone = input.phone;
  if (input.about !== undefined) profile.about = input.about;
  if (input.skills !== undefined) profile.skills = input.skills;
  if (input.languages !== undefined) profile.languages = input.languages;

  await refreshSearchable(profile);

  await profile.save();
  await logAdminCandidateAction(adminUserId, 'candidate.updated', profile, {
    fr: `Profil modifié : ${profile.firstName} ${profile.lastName}`,
    en: `Profile updated: ${profile.firstName} ${profile.lastName}`,
  });

  return enrichCandidateAdmin(profile);
}

export async function adminListApplications(candidateId: string): Promise<unknown[]> {
  const profile = await CandidateProfile.findById(candidateId, null, { includeDeleted: true });
  if (!profile) {
    throw new ApiError(404, 'Candidate profile not found');
  }

  const { Application } = await import('../application/application.model');
  const { Job } = await import('../job/job.model');
  const { EmployerProfile } = await import('../employer/employer.model');

  const applications = await Application.find({ candidateId: profile._id }).sort({
    appliedAt: -1,
  });

  const jobIds = applications.map((a: any) => a.jobId);
  const employerIds = applications.map((a: any) => a.employerId);

  const [jobs, employers] = await Promise.all([
    Job.find({ _id: { $in: jobIds } }).lean(),
    EmployerProfile.find({ _id: { $in: employerIds } }).lean(),
  ]);

  const jobById = new Map(jobs.map((j: any) => [String(j._id), j]));
  const employerById = new Map(employers.map((e: any) => [String(e._id), e]));

  return applications.map((app: any) => {
    const json = app.toJSON() as Record<string, unknown>;
    const job = jobById.get(String(app.jobId));
    const employer = employerById.get(String(app.employerId));
    return {
      ...json,
      job: job ?? null,
      employer: employer ?? null,
    };
  });
}

export async function adminGetHistory(candidateId: string): Promise<{
  contactRequests: unknown[];
  adminActions: unknown[];
}> {
  const profile = await CandidateProfile.findById(candidateId, null, { includeDeleted: true });
  if (!profile) {
    throw new ApiError(404, 'Candidate profile not found');
  }

  const { ActivityLog } = await import('../activityLog/activityLog.model');
  const candidateObjectId = toObjectId(candidateId);

  const [contactRequests, adminActions] = await Promise.all([
    ActivityLog.find({
      action: 'contact.viewed',
      targetType: 'candidate',
      targetId: candidateObjectId,
    })
      .sort({ createdAt: -1 })
      .lean(),
    ActivityLog.find({
      targetType: 'candidate',
      targetId: candidateObjectId,
      action: { $ne: 'contact.viewed' },
    })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const mapEntry = (entry: any) => ({
    ...entry,
    id: String(entry._id),
    type: activityLogService.activityTypeFromAction(entry.action),
  });

  return {
    contactRequests: contactRequests.map(mapEntry),
    adminActions: adminActions.map(mapEntry),
  };
}

export async function adminAddSkill(
  id: string,
  skillId: string,
  adminUserId: string,
): Promise<Record<string, unknown>> {
  const profile = await CandidateProfile.findById(id);
  if (!profile) {
    throw new ApiError(404, 'Candidate profile not found');
  }

  if (!profile.skills.includes(skillId)) {
    profile.skills.push(skillId);
    await profile.save();
    await logAdminCandidateAction(adminUserId, 'candidate.skillAdded', profile, {
      fr: `Compétence ajoutée : ${skillId}`,
      en: `Skill added: ${skillId}`,
    });
  }

  return enrichCandidateAdmin(profile);
}

export async function adminRemoveSkill(
  id: string,
  skillId: string,
  adminUserId: string,
): Promise<Record<string, unknown>> {
  const profile = await CandidateProfile.findById(id);
  if (!profile) {
    throw new ApiError(404, 'Candidate profile not found');
  }

  if (profile.skills.includes(skillId)) {
    profile.skills = profile.skills.filter((s: string) => s !== skillId);
    await profile.save();
    await logAdminCandidateAction(adminUserId, 'candidate.skillRemoved', profile, {
      fr: `Compétence retirée : ${skillId}`,
      en: `Skill removed: ${skillId}`,
    });
  }

  return enrichCandidateAdmin(profile);
}

export async function setVerification(
  id: string,
  input: SetVerificationInput,
): Promise<Record<string, unknown>> {
  const profile = await CandidateProfile.findById(id).select('+phone');
  if (!profile) {
    throw new ApiError(404, 'Candidate profile not found');
  }

  const wasVerified = profile.verified;
  profile.verified = input.verified;
  profile.verifiedAt = input.verified ? new Date() : null;
  profile.verifiedBy = input.verified ? toObjectId(input.adminUserId) : null;
  await profile.save();

  await logAdminCandidateAction(
    input.adminUserId,
    input.verified ? 'candidate.verified' : 'candidate.unverified',
    profile,
  );

  if (input.verified && !wasVerified) {
    await notificationService.notifyCandidateVerified(profile);
  }

  return enrichCandidateAdmin(profile);
}

export async function setStatus(
  id: string,
  input: SetCandidateStatusInput,
  adminUserId?: string,
): Promise<Record<string, unknown>> {
  const profile = await CandidateProfile.findById(id, null, { includeDeleted: true }).select('+phone');
  if (!profile) {
    throw new ApiError(404, 'Candidate profile not found');
  }

  const user = await findUserIncludingDeleted(String(profile.userId));

  if (!user) {
    throw new ApiError(404, 'User account not found');
  }

  if (input.status === 'deleted') {
    user.status = 'deleted';
    profile.searchable = false;
    await user.save();
    await user.softDelete();
    await profile.softDelete();
    if (adminUserId) {
      await logAdminCandidateAction(adminUserId, 'candidate.deleted', profile);
    }
    return enrichCandidateAdmin(profile);
  }

  if (input.status === 'active') {
    user.status = 'active';
    user.deletedAt = null;
    profile.deletedAt = null;
  } else {
    user.status = 'suspended';
  }

  await user.save();
  await refreshSearchable(profile);
  await profile.save();

  if (adminUserId) {
    const action =
      input.status === 'suspended' ? 'candidate.suspended' : 'candidate.restored';
    await logAdminCandidateAction(adminUserId, action, profile);
  }

  return enrichCandidateAdmin(profile);
}

export async function softDelete(
  id: string,
  adminUserId: string,
): Promise<ICandidateProfileDocument> {
  const profile = await CandidateProfile.findById(id).select('+phone');
  if (!profile) {
    throw new ApiError(404, 'Candidate profile not found');
  }
  profile.searchable = false;
  await profile.softDelete();

  const user = await findUserIncludingDeleted(String(profile.userId));
  if (user) {
    user.status = 'deleted';
    await user.softDelete();
  }

  await logAdminCandidateAction(adminUserId, 'candidate.deleted', profile);

  return profile;
}

/** Takes a rejected photo off the profile using it, so it stops showing and can be replaced. */
export async function detachRejectedMedia(asset: {
  _id: unknown;
  ownerUserId: Types.ObjectId;
  kind: string;
}): Promise<void> {
  const profile = await CandidateProfile.findOne({ userId: asset.ownerUserId }).select('+phone');
  if (!profile) return;

  const assetId = toObjectId(String(asset._id));

  if (asset.kind === 'profile-photo' && profile.photoId?.equals(assetId)) {
    profile.photoId = null;
  } else if (asset.kind === 'dish-photo') {
    profile.foodPhotoIds = profile.foodPhotoIds.filter((id: Types.ObjectId) => !id.equals(assetId));
  } else {
    return;
  }

  await refreshSearchable(profile);
  await profile.save();
}

/** Who uploaded each photo, for moderators who may not be allowed to read candidate records. */
export async function summariesByUserIds(
  userIds: Types.ObjectId[],
): Promise<Map<string, Record<string, unknown>>> {
  if (!userIds.length) return new Map();

  const profiles = await CandidateProfile.find({ userId: { $in: userIds } }, null, {
    includeDeleted: true,
  }).lean();

  return new Map(
    profiles.map((p: any) => [
      String(p.userId),
      {
        id: String(p._id),
        firstName: p.firstName,
        lastName: p.lastName,
        sectorId: p.sectorId,
        positionId: p.positionId,
        city: p.city,
        experience: p.experience,
        verified: p.verified,
      },
    ]),
  );
}
