'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUiStore } from '@/lib/store/uiStore';
import { useHighlighter, useSearch } from '@/features/search/useSearch';
import { roomIdentity } from '@/lib/vector-map';
import { useRoomName } from '@/lib/room-name';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

/**
 * ⌘K palette over teachers, groups, rooms and courses. Choosing an item highlights the matching
 * rooms on the map and filters the board to the same sessions.
 */
export function SearchPalette() {
  const t = useTranslations('search');
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);
  const highlight = useUiStore((s) => s.highlight);
  const setHighlight = useUiStore((s) => s.setHighlight);
  const selectRoom = useUiStore((s) => s.selectRoom);
  const setFocused = useUiStore((s) => s.setFocusedFloor);
  const setFilters = useUiStore((s) => s.setFilters);
  const [q, setQ] = useState('');
  const { result, loading } = useSearch(q);
  const highlightBy = useHighlighter();
  const roomName = useRoomName();

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const choose = async (kind: 'teacher' | 'group' | 'room' | 'course', id: string, label: string, floor?: number) => {
    setOpen(false);
    await highlightBy(kind, id, label);
    if (kind === 'room') {
      selectRoom(id);
      if (floor) {
        setFocused(floor);
        setFilters({ floors: [floor] });
      }
    }
  };

  const hasAny = result.teachers.length + result.groups.length + result.rooms.length + result.courses.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby="search-desc" data-testid="search-palette">
        <DialogTitle className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {t('placeholder')}
        </DialogTitle>
        <DialogDescription id="search-desc" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {t('hint')}
        </DialogDescription>
        <Command shouldFilter={false} label={t('placeholder')}>
          <CommandInput value={q} onValueChange={setQ} placeholder={t('placeholder')} autoFocus data-testid="search-input" />
          <CommandList>
            {!q.trim() && !highlight && <div style={{ padding: 20, color: 'var(--text-dim)', textAlign: 'center' }}>{t('typeToSearch')}</div>}
            {!q.trim() && highlight && (
              <CommandGroup>
                <CommandItem
                  value="__clear"
                  onSelect={() => {
                    setHighlight(null);
                    setOpen(false);
                  }}
                >
                  ✕ {t('clear')} — {highlight.label}
                </CommandItem>
              </CommandGroup>
            )}
            {q.trim() && !loading && !hasAny && <CommandEmpty>{t('empty')}</CommandEmpty>}
            {result.rooms.length > 0 && (
              <CommandGroup heading={t('rooms')}>
                {result.rooms.map((r) => {
                  const id = roomIdentity(r.code);
                  const name = id ? roomName(r.code) : r.name;
                  return (
                    <CommandItem key={`r-${r.code}`} value={`room:${r.code}`} onSelect={() => choose('room', r.code, `${id?.schedulable ? r.code + ' · ' : ''}${name}`, r.floor)} data-testid="search-item">
                      <b className="mono">{r.code}</b>
                      <span>{name}</span>
                      <span className="ci-kind">
                        {t('kind.room')} · {r.floor}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {result.groups.length > 0 && (
              <CommandGroup heading={t('groups')}>
                {result.groups.map((g) => (
                  <CommandItem key={`g-${g.code}`} value={`group:${g.code}`} onSelect={() => choose('group', g.code, g.code)} data-testid="search-item">
                    <b className="mono">{g.code}</b>
                    <span>{g.program ?? ''}</span>
                    <span className="ci-kind">{t('kind.group')}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {result.teachers.length > 0 && (
              <CommandGroup heading={t('teachers')}>
                {result.teachers.map((x) => (
                  <CommandItem key={`t-${x.id}`} value={`teacher:${x.id}`} onSelect={() => choose('teacher', x.id, x.shortName)} data-testid="search-item">
                    <span>{x.fullName}</span>
                    <span className="ci-kind">{x.department ?? t('kind.teacher')}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {result.courses.length > 0 && (
              <CommandGroup heading={t('courses')}>
                {result.courses.map((c) => (
                  <CommandItem key={`c-${c.code}`} value={`course:${c.code}`} onSelect={() => choose('course', c.code, `${c.code} ${c.title}`)} data-testid="search-item">
                    <b className="mono">{c.code}</b>
                    <span>{c.title}</span>
                    <span className="ci-kind">{t('kind.course')}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="cmd-foot">
            <span>{t('hint')}</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
