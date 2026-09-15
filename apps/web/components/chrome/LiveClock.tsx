'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useBoardStore } from '@/lib/store/boardStore';
import { useNow, useTimeStore } from '@/features/time/useNow';
import { formatClock, formatDate } from '@/features/time/derive';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { LOCALE_TAGS, type AppLocale } from '@/i18n/locales';

/** Large mono HH:MM:SS, date, week number + parity. Shows the simulated time in travel mode. */
export function LiveClock() {
  const t = useTranslations('header');
  const locale = useLocale() as AppLocale;
  const now = useNow();
  const tz = useTimeStore((s) => s.timezone);
  const mode = useBoardStore((s) => s.mode);
  const travelAt = useBoardStore((s) => s.travelAt);
  const shown = mode === 'travel' && travelAt ? Date.parse(travelAt) : now;
  const { data: time } = useQuery({ queryKey: ['time'], queryFn: () => api.time(), staleTime: 60_000, refetchInterval: 5 * 60_000 });

  return (
    <div className="clock" data-testid="clock" aria-live="off">
      <span className="clock-time" data-testid="clock-time" suppressHydrationWarning>
        {formatClock(shown, tz)}
      </span>
      <span className="clock-date">
        {formatDate(shown, tz, LOCALE_TAGS[locale])}
        {time && time.weekNumber > 0 ? ` · ${t('week', { n: time.weekNumber, parity: t(time.parity === 'odd' ? 'odd' : 'even') })}` : ''}
      </span>
      {mode === 'travel' && (
        <span className="clock-sim" data-testid="clock-simulated">
          {t('simulated')}
        </span>
      )}
    </div>
  );
}
