/**
 * The frontend never decides phases. It only derives cosmetics from timestamps:
 * progress percentages and countdown strings.
 */

export function deriveProgress(startAt: string | number, endAt: string | number, now: number): number {
  const s = typeof startAt === 'number' ? startAt : Date.parse(startAt);
  const e = typeof endAt === 'number' ? endAt : Date.parse(endAt);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.min(1, Math.max(0, (now - s) / (e - s)));
}

/** Whole minutes until `at` (negative when in the past). Rounds up so "0:42" shows as 1 min. */
export function minutesUntil(at: string | number, now: number): number {
  const t = typeof at === 'number' ? at : Date.parse(at);
  return Math.ceil((t - now) / 60_000);
}

/** Seconds until `at`, clamped at 0. */
export function secondsUntil(at: string | number, now: number): number {
  const t = typeof at === 'number' ? at : Date.parse(at);
  return Math.max(0, Math.round((t - now) / 1000));
}

/** mm:ss for the last minutes, otherwise "Nm". */
export function formatCountdown(at: string | number, now: number, opts: { minuteSuffix?: string; hourSuffix?: string } = {}): string {
  const secs = secondsUntil(at, now);
  const ms = opts.minuteSuffix ?? 'm';
  const hs = opts.hourSuffix ?? 'h';
  if (secs < 600) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const mins = Math.ceil(secs / 60);
  if (mins < 60) return `${mins}${ms}`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}${hs} ${m}${ms}` : `${h}${hs}`;
}

export function formatTime(at: string | number, timeZone: string, locale = 'ru-RU'): string {
  const d = typeof at === 'number' ? new Date(at) : new Date(at);
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(d);
}

export function formatClock(now: number, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone }).format(new Date(now));
}

export function formatDate(now: number, timeZone: string, locale = 'ru-RU'): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(new Date(now));
}

/** Local YYYY-MM-DD of an instant in a time zone. */
export function localDate(now: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Instant of local HH:MM on the local date of `now` in a time zone (used by the time-travel bar). */
export function atLocalTime(now: number, timeZone: string, minutesOfDay: number): number {
  const date = localDate(now, timeZone);
  // find the UTC offset at that date by probing midnight
  const probe = new Date(`${date}T00:00:00Z`).getTime();
  const offset = tzOffsetMinutes(probe, timeZone);
  return probe - offset * 60_000 + minutesOfDay * 60_000;
}

/** UTC offset in minutes for an instant in a time zone (+300 for Asia/Almaty). */
export function tzOffsetMinutes(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - at) / 60_000);
}

/** Minutes since local midnight for an instant in a time zone. */
export function minutesOfDay(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return (get('hour') % 24) * 60 + get('minute');
}
