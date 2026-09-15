import type { Phase, SessionStatus, SessionView } from '@campuslive/contracts';
import type { Highlight } from '@/lib/store/uiStore';

export type PillKind = 'live' | 'ending' | 'soon' | 'upcoming' | 'cancelled' | 'moved' | 'delayed' | 'done';

/** Which pill a row shows. Status overrides phase for cancelled/moved/delayed in NEXT. */
export function pillKind(phase: Phase, status: SessionStatus): PillKind {
  if (phase === 'cancelled' || status === 'cancelled') return 'cancelled';
  if (phase === 'live') return 'live';
  if (phase === 'ending') return 'ending';
  if (phase === 'done') return 'done';
  if (status === 'moved') return 'moved';
  if (status === 'delayed') return 'delayed';
  if (phase === 'soon') return 'soon';
  return 'upcoming';
}

export interface Filters {
  floors: number[];
  lessonTypes: string[];
}

/** Board rows after the floor tab, lesson-type filters and a search highlight. */
export function filterSessions(sessions: SessionView[], filters: Filters, highlight: Highlight | null): SessionView[] {
  const hl = highlight ? new Set(highlight.sessionIds) : null;
  return sessions.filter((s) => {
    if (filters.floors.length && !filters.floors.includes(s.floor)) return false;
    if (filters.lessonTypes.length && !filters.lessonTypes.includes(s.lessonType)) return false;
    if (hl && !hl.has(s.sessionId)) return false;
    return true;
  });
}

/** Ticker lines generated from the snapshot ("213 · Databases starts in 4 min · Akhmetov D."). */
export function tickerLines(next: SessionView[], now: number, limit = 6): { id: string; room: string; text: string; minutes: number; kind: 'soon' | 'cancelled' | 'moved' | 'delayed' }[] {
  const out: { id: string; room: string; text: string; minutes: number; kind: 'soon' | 'cancelled' | 'moved' | 'delayed' }[] = [];
  for (const s of next) {
    const minutes = Math.max(0, Math.ceil((Date.parse(s.startAt) - now) / 60_000));
    if (s.status === 'cancelled') out.push({ id: s.sessionId, room: s.roomCode, text: s.courseTitle, minutes, kind: 'cancelled' });
    else if (s.status === 'moved') out.push({ id: s.sessionId, room: s.roomCode, text: s.courseTitle, minutes, kind: 'moved' });
    else if (s.status === 'delayed') out.push({ id: s.sessionId, room: s.roomCode, text: s.courseTitle, minutes, kind: 'delayed' });
    else if (s.phase === 'soon') out.push({ id: s.sessionId, room: s.roomCode, text: `${s.courseTitle} · ${s.teacher.shortName}`, minutes, kind: 'soon' });
    if (out.length >= limit) break;
  }
  return out;
}
