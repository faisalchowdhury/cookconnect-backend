import mongoose, { Schema } from 'mongoose';
import { TAXONOMY_TYPES } from './taxonomy.constant';
import { ITaxonomyDocument } from './taxonomy.interface';
import { localizedStringSchema } from '@/shared/localizedString';
import { toJSONPlugin } from '@/shared/mongoosePlugins';

const taxonomySchema = new Schema<ITaxonomyDocument>(
  {
    type: { type: String, enum: TAXONOMY_TYPES, required: true, index: true },
    key: { type: String, required: true, trim: true },
    label: { type: localizedStringSchema, required: true },
    parentKey: { type: String, default: null, index: true },
    group: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'taxonomies' },
);

taxonomySchema.index({ type: 1, key: 1 }, { unique: true });
taxonomySchema.index({ type: 1, parentKey: 1, order: 1 });

taxonomySchema.plugin(toJSONPlugin);

export const Taxonomy = mongoose.model('Taxonomy', taxonomySchema) as any;
