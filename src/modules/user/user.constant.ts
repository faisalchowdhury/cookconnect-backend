export const USER_ROLES = ['candidate', 'employer', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['pending', 'active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ADMIN_LEVELS = ['super', 'sub'] as const;
export type AdminLevel = (typeof ADMIN_LEVELS)[number];

export const AUTH_PROVIDERS = ['local', 'google', 'facebook'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const LOCALES = ['fr', 'ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const ALL_ADMIN_PERMISSIONS = [
  'manage-candidates',
  'manage-employers',
  'approve-offers',
  'approve-photos',
  'manage-admins',
  'manage-banners',
  'delete-users',
  'export-cv',
  'view-contact',
  'manage-homepage',
  'view-statistics',
  'manage-feedback',
  'view-activity',
] as const;

export type AdminPermission = (typeof ALL_ADMIN_PERMISSIONS)[number];

export const MAX_LOGIN_ATTEMPTS = 3;
export const LOCK_DURATION_MS = 30 * 60 * 1000;
