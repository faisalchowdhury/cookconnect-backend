export const BOOKMARK_KINDS = ['saved-profile', 'saved-job'] as const;
export type BookmarkKind = (typeof BOOKMARK_KINDS)[number];
