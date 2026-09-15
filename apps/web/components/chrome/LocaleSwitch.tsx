'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LOCALES, LOCALE_COOKIE, type AppLocale } from '@/i18n/locales';
import { useUiStore } from '@/lib/store/uiStore';

const LABELS: Record<AppLocale, string> = { ru: 'RU', kk: 'KZ', en: 'EN' };

export function LocaleSwitch() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('app');
  const router = useRouter();
  const [pending, start] = useTransition();
  const setLocale = useUiStore((s) => s.setLocale);
  const change = (l: AppLocale) => {
    if (l === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    setLocale(l);
    start(() => router.refresh());
  };
  return (
    <div className="seg" role="group" aria-label={t('locale')} data-testid="locale-switch" aria-busy={pending}>
      {LOCALES.map((l) => (
        <button key={l} type="button" aria-pressed={l === locale} onClick={() => change(l)} data-testid={`locale-${l}`}>
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
