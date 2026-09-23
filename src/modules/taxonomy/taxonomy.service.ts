import { ApiError } from '@/shared/ApiError';
import {
  CreateTaxonomyInput,
  ITaxonomyDocument,
  UpdateTaxonomyInput,
} from './taxonomy.interface';
import { Taxonomy } from './taxonomy.model';
import { TaxonomyType } from './taxonomy.constant';

let cache: ITaxonomyDocument[] | null = null;

export async function loadCache(): Promise<void> {
  cache = await Taxonomy.find({ active: true }).sort({ type: 1, order: 1 });
}

async function ensureCache(): Promise<ITaxonomyDocument[]> {
  if (!cache) {
    await loadCache();
  }
  return cache!;
}

export async function getAll(): Promise<ITaxonomyDocument[]> {
  return ensureCache();
}

export async function getByType(type: TaxonomyType): Promise<ITaxonomyDocument[]> {
  const items = await ensureCache();
  return items.filter((item) => item.type === type);
}

export async function getPositionsBySector(sectorId: string): Promise<ITaxonomyDocument[]> {
  const items = await ensureCache();
  return items.filter((item) => item.type === 'position' && item.parentKey === sectorId);
}

export async function findByTypeAndKey(
  type: TaxonomyType,
  key: string,
): Promise<ITaxonomyDocument | undefined> {
  const items = await ensureCache();
  return items.find((item) => item.type === type && item.key === key);
}

export function ensurePositionBelongsToSector(positionId: string, sectorId: string): void {
  const position = cache?.find((item) => item.type === 'position' && item.key === positionId);
  if (!position) {
    throw new ApiError(422, 'Invalid position');
  }
  if (position.parentKey !== sectorId) {
    throw new ApiError(422, 'Position does not belong to the selected sector');
  }
}

export async function allowsFoodPhotos(positionId: string): Promise<boolean> {
  const position = await findByTypeAndKey('position', positionId);
  if (!position) return false;
  const meta = position.meta as { allowsFoodPhotos?: boolean } | undefined;
  return Boolean(meta?.allowsFoodPhotos);
}

// Writes reload the cache instead of clearing it: ensurePositionBelongsToSector reads it
// synchronously, so an emptied cache would reject every position until something refilled it.
export async function create(input: CreateTaxonomyInput): Promise<ITaxonomyDocument> {
  const doc = await Taxonomy.create({
    type: input.type,
    key: input.key.trim(),
    label: input.label,
    parentKey: input.parentKey ?? null,
    group: input.group ?? null,
    meta: input.meta ?? {},
    order: input.order ?? 0,
    active: input.active ?? true,
  });
  await loadCache();
  return doc;
}

export async function update(
  type: TaxonomyType,
  key: string,
  input: UpdateTaxonomyInput,
): Promise<ITaxonomyDocument> {
  const doc = await Taxonomy.findOneAndUpdate({ type, key }, input, { new: true });
  if (!doc) {
    throw new ApiError(404, 'Taxonomy entry not found');
  }
  await loadCache();
  return doc;
}

export async function remove(type: TaxonomyType, key: string): Promise<ITaxonomyDocument> {
  const doc = await Taxonomy.findOneAndDelete({ type, key });
  if (!doc) {
    throw new ApiError(404, 'Taxonomy entry not found');
  }
  await loadCache();
  return doc;
}
