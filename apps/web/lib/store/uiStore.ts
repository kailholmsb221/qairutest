import { create } from 'zustand';
import type { LessonType } from '@campuslive/contracts';

export type Locale = 'ru' | 'kk' | 'en';
export type HighlightKind = 'group' | 'teacher' | 'room' | 'course';

export interface Highlight {
  kind: HighlightKind;
  id: string;
  label: string;
  /** room codes that match today */
  roomCodes: string[];
  /** session ids that match today (board filter) */
  sessionIds: string[];
}

export interface UiStore {
  focusedFloor: number | null;
  selectedRoomCode: string | null;
  hoveredRoomCode: string | null;
  highlight: Highlight | null;
  filters: { floors: number[]; lessonTypes: LessonType[] };
  locale: Locale;
  reducedMotion: boolean;
  theme: 'dark' | 'light';
  kiosk: boolean;
  /** board page rotation interval (ms); /kiosk?page=8s overrides it */
  pageIntervalMs: number;
  searchOpen: boolean;
  adminOpen: boolean;
  /** the weekly timetable editor (admin) */
  scheduleOpen: boolean;
  mobileTab: 'map' | 'board';
  toast: string | null;

  setFocusedFloor: (n: number | null) => void;
  toggleFocusedFloor: (n: number) => void;
  selectRoom: (code: string | null) => void;
  hoverRoom: (code: string | null) => void;
  setHighlight: (h: Highlight | null) => void;
  setFilters: (f: Partial<UiStore['filters']>) => void;
  setLocale: (l: Locale) => void;
  setReducedMotion: (v: boolean) => void;
  setTheme: (t: 'dark' | 'light') => void;
  setKiosk: (v: boolean) => void;
  setPageIntervalMs: (ms: number) => void;
  setSearchOpen: (v: boolean) => void;
  setAdminOpen: (v: boolean) => void;
  setScheduleOpen: (v: boolean) => void;
  setMobileTab: (t: 'map' | 'board') => void;
  setToast: (m: string | null) => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  focusedFloor: null,
  selectedRoomCode: null,
  hoveredRoomCode: null,
  highlight: null,
  filters: { floors: [], lessonTypes: [] },
  locale: 'ru',
  reducedMotion: false,
  theme: 'dark',
  kiosk: false,
  pageIntervalMs: 8000,
  searchOpen: false,
  adminOpen: false,
  scheduleOpen: false,
  mobileTab: 'map',
  toast: null,

  setFocusedFloor: (focusedFloor) => set({ focusedFloor }),
  toggleFocusedFloor: (n) => set({ focusedFloor: get().focusedFloor === n ? null : n }),
  selectRoom: (selectedRoomCode) => set({ selectedRoomCode }),
  hoverRoom: (hoveredRoomCode) => set({ hoveredRoomCode }),
  setHighlight: (highlight) => set({ highlight }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  setLocale: (locale) => set({ locale }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setTheme: (theme) => set({ theme }),
  setKiosk: (kiosk) => set({ kiosk }),
  setPageIntervalMs: (pageIntervalMs) => set({ pageIntervalMs }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setAdminOpen: (adminOpen) => set({ adminOpen }),
  setScheduleOpen: (scheduleOpen) => set({ scheduleOpen }),
  setMobileTab: (mobileTab) => set({ mobileTab }),
  setToast: (toast) => set({ toast }),
}));
