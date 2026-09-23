import type { FilterQuery } from '@/types/mongoose';
import { Types } from 'mongoose';
import { ApiError } from '@/shared/ApiError';
import { paginationMeta, QueryBuilder } from '@/shared/QueryBuilder';
import {
  AdminPartnerListQuery,
  CreatePartnerInput,
  IPartnerDocument,
  UpdatePartnerInput,
} from './partner.interface';
import { Partner } from './partner.model';

const DEFAULT_PARTNER_LIMIT = 20;

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

export async function listPublic(): Promise<Array<Record<string, unknown>>> {
  const partners = await Partner.find({ active: true }).sort({ order: 1, createdAt: -1 });
  const { resolveMediaUrl } = await import('@/shared/enrichMedia');
  return Promise.all(
    partners.map(async (partner: IPartnerDocument) => {
      const json = partner.toJSON() as unknown as Record<string, unknown>;
      json.logoUrl = await resolveMediaUrl(partner.logoId);
      return json;
    }),
  );
}

export async function adminList(query: AdminPartnerListQuery = {}): Promise<{
  data: IPartnerDocument[];
  meta: ReturnType<typeof paginationMeta>;
}> {
  const filter: FilterQuery<IPartnerDocument> = {};
  if (query.active === 'true') filter.active = true;
  if (query.active === 'false') filter.active = false;

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || DEFAULT_PARTNER_LIMIT), 100);

  const modelQuery = Partner.find(filter);
  const builder = new QueryBuilder<IPartnerDocument>(modelQuery, query);
  // Mongoose sort strings are space-separated; only a client `sort` param has its commas converted.
  builder.sort('order -createdAt').paginate(DEFAULT_PARTNER_LIMIT);

  const [data, total] = await Promise.all([
    builder.query.exec(),
    Partner.countDocuments(filter),
  ]);

  return { data, meta: paginationMeta(page, limit, total) };
}

export async function adminFindById(id: string): Promise<IPartnerDocument> {
  const partner = await Partner.findById(id);
  if (!partner) {
    throw new ApiError(404, 'Partner not found');
  }
  return partner;
}

export async function create(input: CreatePartnerInput): Promise<IPartnerDocument> {
  return Partner.create({
    name: input.name.trim(),
    logoId: input.logoId ? toObjectId(input.logoId) : null,
    href: input.href.trim(),
    order: input.order ?? 0,
    active: input.active ?? true,
  });
}

export async function update(id: string, input: UpdatePartnerInput): Promise<IPartnerDocument> {
  const partner = await adminFindById(id);

  if (input.name !== undefined) partner.name = input.name.trim();
  if (input.logoId !== undefined) {
    partner.logoId = input.logoId ? toObjectId(input.logoId) : null;
  }
  if (input.href !== undefined) partner.href = input.href.trim();
  if (input.order !== undefined) partner.order = input.order;
  if (input.active !== undefined) partner.active = input.active;

  return partner.save();
}

export async function remove(id: string): Promise<IPartnerDocument> {
  const partner = await adminFindById(id);
  return partner.softDelete();
}
