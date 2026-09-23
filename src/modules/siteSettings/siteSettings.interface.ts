import { Document, Types } from 'mongoose';
import { LocalizedString } from '@/shared/localizedString';
import { SiteSettingsMode } from './siteSettings.constant';

export interface ISiteSettings {
  mode: SiteSettingsMode;
  imageId: Types.ObjectId | null;
  headline: LocalizedString;
  subheadline: LocalizedString;
  cta: LocalizedString;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISiteSettingsDocument extends ISiteSettings, Document {
  id: string;
}

export type UpdateSiteSettingsInput = {
  mode?: SiteSettingsMode;
  imageId?: string | null;
  headline?: LocalizedString;
  subheadline?: LocalizedString;
  cta?: LocalizedString;
};
