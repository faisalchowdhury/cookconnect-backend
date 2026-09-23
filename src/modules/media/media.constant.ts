export const MEDIA_KINDS = [
  'profile-photo',
  'dish-photo',
  'cv',
  'logo',
  'cover',
  'banner',
  'homepage',
] as const;

export const MODERATION_STATUSES = ['pending', 'approved', 'rejected'] as const;

export const MODERATION_REPORT_TARGET_TYPES = ['media', 'job', 'candidate', 'employer'] as const;

export const MODERATION_REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const;
