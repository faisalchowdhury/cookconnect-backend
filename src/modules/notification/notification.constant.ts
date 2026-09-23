export const NOTIFICATION_TYPES = [
  'approval',
  'job',
  'application',
  'feedback-reply',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const DEFAULT_NOTIFICATION_LIMIT = 50;
