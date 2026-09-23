import { Document, Types } from 'mongoose';
import { LocalizedString } from '@/shared/localizedString';
import { EmployerStatus, EmployerType } from './employer.constant';

export interface IEmployerSocials {
  instagram?: string;
  linkedin?: string;
  website?: string;
}

export interface IEmployerProfile {
  userId: Types.ObjectId;
  name: string;
  type: EmployerType | '';
  city: string;
  address: string;
  logoId: Types.ObjectId | null;
  coverId: Types.ObjectId | null;
  about: LocalizedString;
  phone: string;
  phonePublic: boolean;
  socials: IEmployerSocials;
  since: string;
  staffCount: string;
  status: EmployerStatus;
  verified: boolean;
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEmployerProfileDocument extends IEmployerProfile, Document {
  id: string;
  softDelete(): Promise<IEmployerProfileDocument>;
}

export type UpdateEmployerInput = Partial<
  Pick<
    IEmployerProfile,
    | 'name'
    | 'type'
    | 'city'
    | 'address'
    | 'about'
    | 'phone'
    | 'phonePublic'
    | 'socials'
    | 'since'
    | 'staffCount'
  >
>;

export type EmployerDecisionInput = {
  status: 'active' | 'rejected';
  adminUserId: string;
  rejectionReason?: string;
};

export type AdminEmployerListQuery = {
  status?: EmployerStatus;
  q?: string;
  page?: number;
  limit?: number;
};

export type DashboardCounters = {
  activeOffers: number;
  applicants: number;
  savedProfiles: number;
  profileViews: number;
};

export type EmployerActivityStats = {
  offersPublished: number;
  offersActive: number;
  applicationsReceived: number;
  profilesViewed: number;
  contactRequests: number;
  declaredHires: number;
  lastActivity: string | null;
};
