export const JOB_STATUSES = [
  'draft',
  'pending',
  'active',
  'rejected',
  'expired',
  'closed',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const CONTRACT_TYPES = ['cdi', 'cdd', 'interim', 'stage', 'unspecified'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const EXPERIENCE_LEVELS = ['0-1', '1-3', '3-5', '5-10', '10+'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const DEFAULT_CURRENCY = 'MAD';
export const OFFER_DURATION_DAYS = 60;
export const SEARCH_PAGE_SIZE = 12;
