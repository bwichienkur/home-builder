import { describe, expect, it } from 'vitest';
import {
  DAILY_LOG_ROLLING_WEEKS,
  DAILY_LOGS_PER_WEEK,
  computeDailyLogMetrics,
  enrichOwnerJobs,
  expectedLogsRolling,
  lifetimeLogCompletionPct,
  weeksOnSite,
} from './dailyLogStandards';

const now = new Date('2026-08-19T12:00:00');

describe('daily log standards', () => {
  it('expects 4 logs per week and 16 per rolling 4-week window per project', () => {
    expect(DAILY_LOGS_PER_WEEK).toBe(4);
    expect(DAILY_LOG_ROLLING_WEEKS).toBe(4);
    expect(expectedLogsRolling(now)).toBe(16);
  });

  it('computes lifetime completion from site weeks', () => {
    const openedAt = '2026-04-01'; // ~20 weeks before Aug 19
    expect(weeksOnSite(openedAt, now)).toBeGreaterThanOrEqual(19);
    const due = weeksOnSite(openedAt, now) * 4;
    expect(lifetimeLogCompletionPct(40, openedAt, now)).toBeCloseTo((40 / due) * 100, 0);
  });

  it('enriches jobs with rolling and lifetime metrics', () => {
    const [job] = enrichOwnerJobs(
      [{ id: '1', name: 'Test', openedAt: '2026-04-01', notes: '55 daily logs', dailyLogsRecentDone: 12 }],
      now,
    );
    expect(job.dailyLogsRecentExpected).toBe(16);
    expect(job.dailyLogsRecentDone).toBe(12);
    expect(job.dailyLogsTotal).toBe(55);
    expect(job.dailyLogLifetimePct).toBeGreaterThan(0);
  });

  it('shows —/expected when recent count is unknown', () => {
    const metrics = computeDailyLogMetrics({ openedAt: '2026-01-01', totalLogs: 10, now });
    expect(metrics.dailyLogsRecentDone).toBeNull();
    expect(metrics.dailyLogsRecentExpected).toBe(16);
  });
});
