import { Document, Types } from 'mongoose';
import { LocalizedString } from '@/shared/localizedString';
import { BannerPlacement } from './banner.constant';

export interface IBanner {
  placement: BannerPlacement;
  title: LocalizedString;
  subtitle: LocalizedString;
  cta: LocalizedString;
  href: string;
  imageId: Types.ObjectId | null;
  theme: string;
  order: number;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  impressions: number;
  clicks: number;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBannerDocument extends IBanner, Document {
  id: string;
  softDelete(): Promise<IBannerDocument>;
}

export type CreateBannerInput = {
  placement: BannerPlacement;
  title: LocalizedString;
  subtitle?: LocalizedString;
  cta?: LocalizedString;
  href: string;
  imageId?: string | null;
  theme?: string;
  order?: number;
  active?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

export type UpdateBannerInput = Partial<
  Omit<CreateBannerInput, 'placement'> & { placement: BannerPlacement }
>;

export type PublicBannerQuery = {
  placement?: BannerPlacement;
};

export type AdminBannerListQuery = {
  placement?: BannerPlacement;
  active?: 'true' | 'false';
  page?: number;
  limit?: number;
};
