import type {
  AdminCatalog,
  Announcement,
  AnnouncementRequest,
  ApiError,
  Building,
  BuildingMap,
  DaySchedule,
  DayTimeline,
  Lesson,
  LessonRequest,
  Override,
  OverrideRequest,
  SearchResult,
  Snapshot,
  TimeInfo,
} from '@campuslive/contracts';

/**
 * Thin typed client over the OpenAPI contract. Types come from packages/contracts (generated);
 * nothing here is hand-written DTO — only URLs and the fetch plumbing.
 */

export const BUILDING = process.env.NEXT_PUBLIC_BUILDING ?? 'A';

/** Base URL for the browser (EventSource, TanStack Query). */
export function publicApiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8090').replace(/\/$/, '');
}

/** Base URL for server components (may point at the docker network). */
export function serverApiUrl(): string {
  return (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8090').replace(/\/$/, '');
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

interface Opts extends Omit<RequestInit, 'body'> {
  base?: string;
  body?: unknown;
  timeoutMs?: number;
}

async function request<T>(path: string, opts: Opts = {}): Promise<T> {
  const base = opts.base ?? (typeof window === 'undefined' ? serverApiUrl() : publicApiUrl());
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(base + path, {
      ...opts,
      signal: opts.signal ?? ctrl.signal,
      headers: { Accept: 'application/json', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers ?? {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = json as ApiError | null;
      throw new HttpError(res.status, err?.error?.code ?? 'http_error', err?.error?.message ?? `HTTP ${res.status}`);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  time: (opts?: Opts) => request<TimeInfo>('/api/v1/time', opts),
  buildings: (opts?: Opts) => request<Building[]>('/api/v1/buildings', opts),
  map: (building = BUILDING, opts?: Opts) => request<BuildingMap>(`/api/v1/buildings/${encodeURIComponent(building)}/map`, opts),
  board: (params: { building?: string; at?: string; date?: string } = {}, opts?: Opts) => {
    const q = new URLSearchParams();
    if (params.at) q.set('at', params.at);
    if (params.date) q.set('date', params.date);
    const qs = q.toString();
    return request<Snapshot>(`/api/v1/buildings/${encodeURIComponent(params.building ?? BUILDING)}/board${qs ? `?${qs}` : ''}`, opts);
  },
  timeline: (params: { building?: string; date?: string } = {}, opts?: Opts) => {
    const qs = params.date ? `?date=${params.date}` : '';
    return request<DayTimeline>(`/api/v1/buildings/${encodeURIComponent(params.building ?? BUILDING)}/timeline${qs}`, opts);
  },
  roomDay: (code: string, date?: string, opts?: Opts) => request<DaySchedule>(`/api/v1/rooms/${encodeURIComponent(code)}/day${date ? `?date=${date}` : ''}`, opts),
  teacherDay: (id: string, date?: string, opts?: Opts) => request<DaySchedule>(`/api/v1/teachers/${encodeURIComponent(id)}/day${date ? `?date=${date}` : ''}`, opts),
  groupDay: (code: string, date?: string, opts?: Opts) => request<DaySchedule>(`/api/v1/groups/${encodeURIComponent(code)}/day${date ? `?date=${date}` : ''}`, opts),
  search: (q: string, opts?: Opts) => request<SearchResult>(`/api/v1/search?q=${encodeURIComponent(q)}`, opts),
  admin: {
    createOverride: (body: OverrideRequest, apiKey: string, opts?: Opts) =>
      request<Override>('/api/v1/admin/overrides', { ...opts, method: 'POST', body, headers: { 'X-Api-Key': apiKey } }),
    deleteOverride: (id: string, apiKey: string, opts?: Opts) =>
      request<void>(`/api/v1/admin/overrides/${encodeURIComponent(id)}`, { ...opts, method: 'DELETE', headers: { 'X-Api-Key': apiKey } }),
    createAnnouncement: (body: AnnouncementRequest, apiKey: string, opts?: Opts) =>
      request<Announcement>('/api/v1/admin/announcements', { ...opts, method: 'POST', body, headers: { 'X-Api-Key': apiKey } }),
    /** reference data for the schedule editor */
    catalog: (apiKey: string, building = BUILDING, opts?: Opts) =>
      request<AdminCatalog>(`/api/v1/admin/catalog?building=${encodeURIComponent(building)}`, { ...opts, headers: { 'X-Api-Key': apiKey } }),
    /** weekly lesson templates of the current semester (optionally of one room) */
    lessons: (params: { building?: string; roomCode?: string; semesterId?: string }, apiKey: string, opts?: Opts) => {
      const q = new URLSearchParams({ building: params.building ?? BUILDING });
      if (params.roomCode) q.set('roomCode', params.roomCode);
      if (params.semesterId) q.set('semesterId', params.semesterId);
      return request<Lesson[]>(`/api/v1/admin/lessons?${q.toString()}`, { ...opts, headers: { 'X-Api-Key': apiKey } });
    },
    createLesson: (body: LessonRequest, apiKey: string, opts?: Opts) =>
      request<Lesson>('/api/v1/admin/lessons', { ...opts, method: 'POST', body, headers: { 'X-Api-Key': apiKey } }),
    deleteLesson: (id: string, apiKey: string, opts?: Opts) =>
      request<void>(`/api/v1/admin/lessons/${encodeURIComponent(id)}`, { ...opts, method: 'DELETE', headers: { 'X-Api-Key': apiKey } }),
  },
  eventsUrl: (building = BUILDING) => `${publicApiUrl()}/api/v1/events?building=${encodeURIComponent(building)}`,
};
