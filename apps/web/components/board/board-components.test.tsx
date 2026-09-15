import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ru from '@/messages/ru.json';
import { SplitFlap, _resetFlipBudget, reserveFlips } from './SplitFlap';
import { StatusPill } from './StatusPill';
import { BoardRow } from './BoardRow';
import { BoardStoreProvider, emptySnapshot } from '@/lib/store/boardStore';
import { TimeStoreProvider } from '@/features/time/useNow';
import { session } from '@/features/board/board.test';

const time = { now: '2026-09-15T05:47:00Z', mode: 'fixed' as const, timezone: 'Asia/Almaty', localDate: '2026-09-15', weekNumber: 3, parity: 'odd' as const };

function wrap(ui: React.ReactNode, now = [session({ sessionId: 'a' })]) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ru} timeZone="Asia/Almaty">
      <TimeStoreProvider initial={time}>
        <BoardStoreProvider init={{ snapshot: { ...emptySnapshot(), at: time.now, date: '2026-09-15', now } }}>{ui}</BoardStoreProvider>
      </TimeStoreProvider>
    </NextIntlClientProvider>,
  );
}

describe('SplitFlap', () => {
  beforeEach(() => _resetFlipBudget());
  it('renders fixed-width cells and flips only the changed ones', () => {
    const { rerender } = wrap(<SplitFlap value="10:00" width={5} testId="flap" />);
    const cells = () => screen.getByTestId('flap').querySelectorAll('.flap-cell');
    expect(cells()).toHaveLength(5);
    expect(screen.getByTestId('flap')).toHaveAttribute('aria-label', '10:00');
    rerender(
      <NextIntlClientProvider locale="ru" messages={ru} timeZone="Asia/Almaty">
        <TimeStoreProvider initial={time}>
          <BoardStoreProvider init={{}}>
            <SplitFlap value="10:05" width={5} testId="flap" />
          </BoardStoreProvider>
        </TimeStoreProvider>
      </NextIntlClientProvider>,
    );
    const flipping = [...cells()].map((c) => c.classList.contains('is-flipping'));
    expect(flipping).toEqual([false, false, false, false, true]);
    expect((cells()[4] as HTMLElement).style.animationDelay).toBe('100ms');
  });
  it('pads and truncates to the width', () => {
    wrap(<SplitFlap value="AI-LAB" width={4} testId="f2" />);
    expect(screen.getByTestId('f2').textContent).toBe('AI-L');
    wrap(<SplitFlap value="7" width={3} align="right" testId="f3" />);
    expect(screen.getByTestId('f3').textContent).toBe('  7');
  });
  it('caps simultaneous flips at 40 and falls back to fade', () => {
    expect(reserveFlips(30)).toBe(true);
    expect(reserveFlips(10)).toBe(true);
    expect(reserveFlips(1)).toBe(false);
  });
});

describe('StatusPill', () => {
  const now = Date.parse('2026-09-15T05:47:00Z');
  it.each([
    [session({ sessionId: 'x', phase: 'live' }), 'live', 'ИДЁТ'],
    [session({ sessionId: 'x', phase: 'ending' }), 'ending', 'КОНЕЦ 3 МИН'],
    [session({ sessionId: 'x', phase: 'cancelled', status: 'cancelled' }), 'cancelled', 'ОТМЕНА'],
    [session({ sessionId: 'x', phase: 'upcoming', status: 'moved', roomCode: '214' }), 'moved', 'ПЕРЕНОС → 214'],
    [session({ sessionId: 'x', phase: 'upcoming', status: 'delayed', delayMinutes: 15 }), 'delayed', 'ЗАДЕРЖКА +15'],
    [session({ sessionId: 'x', phase: 'soon', startAt: '2026-09-15T06:00:00Z' }), 'soon', 'НАЧАЛО 11:00'],
    [session({ sessionId: 'x', phase: 'upcoming', startAt: '2026-09-15T06:00:00Z' }), 'upcoming', 'НАЧАЛО 11:00'],
  ])('renders %#', (s, kind, text) => {
    wrap(<StatusPill session={s} now={now} flap={false} />);
    const pill = screen.getByTestId('status-pill');
    expect(pill).toHaveAttribute('data-kind', kind);
    expect(pill.textContent).toContain(text);
  });
  it('shows a warning glyph on conflicts (not colour alone)', () => {
    wrap(<StatusPill session={session({ sessionId: 'x', conflict: true })} now={now} flap={false} />);
    expect(screen.getByLabelText(/Конфликт/)).toBeInTheDocument();
  });
});

describe('BoardRow', () => {
  it('renders all cells for its session and a progress bar when live', () => {
    wrap(<BoardRow sessionId="a" index={0} />);
    const row = screen.getByTestId('board-row');
    expect(row).toHaveAttribute('data-phase', 'live');
    expect(row.querySelector('.cell-time')?.textContent).toBe('10:00');
    expect(row.querySelector('.cell-room')?.textContent?.trim()).toBe('101');
    expect(row.querySelector('.cell-course')?.textContent).toContain('Базы данных');
    expect(row.querySelector('.cell-teacher')?.textContent).toBe('Ахметов Д.Б.');
    expect(row.querySelector('.cell-groups')?.textContent).toBe('ПО2301');
    expect(row.querySelector('.progress')).not.toBeNull();
    expect(screen.getByTestId('status-pill')).toHaveAttribute('data-kind', 'live');
  });
  it('strikes through cancelled rows and marks conflicts', () => {
    wrap(<BoardRow sessionId="c" index={0} />, [session({ sessionId: 'c', phase: 'cancelled', status: 'cancelled', conflict: true })]);
    const row = screen.getByTestId('board-row');
    expect(row.className).toContain('is-cancelled');
    expect(row.className).toContain('is-conflict');
    expect(row.querySelector('.progress')).toBeNull();
  });
  it('renders nothing for an unknown session id', () => {
    const { container } = wrap(<BoardRow sessionId="nope" index={0} />);
    expect(container.querySelector('[data-testid="board-row"]')).toBeNull();
  });
  it('only ending rows re-render on ticks (countdown)', async () => {
    wrap(<BoardRow sessionId="e" index={0} />, [session({ sessionId: 'e', phase: 'ending', endAt: '2026-09-15T05:50:00Z' })]);
    expect(screen.getByTestId('status-pill').textContent).toContain('3');
    await act(async () => {});
  });
});
