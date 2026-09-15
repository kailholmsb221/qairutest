import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export const LOCALES = ['ru', 'kk', 'en'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'ru';
export const LOCALE_COOKIE = 'cl_locale';

function isLocale(v: string | undefined): v is AppLocale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

/** Locale = cookie → Accept-Language → ru. No URL prefixes: the screen has one URL. */
export default getRequestConfig(async () => {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  let locale: AppLocale = DEFAULT_LOCALE;
  if (isLocale(fromCookie)) locale = fromCookie;
  else {
    const accept = (await headers()).get('accept-language') ?? '';
    const first = accept.split(',')[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(first)) locale = first;
  }
  return { locale, messages: (await import(`../messages/${locale}.json`)).default, timeZone: 'Asia/Almaty' };
});
