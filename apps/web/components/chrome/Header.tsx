'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useUiStore } from '@/lib/store/uiStore';
import { LiveClock } from './LiveClock';
import { FloorTabs } from './FloorTabs';
import { LocaleSwitch } from './LocaleSwitch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Header() {
  const t = useTranslations('app');
  const kiosk = useUiStore((s) => s.kiosk);
  const setKiosk = useUiStore((s) => s.setKiosk);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const router = useRouter();

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `cl_theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }, [theme, setTheme]);

  const toggleKiosk = useCallback(() => {
    if (kiosk) {
      setKiosk(false);
      router.push('/');
    } else {
      router.push('/kiosk');
    }
  }, [kiosk, setKiosk, router]);

  return (
    <header className="header panel" data-testid="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          CL
        </span>
        <span>{t('title')}</span>
        <span className="brand-sub">· {t('building')}</span>
      </div>
      <LiveClock />
      <div className="header-right">
        <FloorTabs />
        {!kiosk && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="btn" onClick={() => setSearchOpen(true)} data-testid="search-trigger" aria-label={t('search')}>
                <span aria-hidden>⌕</span>
                <span className="kbd">⌘K</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('search')}</TooltipContent>
          </Tooltip>
        )}
        <LocaleSwitch />
        {!kiosk && (
          <button type="button" className="btn icon" onClick={toggleTheme} aria-label={t('theme')} title={t('theme')} data-testid="theme-toggle">
            <span aria-hidden>{theme === 'dark' ? '◐' : '◑'}</span>
          </button>
        )}
        <button type="button" className={kiosk ? 'btn icon is-active' : 'btn icon'} onClick={toggleKiosk} aria-label={kiosk ? t('exitKiosk') : t('kiosk')} title={kiosk ? t('exitKiosk') : t('kiosk')} data-testid="kiosk-toggle">
          <span aria-hidden>⛶</span>
        </button>
      </div>
    </header>
  );
}
