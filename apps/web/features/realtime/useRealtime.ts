'use client';

import { useEffect, useRef } from 'react';
import { api, BUILDING } from '@/lib/api/client';
import { useBoardStoreApi } from '@/lib/store/boardStore';
import { useTimeStoreApi } from '@/features/time/useNow';
import { SseClient } from './RealtimeClient';

const HEARTBEAT_TIMEOUT_MS = 30_000;

/**
 * Opens the SSE stream, feeds snapshots into the board store, and watches heartbeats:
 * 30 s without one → `reconnecting`. After a reconnect the board is refetched once over REST
 * in case a transition was missed (snapshots are full, so nothing else is needed).
 */
export function useRealtime(building = BUILDING): void {
  const started = useRef(false);
  const api_ = useBoardStoreApi();
  const timeApi = useTimeStoreApi();
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const store = api_.getState;
    const time = timeApi.getState;

    const client = new SseClient(api.eventsUrl(building), {
      onSnapshot: (s) => {
        store().setSnapshot(s, 'sse');
        store().heartbeat(Date.now());
        time().sync(s.at, time().mode, time().timezone);
      },
      onAnnouncement: (a) => store().addAnnouncement(a),
      onHeartbeat: (h) => {
        store().heartbeat(Date.now());
        time().sync(h.at, time().mode, time().timezone);
      },
      onOpen: (reconnect) => {
        store().setConnection('online');
        if (reconnect) {
          api.board({ building }).then((s) => store().setSnapshot(s, 'rest')).catch(() => {});
        }
      },
      onError: () => store().setConnection('reconnecting'),
    });
    client.connect();

    // clock sync + mode
    api.time().then((t) => time().sync(t.now, t.mode, t.timezone)).catch(() => {});

    const watchdog = setInterval(() => {
      const st = store();
      const last = st.lastHeartbeatAt ?? st.lastSnapshotAt;
      if (last && Date.now() - last > HEARTBEAT_TIMEOUT_MS && st.connection === 'online') st.setConnection('reconnecting');
      if (last && Date.now() - last > HEARTBEAT_TIMEOUT_MS * 4 && st.connection !== 'offline') st.setConnection('offline');
    }, 5_000);

    return () => {
      clearInterval(watchdog);
      client.close();
      started.current = false;
    };
  }, [building, api_, timeApi]);
}
