import { Types } from 'mongoose';
import type { FilterQuery } from '@/types/mongoose';
import { ApiError } from '@/shared/ApiError';
import { paginationMeta, QueryBuilder } from '@/shared/QueryBuilder';
import { DEFAULT_BANNER_LIMIT } from './banner.constant';
import {
  AdminBannerListQuery,
  CreateBannerInput,
  IBannerDocument,
  PublicBannerQuery,
  UpdateBannerInput,
} from './banner.interface';
import { Banner } from './banner.model';

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

function isScheduleActive(banner: IBannerDocument, now = new Date()): boolean {
  if (banner.startsAt && banner.startsAt > now) return false;
  if (banner.endsAt && banner.endsAt < now) return false;
  return true;
}

export async function listPublic(
  query: PublicBannerQuery = {},
): Promise<Array<Record<string, unknown>>> {
  const now = new Date();
  const filter: FilterQuery<IBannerDocument> = { active: true };
  if (query.placement) filter.placement = query.placement;

  const banners = await Banner.find(filter).sort({ order: 1, createdAt: -1 });
  const active = banners.filter((banner: any) => isScheduleActive(banner, now));

  const { resolveMediaUrl } = await import('@/shared/enrichMedia');
  return Promise.all(
    active.map(async (banner: IBannerDocument) => {
      const json = banner.toJSON() as unknown as Record<string, unknown>;
      json.imageUrl = await resolveMediaUrl(banner.imageId);
      return json;
    }),
  );
}

export async function recordImpressions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await Banner.updateMany(
    { _id: { $in: ids.map((id) => toObjectId(id)) } },
    { $inc: { impressions: 1 } },
  );
}

export async function recordClick(id: string): Promise<IBannerDocument> {
  // Only banners the public can currently see take clicks, so hidden ones cannot be inflated.
  const now = new Date();
  const banner = await Banner.findOneAndUpdate(
    {
      _id: id,
      active: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    },
    { $inc: { clicks: 1 } },
    { new: true },
  );

  if (!banner) {
    throw new ApiError(404, 'Banner not found');
  }

  return banner;
}

export async function adminList(query: AdminBannerListQuery = {}): Promise<{
  data: IBannerDocument[];
  meta: ReturnType<typeof paginationMeta>;
}> {
  const filter: FilterQuery<IBannerDocument> = {};
  if (query.placement) filter.placement = query.placement;
  if (query.active === 'true') filter.active = true;
  if (query.active === 'false') filter.active = false;

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || DEFAULT_BANNER_LIMIT), 100);

  const modelQuery = Banner.find(filter);
  const builder = new QueryBuilder<IBannerDocument>(modelQuery, query);
  // Mongoose sort strings are space-separated; only a client `sort` param has its commas converted.
  builder.sort('order -createdAt').paginate(DEFAULT_BANNER_LIMIT);

  const [data, total] = await Promise.all([
    builder.query.exec(),
    Banner.countDocuments(filter),
  ]);

  return { data, meta: paginationMeta(page, limit, total) };
}

export async function adminFindById(id: string): Promise<IBannerDocument> {
  const banner = await Banner.findById(id);
  if (!banner) {
    throw new ApiError(404, 'Banner not found');
  }
  return banner;
}

export async function create(input: CreateBannerInput): Promise<IBannerDocument> {
  return Banner.create({
    placement: input.placement,
    title: input.title,
    subtitle: input.subtitle ?? { fr: '' },
    cta: input.cta ?? { fr: '' },
    href: input.href.trim(),
    imageId: input.imageId ? toObjectId(input.imageId) : null,
    theme: input.theme?.trim() ?? '',
    order: input.order ?? 0,
    active: input.active ?? true,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
  });
}

export async function update(id: string, input: UpdateBannerInput): Promise<IBannerDocument> {
  const banner = await adminFindById(id);

  if (input.placement !== undefined) banner.placement = input.placement;
  if (input.title !== undefined) banner.title = input.title;
  if (input.subtitle !== undefined) banner.subtitle = input.subtitle;
  if (input.cta !== undefined) banner.cta = input.cta;
  if (input.href !== undefined) banner.href = input.href.trim();
  if (input.imageId !== undefined) {
    banner.imageId = input.imageId ? toObjectId(input.imageId) : null;
  }
  if (input.theme !== undefined) banner.theme = input.theme.trim();
  if (input.order !== undefined) banner.order = input.order;
  if (input.active !== undefined) banner.active = input.active;
  if (input.startsAt !== undefined) banner.startsAt = input.startsAt;
  if (input.endsAt !== undefined) banner.endsAt = input.endsAt;

  // The request schema only sees the fields sent; this also covers one date against the stored other.
  if (banner.startsAt && banner.endsAt && banner.endsAt < banner.startsAt) {
    throw new ApiError(422, 'endsAt must not be before startsAt');
  }

  return banner.save();
}

export async function remove(id: string): Promise<IBannerDocument> {
  const banner = await adminFindById(id);
  return banner.softDelete();
}
