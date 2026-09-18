'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCatalog, Lesson, LessonRequest, LessonType, WeekParity } from '@campuslive/contracts';
import { api, HttpError } from '@/lib/api/client';
import { useUiStore } from '@/lib/store/uiStore';
import { useAdminKey } from '@/lib/admin-key';
import { useRoomName } from '@/lib/room-name';

/** Monday..Saturday — the seed and the university week; Sunday stays possible through the API. */
const DAYS = [1, 2, 3, 4, 5, 6] as const;
const TYPES: LessonType[] = ['lecture', 'practice', 'lab'];
const PARITIES: WeekParity[] = ['all', 'odd', 'even'];
type DayKey = `schedule.days.${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
const dayKey = (d: number): DayKey => `schedule.days.${d as 1}`;

interface Cell {
  weekday: number;
  slotIdx: number;
}

/**
 * The weekly timetable editor: one room at a time, slots × weekdays. A click on a free cell opens
 * the form below the grid; ✕ removes a lesson. Every change goes through the admin API and reaches
 * all open screens over SSE (the board recomputes from the lesson templates).
 */
export function SchedulePanel() {
  const t = useTranslations('admin');
  const open = useUiStore((s) => s.scheduleOpen);
  const setOpen = useUiStore((s) => s.setScheduleOpen);
  const setToast = useUiStore((s) => s.setToast);
  const apiKey = useAdminKey();
  const roomName = useRoomName();
  const qc = useQueryClient();
  const [room, setRoom] = useState('');
  const [cell, setCell] = useState<Cell | null>(null);

  const catalog = useQuery({ queryKey: ['admin-catalog'], queryFn: () => api.admin.catalog(apiKey), enabled: open && !!apiKey, staleTime: 5 * 60_000 });
  const roomCode = room || catalog.data?.rooms[0]?.code || '';
  const lessons = useQuery({ queryKey: ['admin-lessons', roomCode], queryFn: () => api.admin.lessons({ roomCode }, apiKey), enabled: open && !!apiKey && !!roomCode });

  const byCell = useMemo(() => {
    const m = new Map<string, Lesson[]>();
    for (const l of lessons.data ?? []) {
      const k = `${l.weekday}:${l.slotIdx}`;
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return m;
  }, [lessons.data]);

  const fail = (e: unknown) => setToast(t('error', { msg: e instanceof HttpError ? e.message : String(e) }));
  const create = useMutation({
    mutationFn: (body: LessonRequest) => api.admin.createLesson(body, apiKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-lessons'] });
      setToast(t('schedule.added'));
      setCell(null);
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.admin.deleteLesson(id, apiKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-lessons'] });
      setToast(t('schedule.deleted'));
    },
    onError: fail,
  });

  useEffect(() => {
    if (!open) setCell(null);
  }, [open]);

  const cat = catalog.data;
  const semester = cat?.semesters.find((s) => s.id === cat.currentSemesterId);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="schedule-panel glass" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }} role="dialog" aria-label={t('schedule.title')} data-testid="schedule-panel">
          <div className="sched-head">
            <div>
              <b>{t('schedule.title')}</b>
              {semester && <span className="sched-semester">{semester.name}</span>}
            </div>
            <label className="sched-room">
              {t('schedule.room')}
              <select value={roomCode} onChange={(e) => { setRoom(e.target.value); setCell(null); }} data-testid="sched-room">
                {(cat?.rooms ?? []).map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} · {roomName(r.code)} · {t('schedule.floor', { n: r.floor })}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn icon" onClick={() => setOpen(false)} aria-label={t('close')} style={{ height: 28, width: 28 }} data-testid="sched-close">
              ✕
            </button>
          </div>
          {!apiKey && <div style={{ color: 'var(--status-delayed)', fontSize: 12 }}>{t('noKey')}</div>}
          {catalog.isError && <div style={{ color: 'var(--status-cancelled)', fontSize: 12 }}>{t('error', { msg: catalog.error instanceof HttpError ? catalog.error.message : String(catalog.error) })}</div>}
          <div className="sched-scroll">
            {cat ? (
              <table className="sched-grid" data-testid="sched-grid">
                <thead>
                  <tr>
                    <th>{t('schedule.slot')}</th>
                    {DAYS.map((d) => (
                      <th key={d}>{t(dayKey(d))}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cat.slots.map((s) => (
                    <tr key={s.idx}>
                      <th>
                        <span className="mono">{s.startsAt}</span>
                        <span className="sched-end">{s.endsAt}</span>
                      </th>
                      {DAYS.map((d) => {
                        const ls = byCell.get(`${d}:${s.idx}`) ?? [];
                        const active = cell?.weekday === d && cell?.slotIdx === s.idx;
                        return (
                          <td key={d} className={active ? 'is-active' : undefined} data-testid={`sched-cell-${d}-${s.idx}`}>
                            {ls.map((l) => (
                              <div className="sched-lesson" key={l.id} data-parity={l.parity} data-testid="sched-lesson">
                                <b>{l.courseCode}</b>
                                <span className="sched-groups">{l.groups.join(', ')}</span>
                                <span className="dim">{l.teacher.shortName}</span>
                                {l.parity !== 'all' && <em>{t(`schedule.parity_${l.parity}`)}</em>}
                                <button type="button" onClick={() => remove.mutate(l.id)} disabled={remove.isPending} aria-label={t('schedule.delete')} title={t('schedule.delete')} data-testid={`sched-delete-${l.id}`}>
                                  ✕
                                </button>
                              </div>
                            ))}
                            {ls.length < 2 && (
                              <button type="button" className="sched-add" onClick={() => setCell({ weekday: d, slotIdx: s.idx })} aria-label={t('schedule.add')} data-testid={`sched-add-${d}-${s.idx}`}>
                                +
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: 'var(--text-dim)', padding: 12 }}>{catalog.isLoading ? t('schedule.loading') : t('schedule.hint')}</div>
            )}
          </div>
          {cat && cell && roomCode && (
            <LessonForm
              key={`${roomCode}:${cell.weekday}:${cell.slotIdx}`}
              catalog={cat}
              cell={cell}
              roomCode={roomCode}
              busy={create.isPending}
              onCancel={() => setCell(null)}
              onSubmit={(body) => create.mutate(body)}
            />
          )}
          {cat && !cell && <div className="sched-hint">{t('schedule.hint')}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LessonForm({ catalog, cell, roomCode, busy, onCancel, onSubmit }: { catalog: AdminCatalog; cell: Cell; roomCode: string; busy: boolean; onCancel: () => void; onSubmit: (body: LessonRequest) => void }) {
  const t = useTranslations('admin');
  const tl = useTranslations('room.lesson');
  const slot = catalog.slots.find((s) => s.idx === cell.slotIdx);
  const [courseCode, setCourse] = useState(catalog.courses[0]?.code ?? '');
  const [teacherId, setTeacher] = useState(catalog.teachers[0]?.id ?? '');
  const [groups, setGroups] = useState<string[]>(catalog.groups[0] ? [catalog.groups[0].code] : []);
  const [type, setType] = useState<LessonType>('practice');
  const [parity, setParity] = useState<WeekParity>('all');

  return (
    <form
      className="sched-form"
      data-testid="sched-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ courseCode, teacherId, roomCode, slotIdx: cell.slotIdx, weekday: cell.weekday, parity, type, groups, semesterId: catalog.currentSemesterId });
      }}
    >
      <div className="sched-form-title">
        {t('schedule.add')}: <b>{t(dayKey(cell.weekday))}</b> · {slot ? `${slot.startsAt}–${slot.endsAt}` : cell.slotIdx} · {roomCode}
      </div>
      <label>
        {t('schedule.course')}
        <select value={courseCode} onChange={(e) => setCourse(e.target.value)} data-testid="sched-course">
          {catalog.courses.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('schedule.teacher')}
        <select value={teacherId} onChange={(e) => setTeacher(e.target.value)} data-testid="sched-teacher">
          {catalog.teachers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.shortName}
              {x.department ? ` · ${x.department}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('schedule.groups')} <small>{t('schedule.groupsHint')}</small>
        <select multiple value={groups} onChange={(e) => setGroups(Array.from(e.target.selectedOptions, (o) => o.value))} data-testid="sched-groups">
          {catalog.groups.map((g) => (
            <option key={g.code} value={g.code}>
              {g.code}
              {g.program ? ` · ${g.program}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('schedule.type')}
        <select value={type} onChange={(e) => setType(e.target.value as LessonType)} data-testid="sched-type">
          {TYPES.map((x) => (
            <option key={x} value={x}>
              {tl(x)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('schedule.parity')}
        <select value={parity} onChange={(e) => setParity(e.target.value as WeekParity)} data-testid="sched-parity">
          {PARITIES.map((p) => (
            <option key={p} value={p}>
              {t(`schedule.parity_${p}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="admin-row" style={{ alignSelf: 'end' }}>
        <button type="submit" className="btn is-active" disabled={busy || !courseCode || !teacherId || groups.length === 0} data-testid="sched-save">
          {t('schedule.save')}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {t('schedule.cancelForm')}
        </button>
      </div>
    </form>
  );
}
