export const EMPLOYER_TYPES = ['restaurant', 'hotel', 'bakery', 'cafe', 'catering'] as const;
export type EmployerType = (typeof EMPLOYER_TYPES)[number];

export const EMPLOYER_STATUSES = ['pending', 'active', 'rejected', 'blocked'] as const;
export type EmployerStatus = (typeof EMPLOYER_STATUSES)[number];
