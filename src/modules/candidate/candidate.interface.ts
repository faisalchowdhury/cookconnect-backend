import { Document, Types } from 'mongoose';
import { LocalizedString } from '@/shared/localizedString';
import {
  Availability,
  ContractType,
  ExperienceLevel,
} from './candidate.constant';

export interface ICandidateTraining {
  school: string;
  diploma: string;
  from: string;
  to: string;
}

export interface ICandidateHistory {
  establishment: string;
  positionId: string;
  from: string;
  to: string;
}

export interface ICandidateProfile {
  userId: Types.ObjectId;
  firstName: string;
  lastName: string;
  photoId: Types.ObjectId | null;
  sectorId: string;
  positionId: string;
  city: string;
  country: string;
  experience: ExperienceLevel | '';
  availability: Availability | '';
  contractType: ContractType | '';
  expectedSalary: number | null;
  phone: string;
  about: LocalizedString;
  skills: string[];
  languages: string[];
  training: ICandidateTraining[];
  history: ICandidateHistory[];
  foodPhotoIds: Types.ObjectId[];
  cvAssetId: Types.ObjectId | null;
  completionPercent: number;
  verified: boolean;
  verifiedAt: Date | null;
  verifiedBy: Types.ObjectId | null;
  profileViews: number;
  searchable: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICandidateProfileDocument extends ICandidateProfile, Document {
  id: string;
  softDelete(): Promise<ICandidateProfileDocument>;
}

export type UpdateCandidateInput = Partial<
  Pick<
    ICandidateProfile,
    | 'firstName'
    | 'lastName'
    | 'sectorId'
    | 'positionId'
    | 'city'
    | 'country'
    | 'experience'
    | 'availability'
    | 'contractType'
    | 'expectedSalary'
    | 'phone'
    | 'about'
    | 'skills'
    | 'languages'
    | 'training'
    | 'history'
  >
>;

export type CandidateSearchQuery = {
  q?: string;
  city?: string;
  sectorId?: string;
  positionId?: string;
  experience?: ExperienceLevel;
  availability?: Availability;
  page?: number;
  limit?: number;
};

export type CandidateViewer = {
  id: string;
  role: 'candidate' | 'employer' | 'admin';
  permissions: string[];
  adminLevel?: 'super' | 'sub' | null;
} | null;

export type SetVerificationInput = {
  verified: boolean;
  adminUserId: string;
};

export type SetCandidateStatusInput = {
  status: 'active' | 'suspended' | 'deleted';
};

export type AdminCandidateListQuery = {
  verified?: 'true' | 'false';
  q?: string;
  page?: number;
  limit?: number;
  status?: string;
  sectorId?: string;
  sector?: string;
  positionId?: string;
  position?: string;
  city?: string;
  experience?: ExperienceLevel;
  availability?: Availability;
  minCompletion?: number;
};

export type AdminUpdateCandidateInput = Partial<
  Pick<
    ICandidateProfile,
    | 'firstName'
    | 'lastName'
    | 'phone'
    | 'city'
    | 'sectorId'
    | 'positionId'
    | 'experience'
    | 'availability'
    | 'contractType'
    | 'expectedSalary'
    | 'about'
    | 'skills'
    | 'languages'
  >
>;

export type AdminFindCandidateOptions = {
  revealContact?: boolean;
  viewer?: CandidateViewer;
  ip?: string;
  userAgent?: string;
};
