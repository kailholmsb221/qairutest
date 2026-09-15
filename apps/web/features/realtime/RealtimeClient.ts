import type { Announcement, Heartbeat, Snapshot } from '@campuslive/contracts';

/**
 * Transport-agnostic realtime interface. v1 = Server-Sent Events (auto-reconnect for free,
 * works through any proxy). A WebSocket implementation would plug in here unchanged.
 */
export interface RealtimeHandlers {
  onSnapshot: (s: Snapshot) => void;
  onAnnouncement: (a: Announcement) => void;
  onHeartbeat: (h: Heartbeat) => void;
  /** connection opened (first time or after a drop) */
  onOpen: (reconnect: boolean) => void;
  onError: () => void;
}

export interface RealtimeClient {
  connect(): void;
  close(): void;
  readonly connected: boolean;
}

export class SseClient implements RealtimeClient {
  private es: EventSource | null = null;
  private everOpened = false;
  private dropped = false;
  connected = false;

  constructor(
    private url: string,
    private h: RealtimeHandlers,
  ) {}

  connect(): void {
    if (this.es) return;
    const es = new EventSource(this.url);
    this.es = es;
    es.onopen = () => {
      this.connected = true;
      const reconnect = this.everOpened && this.dropped;
      this.everOpened = true;
      this.dropped = false;
      this.h.onOpen(reconnect);
    };
    es.onerror = () => {
      this.connected = false;
      this.dropped = true;
      this.h.onError();
      // EventSource reconnects on its own (retry: hint from the server)
    };
    es.addEventListener('snapshot', (ev) => this.safe(() => this.h.onSnapshot(JSON.parse((ev as MessageEvent).data))));
    es.addEventListener('announcement', (ev) => this.safe(() => this.h.onAnnouncement(JSON.parse((ev as MessageEvent).data))));
    es.addEventListener('heartbeat', (ev) => this.safe(() => this.h.onHeartbeat(JSON.parse((ev as MessageEvent).data))));
  }

  close(): void {
    this.es?.close();
    this.es = null;
    this.connected = false;
  }

  private safe(fn: () => void) {
    try {
      fn();
    } catch (err) {
      console.error('realtime: bad event payload', err);
    }
  }
}
