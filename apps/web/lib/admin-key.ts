'use client';

import { useEffect, useState } from 'react';

/** Inlined at build time when NEXT_PUBLIC_ADMIN_API_KEY was set; otherwise fetched once at runtime. */
const BUILD_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? '';
let cached: string | null = BUILD_KEY || null;
let pending: Promise<string> | null = null;

function load(): Promise<string> {
  pending ??= fetch('/api/admin-key')
    .then((r) => (r.ok ? (r.json() as Promise<{ key?: string }>) : { key: '' }))
    .then((j) => (cached = j.key ?? ''))
    .catch(() => (cached = ''));
  return pending;
}

/** The demo admin API key ('' while unknown or unset). */
export function useAdminKey(): string {
  const [key, setKey] = useState(cached ?? '');
  useEffect(() => {
    if (cached !== null) return;
    let alive = true;
    void load().then((k) => {
      if (alive) setKey(k);
    });
    return () => {
      alive = false;
    };
  }, []);
  return key;
}
