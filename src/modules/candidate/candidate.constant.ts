export const EXPERIENCE_LEVELS = ['0-1', '1-3', '3-5', '5-10', '10+'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const AVAILABILITY_OPTIONS = ['immediate', '1-month', '3-months'] as const;
export type Availability = (typeof AVAILABILITY_OPTIONS)[number];

export const CONTRACT_TYPES = ['cdi', 'cdd', 'interim', 'stage', 'unspecified'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const MAX_FOOD_PHOTOS = 8;
export const SEARCH_PAGE_SIZE = 12;

export const REQUIRED_COMPLETION_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'city',
  'sectorId',
  'positionId',
  'experience',
  'availability',
  'photoId',
] as const;
