import { describe, expect, it } from 'vitest';
import { formatMonthsDays, formatRefreshAgo, formatRefreshedAt, splitMonthsDays } from './format';

describe('formatMonthsDays', () => {
  it('splits days into 30-day months plus remainder', () => {
    expect(splitMonthsDays(244)).toEqual({ months: 8, days: 4 });
    expect(formatMonthsDays(244)).toBe('8 months 4 days');
  });

  it('omits zero-day remainder', () => {
    expect(formatMonthsDays(420)).toBe('14 months');
  });

  it('handles sub-month durations', () => {
    expect(formatMonthsDays(4)).toBe('4 days');
    expect(formatMonthsDays(0)).toBe('0 days');
  });
});

describe('formatRefreshAgo', () => {
  it('uses just now under one minute', () => {
    expect(formatRefreshAgo(0)).toBe('just now');
  });

  it('formats minutes only under an hour', () => {
    expect(formatRefreshAgo(1)).toBe('1m ago');
    expect(formatRefreshAgo(45)).toBe('45m ago');
  });

  it('includes hours and minutes', () => {
    expect(formatRefreshAgo(60)).toBe('1h ago');
    expect(formatRefreshAgo(75)).toBe('1h 15m ago');
  });

  it('includes days, hours, and minutes', () => {
    expect(formatRefreshAgo(24 * 60)).toBe('1d ago');
    expect(formatRefreshAgo(24 * 60 + 3 * 60 + 12)).toBe('1d 3h 12m ago');
    expect(formatRefreshAgo(2 * 24 * 60 + 5)).toBe('2d 5m ago');
  });

  it('builds the full refreshed-at line', () => {
    const now = new Date('2026-08-27T12:00:00.000Z');
    const stamp = new Date(now.getTime() - (1 * 24 * 60 + 2 * 60 + 5) * 60_000).toISOString();
    expect(formatRefreshedAt(stamp, now)).toMatch(/^Updated 1d 2h 5m ago · /);
  });
});
