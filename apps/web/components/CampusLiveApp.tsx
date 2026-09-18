'use client';

import { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Snapshot, TimeInfo } from '@campuslive/contracts';
import { BoardStoreProvider, useBoardStoreApi, type BoardStoreInit } from '@/lib/store/boardStore';
import { useUiStore } from '@/lib/store/uiStore';
import { TimeStoreProvider } from '@/features/time/useNow';
import { useRealtime } from '@/features/realtime/useRealtime';
import { useTimeTravel } from '@/features/time-travel/useTimeTravel';
import { Header } from '@/components/chrome/Header';
import { Ticker } from '@/components/chrome/Ticker';
import { MapStage } from '@/components/map/MapStage';
import { Board } from '@/components/board/Board';
import { RoomDetailPanel } from '@/components/panels/RoomDetailPanel';
import { SearchPalette } from '@/components/panels/SearchPalette';
import { DemoAdminPanel } from '@/components/panels/DemoAdminPanel';
import { SchedulePanel } from '@/components/panels/SchedulePanel';
import { Toast } from '@/components/chrome/Toast';
import { KioskDriver } from '@/components/chrome/KioskDriver';

interface Props {
  initialSnapshot: Snapshot | null;
  initialTime: TimeInfo | null;
  initialError: string | null;
  initialTravelAt: string | null;
  kiosk?: boolean;
}

/**
 * The board store is created per page render (server and client alike) from the server-fetched
 * snapshot, so the first client render matches the SSR HTML. The clock store is synced the same way.
 */
export function CampusLiveApp(props: Props) {
  const init = useMemo<BoardStoreInit>(() => ({ snapshot: props.initialSnapshot, travelAt: props.initialTravelAt, error: props.initialError }), [props.initialSnapshot, props.initialTravelAt, props.initialError]);
  return (
    <TimeStoreProvider initial={props.initialTime}>
      <BoardStoreProvider init={init}>
        <Shell kiosk={!!props.kiosk} />
      </BoardStoreProvider>
    </TimeStoreProvider>
  );
}

function Shell({ kiosk: kioskProp }: { kiosk: boolean }) {
  useRealtime();
  const store = useBoardStoreApi();
  const kioskStore = useUiStore((s) => s.kiosk);
  const setKiosk = useUiStore((s) => s.setKiosk);
  const kiosk = kioskProp || kioskStore;
  useEffect(() => {
    if (kioskProp) setKiosk(true);
  }, [kioskProp, setKiosk]);
  const mobileTab = useUiStore((s) => s.mobileTab);
  const setMobileTab = useUiStore((s) => s.setMobileTab);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const selectRoom = useUiStore((s) => s.selectRoom);
  const setHighlight = useUiStore((s) => s.setHighlight);
  const setFocusedFloor = useUiStore((s) => s.setFocusedFloor);
  const t = useTranslations('board');
  const { goLive } = useTimeTravel();

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (typing) return;
      if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        const ui = useUiStore.getState();
        if (ui.scheduleOpen) ui.setScheduleOpen(false);
        else if (ui.selectedRoomCode) selectRoom(null);
        else if (ui.highlight) setHighlight(null);
        else if (ui.focusedFloor !== null) setFocusedFloor(null);
        else if (store.getState().mode === 'travel') goLive();
      } else if (e.key === '0') setFocusedFloor(null);
      else if (/^[1-9]$/.test(e.key)) setFocusedFloor(Number(e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSearchOpen, selectRoom, setHighlight, setFocusedFloor, goLive, store]);

  return (
    <div className={kiosk ? 'shell is-kiosk' : 'shell'} data-testid="shell">
      <Header />
      <div className="mobile-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mobileTab === 'map'} className={mobileTab === 'map' ? 'btn is-active' : 'btn'} onClick={() => setMobileTab('map')}>
          {t('tabMap')}
        </button>
        <button type="button" role="tab" aria-selected={mobileTab === 'board'} className={mobileTab === 'board' ? 'btn is-active' : 'btn'} onClick={() => setMobileTab('board')}>
          {t('tabBoard')}
        </button>
      </div>
      <MapStage className={mobileTab !== 'map' ? 'is-mobile-hidden' : ''} />
      <section className={mobileTab !== 'board' ? 'board overlay-anchor is-mobile-hidden' : 'board overlay-anchor'} data-testid="board" aria-label="Board">
        <Board />
        <RoomDetailPanel />
      </section>
      <Ticker />
      <SearchPalette />
      {!kiosk && <DemoAdminPanel />}
      {!kiosk && <SchedulePanel />}
      <Toast />
      {kiosk && <KioskDriver />}
    </div>
  );
}
