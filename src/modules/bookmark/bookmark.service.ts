import { Types } from 'mongoose';
import { ApiError } from '@/shared/ApiError';
import { BookmarkKind } from './bookmark.constant';
import { CreateBookmarkInput, IBookmarkDocument } from './bookmark.interface';
import { Bookmark } from './bookmark.model';

/** Statuses an offer can be in once it has been published. */
const PUBLIC_JOB_STATUSES = ['active', 'expired', 'closed'];

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: number }).code === 11000
  );
}

// Targets the owner could still open: public offers, and profiles employers can view.
async function availableTargetIds(
  kind: BookmarkKind,
  targetIds: Types.ObjectId[],
): Promise<Set<string>> {
  if (!targetIds.length) return new Set();

  if (kind === 'saved-job') {
    const { Job } = await import('@/modules/job/job.model');
    const { hiddenEmployerIds } = await import('@/modules/job/job.service');
    const jobs = await Job.find({
      _id: { $in: targetIds },
      status: { $in: PUBLIC_JOB_STATUSES },
      employerId: { $nin: await hiddenEmployerIds() },
    })
      .select('_id')
      .lean();
    return new Set(jobs.map((job: { _id: Types.ObjectId }) => String(job._id)));
  }

  const { CandidateProfile } = await import('@/modules/candidate/candidate.model');
  const profiles = await CandidateProfile.find({ _id: { $in: targetIds }, searchable: true })
    .select('_id')
    .lean();
  return new Set(profiles.map((profile: { _id: Types.ObjectId }) => String(profile._id)));
}

export async function list(ownerUserId: string, kind: BookmarkKind): Promise<IBookmarkDocument[]> {
  const bookmarks: IBookmarkDocument[] = await Bookmark.find({
    ownerUserId: toObjectId(ownerUserId),
    kind,
  }).sort({ createdAt: -1 });

  const available = await availableTargetIds(
    kind,
    bookmarks.map((bookmark) => bookmark.targetId),
  );
  // Filtered, not deleted: an offer that is republished or a profile that is completed reappears.
  return bookmarks.filter((bookmark) => available.has(String(bookmark.targetId)));
}

export async function create(input: CreateBookmarkInput): Promise<IBookmarkDocument> {
  const targetId = toObjectId(input.targetId);
  if (!(await availableTargetIds(input.kind, [targetId])).has(String(targetId))) {
    throw new ApiError(
      404,
      input.kind === 'saved-job' ? 'Job not found' : 'Candidate profile not found',
    );
  }

  try {
    return await Bookmark.create({
      kind: input.kind,
      ownerUserId: toObjectId(input.ownerUserId),
      targetId,
      note: input.note?.trim() || null,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ApiError(409, 'Bookmark already exists');
    }
    throw err;
  }
}

export async function remove(
  ownerUserId: string,
  kind: BookmarkKind,
  targetId: string,
): Promise<void> {
  const result = await Bookmark.deleteOne({
    ownerUserId: toObjectId(ownerUserId),
    kind,
    targetId: toObjectId(targetId),
  });

  if (result.deletedCount === 0) {
    throw new ApiError(404, 'Bookmark not found');
  }
}
