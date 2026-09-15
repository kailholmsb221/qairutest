'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAutoFitRows, useRowHeight } from '@/features/board/useAutoFitRows';
import { usePager } from '@/features/board/usePager';
import { useUiStore } from '@/lib/store/uiStore';
import { BoardRow } from './BoardRow';
import { Pager } from './Pager';

interface Props {
  id: 'now' | 'next';
  title: string;
  count: string;
  sessionIds: string[];
  empty: React.ReactNode;
  /** defaults to the ui store value (8 s; /kiosk?page= overrides) */
  pageIntervalMs?: number;
}

/**
 * One board section: header with count, auto-fitted rows, page dots. Pages rotate every 8 s when
 * overflowing and pause while hovered. Rows share `layoutId`s so a session moving NEXT → NOW slides.
 */
export function BoardSection({ id, title, count, sessionIds, empty, pageIntervalMs }: Props) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const rowH = useRowHeight(rowsRef);
  const perPage = useAutoFitRows(rowsRef, rowH, 1);
  const [hover, setHover] = useState(false);
  const kiosk = useUiStore((s) => s.kiosk);
  const storedInterval = useUiStore((s) => s.pageIntervalMs);
  const pager = usePager(sessionIds, perPage, pageIntervalMs ?? storedInterval, hover && !kiosk);

  return (
    <section className={`board-section panel is-${id}`} aria-labelledby={`board-${id}-title`} data-testid={`board-${id}`} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <header className="board-head">
        <h2 id={`board-${id}-title`} className="board-title" style={{ margin: 0, fontSize: '1em' }}>
          {title}
        </h2>
        <span className="board-count" data-testid={`board-${id}-count`}>
          {count}
        </span>
      </header>
      <div className="board-rows" ref={rowsRef} role="table" aria-rowcount={sessionIds.length} data-testid={`board-${id}-rows`} data-per-page={perPage}>
        {sessionIds.length === 0 ? (
          <div className="board-empty" role="row">
            <span role="cell">{empty}</span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={pager.page} role="rowgroup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {pager.items.map((sid, i) => (
                <BoardRow key={sid} sessionId={sid} index={i} />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <Pager page={pager.page} pages={pager.pages} onPick={pager.setPage} />
    </section>
  );
}
