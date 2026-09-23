import { Document } from 'mongoose';
import { LocalizedString } from '@/shared/localizedString';
import { TaxonomyType } from './taxonomy.constant';

export interface ITaxonomy {
  type: TaxonomyType;
  key: string;
  label: LocalizedString;
  parentKey: string | null;
  group: string | null;
  meta: Record<string, unknown>;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITaxonomyDocument extends ITaxonomy, Document {
  id: string;
}

export type CreateTaxonomyInput = {
  type: TaxonomyType;
  key: string;
  label: LocalizedString;
  parentKey?: string | null;
  group?: string | null;
  meta?: Record<string, unknown>;
  order?: number;
  active?: boolean;
};

export type UpdateTaxonomyInput = Partial<
  Pick<ITaxonomy, 'label' | 'parentKey' | 'group' | 'meta' | 'order' | 'active'>
>;
