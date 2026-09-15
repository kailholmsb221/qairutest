'use client';

import { useTranslations } from 'next-intl';

export function Pager({ page, pages, onPick }: { page: number; pages: number; onPick: (p: number) => void }) {
  const t = useTranslations('board');
  if (pages <= 1) return <div className="pager" aria-hidden />;
  return (
    <div className="pager" role="tablist" aria-label={t('page', { p: page + 1, n: pages })} data-testid="pager">
      {Array.from({ length: pages }, (_, i) => (
        <i key={i} className={i === page ? 'is-active' : ''} role="tab" aria-selected={i === page} aria-label={t('page', { p: i + 1, n: pages })} onClick={() => onPick(i)} />
      ))}
    </div>
  );
}
