import { Schema } from 'mongoose';

export type LocalizedString = {
  fr: string;
  ar?: string;
  en?: string;
};

export const localizedStringSchema = new Schema<LocalizedString>(
  {
    fr: { type: String, required: true },
    ar: { type: String },
    en: { type: String },
  },
  { _id: false },
);

// For free text that starts out blank (profile "about", banner subtitle): Mongoose's
// `required` rejects '' for strings, so a `{ fr: '' }` default would fail validation.
export const optionalLocalizedStringSchema = new Schema<LocalizedString>(
  {
    fr: { type: String, default: '' },
    ar: { type: String },
    en: { type: String },
  },
  { _id: false },
);

export function pickLocalized(value: LocalizedString | undefined, locale: string): string {
  if (!value) return '';
  const key = locale as keyof LocalizedString;
  return value[key] || value.fr || '';
}
