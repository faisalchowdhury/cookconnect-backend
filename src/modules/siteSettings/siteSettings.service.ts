import { Types } from 'mongoose';
import { ApiError } from '@/shared/ApiError';
import { MediaAsset } from '@/modules/media/media.model';
import {
  DEFAULT_SITE_SETTINGS,
  SITE_SETTINGS_DOC_ID,
} from './siteSettings.constant';
import { ISiteSettingsDocument, UpdateSiteSettingsInput } from './siteSettings.interface';
import { SiteSettings } from './siteSettings.model';

function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

async function ensureDocument(): Promise<ISiteSettingsDocument> {
  let doc = await SiteSettings.findById(SITE_SETTINGS_DOC_ID);
  if (!doc) {
    doc = await SiteSettings.create({
      _id: SITE_SETTINGS_DOC_ID,
      ...DEFAULT_SITE_SETTINGS,
    });
  }
  return doc;
}

async function withImageUrl(doc: ISiteSettingsDocument): Promise<Record<string, unknown>> {
  const json = doc.toJSON() as unknown as Record<string, unknown>;
  const { resolveMediaUrl } = await import('@/shared/enrichMedia');
  json.imageUrl = await resolveMediaUrl(doc.imageId);
  return json;
}

export async function getPublic(): Promise<Record<string, unknown>> {
  return withImageUrl(await ensureDocument());
}

// The dashboard needs the resolved URL as well, or a saved background is blank in any other browser.
export async function getAdmin(): Promise<Record<string, unknown>> {
  return withImageUrl(await ensureDocument());
}

export async function update(input: UpdateSiteSettingsInput): Promise<Record<string, unknown>> {
  const doc = await ensureDocument();

  if (input.mode !== undefined) doc.mode = input.mode;
  if (input.imageId !== undefined) {
    if (input.imageId && !(await MediaAsset.exists({ _id: input.imageId }))) {
      throw new ApiError(422, 'Image not found');
    }
    doc.imageId = input.imageId ? toObjectId(input.imageId) : null;
  }
  if (input.headline !== undefined) doc.headline = input.headline;
  if (input.subheadline !== undefined) doc.subheadline = input.subheadline;
  if (input.cta !== undefined) doc.cta = input.cta;

  if (doc.mode === 'image' && !doc.imageId) {
    doc.mode = 'blank';
  }

  return withImageUrl(await doc.save());
}
