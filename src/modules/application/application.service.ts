import { Types } from 'mongoose';
import { logger } from '@/config/logger';
import { ApiError } from '@/shared/ApiError';
import { resolveMediaWithModeration } from '@/shared/enrichMedia';
import { Job } from '@/modules/job/job.model';
import { APPLICATION_STATUSES } from './application.constant';
import {
  CreateApplicationInput,
  IApplicationDocument,
  UpdateApplicationStatusInput,
} from './application.interface';
import { Application } from './application.model';

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

async function resolveCandidateProfile(userId: string): Promise<{
  _id: Types.ObjectId;
  completionPercent?: number;
  userId: Types.ObjectId;
}> {
  try {
    const { CandidateProfile } = await import('@/modules/candidate/candidate.model');
    const profile = await CandidateProfile.findOne({ userId: toObjectId(userId) });
    if (!profile) {
      throw new ApiError(404, 'Candidate profile not found');
    }
    return profile;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(404, 'Candidate profile not found');
  }
}

async function assertProfileComplete(userId: string): Promise<void> {
  try {
    const candidateService = await import('@/modules/candidate/candidate.service');
    if (typeof candidateService.isProfileComplete === 'function') {
      const complete = await candidateService.isProfileComplete(userId);
      if (!complete) {
        throw new ApiError(422, 'Complete your profile before applying');
      }
      return;
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
  }

  const profile = await resolveCandidateProfile(userId);
  if (typeof profile.completionPercent !== 'number' || profile.completionPercent < 100) {
    throw new ApiError(422, 'Complete your profile before applying');
  }
}

async function notifyStatusChange(
  application: IApplicationDocument,
  status: (typeof APPLICATION_STATUSES)[number],
): Promise<void> {
  try {
    const notificationService = await import('@/modules/notification/notification.service');
    await notificationService.notifyApplicationStatusChange(application, status);
  } catch (err) {
    logger.error('Failed to notify candidate of an application status change', {
      err,
      applicationId: String(application._id),
    });
  }
}

export async function create(input: CreateApplicationInput): Promise<IApplicationDocument> {
  await assertProfileComplete(input.candidateUserId);

  const job = await Job.findById(input.jobId);
  // Imported lazily: job.service pulls in the employer and notification modules.
  const { isEmployerHidden } = await import('@/modules/job/job.service');
  if (!job || job.status !== 'active' || (await isEmployerHidden(job.employerId))) {
    throw new ApiError(404, 'Job not found or not accepting applications');
  }

  const candidate = await resolveCandidateProfile(input.candidateUserId);
  const now = new Date();

  let application: IApplicationDocument;
  try {
    application = await Application.create({
      jobId: job._id,
      candidateId: candidate._id,
      employerId: job.employerId,
      status: 'pending',
      coverNote: input.coverNote?.trim() || null,
      appliedAt: now,
      timeline: [
        {
          status: 'pending',
          at: now,
          byUserId: toObjectId(input.candidateUserId),
          note: null,
        },
      ],
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ApiError(409, 'You have already applied to this job');
    }
    throw err;
  }

  await Job.updateOne({ _id: job._id }, { $inc: { applicationCount: 1 } });

  try {
    const { notifyNewApplication } = await import('@/modules/notification/notification.service');
    await notifyNewApplication(application, job.title?.fr);
  } catch (err) {
    // The application is already saved; a failed notification must not report it as failed.
    logger.error('Failed to notify the employer of a new application', {
      err,
      applicationId: String(application._id),
    });
  }

  return application;
}

export async function listMine(candidateUserId: string): Promise<IApplicationDocument[]> {
  const candidate = await resolveCandidateProfile(candidateUserId);
  return Application.find({ candidateId: candidate._id })
    .sort({ appliedAt: -1 })
    .populate('jobId');
}

async function resolveEmployerProfileId(userId: string): Promise<Types.ObjectId> {
  try {
    const { EmployerProfile } = await import('@/modules/employer/employer.model');
    const profile = await EmployerProfile.findOne({ userId: toObjectId(userId) });
    if (!profile) {
      throw new ApiError(404, 'Employer profile not found');
    }
    return profile._id;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(404, 'Employer profile not found');
  }
}

async function applicantPhotoUrl(photoId: unknown): Promise<string | null> {
  if (!photoId) return null;
  const [photo] = await resolveMediaWithModeration([photoId as Types.ObjectId]);
  // Rejected photos stay stored for the audit trail but must not be shown to employers.
  return photo && photo.moderationStatus !== 'rejected' ? photo.url : null;
}

export async function listReceived(
  employerUserId: string,
  status?: string,
): Promise<Record<string, unknown>[]> {
  const employerId = await resolveEmployerProfileId(employerUserId);
  const filter: Record<string, unknown> = { employerId };
  if (status && APPLICATION_STATUSES.includes(status as (typeof APPLICATION_STATUSES)[number])) {
    filter.status = status;
  }

  const applications = await Application.find(filter)
    .sort({ appliedAt: -1 })
    .populate('jobId')
    .populate('candidateId');

  // The populated profile only holds the photo's asset id; employers need its URL.
  return Promise.all(
    applications.map(async (application: IApplicationDocument) => {
      const json = application.toJSON() as unknown as Record<string, unknown>;
      const candidate = json.candidateId;
      if (candidate && typeof candidate === 'object' && !(candidate instanceof Types.ObjectId)) {
        const profile = candidate as Record<string, unknown>;
        profile.photoUrl = await applicantPhotoUrl(profile.photoId);
      }
      return json;
    }),
  );
}

export async function updateStatus(
  applicationId: string,
  input: UpdateApplicationStatusInput,
): Promise<IApplicationDocument> {
  const employerId = await resolveEmployerProfileId(input.employerUserId);
  const application = await Application.findOne({ _id: applicationId, employerId });

  if (!application) {
    throw new ApiError(404, 'Application not found');
  }

  if (!APPLICATION_STATUSES.includes(input.status)) {
    throw new ApiError(422, 'Invalid application status');
  }

  // Re-sending the current status must not add a timeline entry or notify the candidate again.
  if (application.status === input.status) {
    return application;
  }

  application.status = input.status;
  application.timeline.push({
    status: input.status,
    at: new Date(),
    byUserId: toObjectId(input.employerUserId),
    note: input.note?.trim() || null,
  });

  await application.save();
  await notifyStatusChange(application, input.status);

  return application;
}
