import { describe, expect, it } from 'vitest';
import { atLocalTime, deriveProgress, formatCountdown, formatTime, localDate, minutesOfDay, minutesUntil, tzOffsetMinutes } from './derive';

const TZ = 'Asia/Almaty'; // UTC+5, no DST
const start = '2026-09-15T05:00:00Z'; // 10:00 local
const end = '2026-09-15T05:50:00Z'; // 10:50 local

describe('deriveProgress', () => {
  it('clamps to [0, 1]', () => {
    expect(deriveProgress(start, end, Date.parse('2026-09-15T04:00:00Z'))).toBe(0);
    expect(deriveProgress(start, end, Date.parse('2026-09-15T06:00:00Z'))).toBe(1);
  });
  it('is linear in between', () => {
    expect(deriveProgress(start, end, Date.parse('2026-09-15T05:25:00Z'))).toBeCloseTo(0.5, 5);
  });
  it('handles bad input', () => {
    expect(deriveProgress('x', end, 0)).toBe(0);
    expect(deriveProgress(end, start, 0)).toBe(0);
  });
});

describe('countdowns', () => {
  it('rounds minutes up', () => {
    expect(minutesUntil(end, Date.parse('2026-09-15T05:47:01Z'))).toBe(3);
    expect(minutesUntil(end, Date.parse('2026-09-15T05:50:00Z'))).toBe(0);
    expect(minutesUntil(start, Date.parse('2026-09-15T05:10:00Z'))).toBe(-10);
  });
  it('formats mm:ss under 10 minutes, then minutes and hours', () => {
    expect(formatCountdown(end, Date.parse('2026-09-15T05:47:18Z'))).toBe('2:42');
    expect(formatCountdown(end, Date.parse('2026-09-15T05:20:00Z'))).toBe('30m');
    expect(formatCountdown(end, Date.parse('2026-09-15T03:20:00Z'))).toBe('2h 30m');
    expect(formatCountdown(end, Date.parse('2026-09-15T03:50:00Z'))).toBe('2h');
    expect(formatCountdown(end, Date.parse('2026-09-15T06:50:00Z'))).toBe('0:00');
    expect(formatCountdown(end, Date.parse('2026-09-15T05:20:00Z'), { minuteSuffix: ' мин' })).toBe('30 мин');
  });
});

describe('time zone helpers', () => {
  it('formats local time', () => {
    expect(formatTime(start, TZ)).toBe('10:00');
    expect(localDate(Date.parse('2026-09-15T20:30:00Z'), TZ)).toBe('2026-09-16'); // 01:30 next day in Almaty
  });
  it('offset and minutes of day', () => {
    expect(tzOffsetMinutes(Date.parse(start), TZ)).toBe(300);
    expect(minutesOfDay(Date.parse(start), TZ)).toBe(600);
    expect(minutesOfDay(Date.parse('2026-09-15T19:30:00Z'), TZ)).toBe(30);
  });
  it('atLocalTime builds the instant of a local HH:MM on the same local date', () => {
    const at = atLocalTime(Date.parse(start), TZ, 8 * 60 + 20);
    expect(new Date(at).toISOString()).toBe('2026-09-15T03:20:00.000Z');
    // after local midnight the date is the next one
    const late = atLocalTime(Date.parse('2026-09-15T19:30:00Z'), TZ, 9 * 60);
    expect(new Date(late).toISOString()).toBe('2026-09-16T04:00:00.000Z');
  });
});
