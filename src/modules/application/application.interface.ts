import { Document, Types } from 'mongoose';
import { ApplicationStatus } from './application.constant';

export interface IApplicationTimelineEntry {
  status: ApplicationStatus;
  at: Date;
  byUserId?: Types.ObjectId | null;
  note?: string | null;
}

export interface IApplication {
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  employerId: Types.ObjectId;
  status: ApplicationStatus;
  coverNote?: string | null;
  timeline: IApplicationTimelineEntry[];
  appliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IApplicationDocument extends IApplication, Document {
  _id: Types.ObjectId;
}

export type CreateApplicationInput = {
  jobId: string;
  candidateUserId: string;
  coverNote?: string;
};

export type UpdateApplicationStatusInput = {
  status: ApplicationStatus;
  note?: string;
  employerUserId: string;
};
