'use client';

import { useTranslations } from 'next-intl';
import { useBoardStore, selectStats } from '@/lib/store/boardStore';

export function StatsChip() {
  const t = useTranslations('map');
  const stats = useBoardStore(selectStats);
  return (
    <div className="chip stats-chip" data-testid="stats-chip">
      <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--status-live-text)', boxShadow: '0 0 8px var(--status-live-text)' }} aria-hidden />
      {t('busy', { busy: stats.roomsBusy, total: stats.roomsTotal })}
    </div>
  );
}
