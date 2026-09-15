import type { Snapshot, TimeInfo } from '@campuslive/contracts';
import { api, BUILDING } from '@/lib/api/client';
import { CampusLiveApp } from '@/components/CampusLiveApp';

export const dynamic = 'force-dynamic';

/**
 * /kiosk?building=A&floorCycle=20s&page=8s — no cursor, no panels; the board pages itself,
 * the map cycles through busy floors, the ticker runs. Data stays live over SSE.
 */
export default async function KioskPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const building = typeof sp.building === 'string' ? sp.building : BUILDING;
  let snapshot: Snapshot | null = null;
  let time: TimeInfo | null = null;
  let error: string | null = null;
  try {
    [snapshot, time] = await Promise.all([api.board({ building }, { cache: 'no-store', timeoutMs: 4000 }), api.time({ cache: 'no-store', timeoutMs: 4000 })]);
  } catch (err) {
    error = err instanceof Error ? err.message : 'api_unavailable';
  }
  return <CampusLiveApp initialSnapshot={snapshot} initialTime={time} initialError={error} initialTravelAt={null} kiosk />;
}
