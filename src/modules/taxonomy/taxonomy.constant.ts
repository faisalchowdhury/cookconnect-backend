export const TAXONOMY_TYPES = [
  'sector',
  'position',
  'city',
  'contract-type',
  'establishment-type',
  'experience-level',
  'availability',
  'requirement',
  'benefit',
  'skill',
] as const;

export type TaxonomyType = (typeof TAXONOMY_TYPES)[number];
