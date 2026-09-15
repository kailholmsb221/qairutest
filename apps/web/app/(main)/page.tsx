import type { Snapshot, TimeInfo } from '@campuslive/contracts';
import { api, BUILDING } from '@/lib/api/client';
import { CampusLiveApp } from '@/components/CampusLiveApp';

export const dynamic = 'force-dynamic';

/**
 * Server Component: the first paint already carries live data. The board and the server time are
 * fetched here; the map geometry is a static import (vector-map.json), so nothing waits on the API
 * to draw the building. If the API is down we still render the shell with an error state.
 */
export default async function MainPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const at = typeof sp.at === 'string' ? sp.at : undefined;
  const kiosk = sp.kiosk === '1';

  let snapshot: Snapshot | null = null;
  let time: TimeInfo | null = null;
  let error: string | null = null;
  try {
    [snapshot, time] = await Promise.all([
      api.board({ building: BUILDING, at }, { cache: 'no-store', timeoutMs: 4000 }),
      api.time({ cache: 'no-store', timeoutMs: 4000 }),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : 'api_unavailable';
  }

  return <CampusLiveApp initialSnapshot={snapshot} initialTime={time} initialError={error} initialTravelAt={at ?? null} kiosk={kiosk} />;
}
