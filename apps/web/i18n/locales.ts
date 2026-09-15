export const LOCALES = ['ru', 'kk', 'en'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'cl_locale';
export const LOCALE_TAGS: Record<AppLocale, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' };
