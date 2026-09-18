'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import type { Locale } from '@campuslive/map-data/types';
import { roomIdentity } from '@/lib/vector-map';

/** The room's name in the given UI language (room-codes.json → building-a.json `names`), falling back to the Russian default. */
export function roomName(code: string, locale: string): string {
  const id = roomIdentity(code);
  if (!id) return code;
  return id.names?.[locale as Locale] ?? id.name;
}

/** `name(code)` for the current locale — used everywhere a room name is shown (panel, tooltip, search, schedule, aria). */
export function useRoomName(): (code: string) => string {
  const locale = useLocale();
  return useCallback((code: string) => roomName(code, locale), [locale]);
}
