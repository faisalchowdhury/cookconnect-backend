export const FEEDBACK_STATUSES = ['new', 'answered'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_ROLES = ['candidate', 'employer'] as const;
export type FeedbackRole = (typeof FEEDBACK_ROLES)[number];

export const DEFAULT_FEEDBACK_LIMIT = 20;
