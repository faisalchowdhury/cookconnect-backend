import { Document, Types } from 'mongoose';

export interface IPartner {
  name: string;
  logoId: Types.ObjectId | null;
  href: string;
  order: number;
  active: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPartnerDocument extends IPartner, Document {
  id: string;
  softDelete(): Promise<IPartnerDocument>;
}

export type CreatePartnerInput = {
  name: string;
  logoId?: string | null;
  href: string;
  order?: number;
  active?: boolean;
};

export type UpdatePartnerInput = Partial<CreatePartnerInput>;

export type AdminPartnerListQuery = {
  active?: 'true' | 'false';
  page?: number;
  limit?: number;
};
