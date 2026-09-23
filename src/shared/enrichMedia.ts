import { Types } from 'mongoose';
import { MediaAsset } from '@/modules/media/media.model';

function toIdString(id: Types.ObjectId | string): string {
  return typeof id === 'string' ? id : String(id);
}

export async function resolveMediaUrl(
  id: Types.ObjectId | string | null | undefined,
): Promise<string | null> {
  if (!id) return null;
  const idStr = toIdString(id);
  if (!Types.ObjectId.isValid(idStr)) return null;

  const asset = await MediaAsset.findById(idStr).select('url').lean();
  return asset?.url ?? null;
}

export async function resolveMediaUrls(
  ids: (Types.ObjectId | string)[],
): Promise<Array<{ id: string; url: string }>> {
  if (!ids.length) return [];

  const objectIds = ids
    .map((id) => toIdString(id))
    .filter((id) => Types.ObjectId.isValid(id));

  if (!objectIds.length) return [];

  const assets = await MediaAsset.find({ _id: { $in: objectIds } }).select('url').lean();
  const urlById = new Map(assets.map((a: any) => [String(a._id), a.url as string]));

  return objectIds
    .filter((id) => urlById.has(id))
    .map((id) => ({ id, url: urlById.get(id)! as string }));
}

export async function resolveMediaWithModeration(
  ids: (Types.ObjectId | string)[],
): Promise<Array<{ id: string; url: string; moderationStatus: string }>> {
  if (!ids.length) return [];

  const objectIds = ids
    .map((id) => toIdString(id))
    .filter((id) => Types.ObjectId.isValid(id));

  if (!objectIds.length) return [];

  const assets = await MediaAsset.find({ _id: { $in: objectIds } })
    .select('url moderationStatus')
    .lean();

  return assets.map((a: any) => ({
    id: String(a._id),
    url: a.url as string,
    moderationStatus: a.moderationStatus as string,
  }));
}
