export const BANNER_PLACEMENTS = ['home-middle', 'home-bottom', 'sticky'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export const DEFAULT_BANNER_LIMIT = 20;
