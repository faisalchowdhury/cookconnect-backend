export const APPLICATION_STATUSES = ['pending', 'shortlisted', 'rejected', 'hired'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
