import { Document, Types } from 'mongoose';
import { LocalizedString } from '@/shared/localizedString';
import { ContractType, ExperienceLevel, JobStatus } from './job.constant';

export interface IJob {
  employerId: Types.ObjectId;
  title: LocalizedString;
  description: LocalizedString;
  sectorId: string;
  positionId: string;
  city: string;
  country: string;
  contractType: ContractType;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency: string;
  experience: ExperienceLevel;
  requirements: string[];
  benefits: string[];
  status: JobStatus;
  postedAt?: Date | null;
  expiresAt?: Date | null;
  extendedUntil?: Date | null;
  approvedBy?: Types.ObjectId | null;
  approvedAt?: Date | null;
  rejectionReason?: string | null;
  viewCount: number;
  applicationCount: number;
  reportCount: number;
  republishedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IJobDocument extends IJob, Document {
  _id: Types.ObjectId;
  softDelete(): Promise<IJobDocument>;
}

export type CreateJobInput = {
  employerUserId: string;
  title: LocalizedString;
  description: LocalizedString;
  sectorId: string;
  positionId: string;
  city: string;
  country?: string;
  contractType: ContractType;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string;
  experience: ExperienceLevel;
  requirements?: string[];
  benefits?: string[];
  asDraft?: boolean;
};

export type UpdateJobInput = Partial<
  Omit<CreateJobInput, 'employerUserId' | 'asDraft'>
> & {
  submit?: boolean;
};

export type AdminDecisionInput = {
  status: 'active' | 'rejected' | 'closed';
  rejectionReason?: string;
  adminUserId: string;
};

export type AdminUpdateJobInput = {
  title?: LocalizedString;
  description?: LocalizedString;
  salaryMin?: number | null;
  salaryMax?: number | null;
  city?: string;
  requirements?: string[];
  benefits?: string[];
  adminUserId: string;
};

export type ExtendJobInput = {
  extendedUntil: Date;
  adminUserId: string;
};

export type JobSearchQuery = Record<string, unknown>;

export type GroupedEmployerJobs = {
  active: IJobDocument[];
  pending: IJobDocument[];
  expired: IJobDocument[];
  draft: IJobDocument[];
  rejected: IJobDocument[];
  closed: IJobDocument[];
};
