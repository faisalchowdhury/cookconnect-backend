export const SITE_SETTINGS_MODES = ['blank', 'image'] as const;
export type SiteSettingsMode = (typeof SITE_SETTINGS_MODES)[number];

export const SITE_SETTINGS_DOC_ID = 'default';

export const DEFAULT_SITE_SETTINGS = {
  mode: 'blank' as SiteSettingsMode,
  imageId: null,
  headline: {
    fr: 'Trouvez votre place dans la restauration au Maroc',
    ar: 'لقا بلاصتك فقطاع المطاعم والفندقة فالمغرب',
    en: "Find your place in Morocco's hospitality industry",
  },
  subheadline: {
    fr: "Cuisiniers, boulangers, personnel d'hôtel et employeurs — au même endroit.",
    ar: 'طباخين، خبازة، مستخدمين ديال الأوطيلات وموظّفين — كاملين فبلاصة وحدة.',
    en: 'Cooks, bakers, hotel staff and employers — all in one place.',
  },
  cta: {
    fr: 'Voir les offres',
    ar: 'شوف العروض',
    en: 'Browse offers',
  },
};
