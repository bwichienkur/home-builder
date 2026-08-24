/** Olsen standard: 4 daily logs per project per week (Mon–Fri field week). */
export const DAILY_LOGS_PER_WEEK = 4;
/** Rolling window shown as “Daily logs this month” in the UI (past 4 weeks). */
export const DAILY_LOG_ROLLING_WEEKS = 4;

export function weeksOnSite(openedAt: string, now = new Date()) {
  if (!openedAt) return 0;
  const start = new Date(`${openedAt}T12:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const days = Math.max(0, Math.round((now.getTime() - start.getTime()) / 86_400_000));
  return Math.max(1, Math.ceil(days / 7));
}

export function expectedLogsForWeeks(weeks: number) {
  if (weeks <= 0) return 0;
  return weeks * DAILY_LOGS_PER_WEEK;
}

export function expectedLogsRolling(now = new Date()) {
  return expectedLogsForWeeks(DAILY_LOG_ROLLING_WEEKS);
}

export function lifetimeLogCompletionPct(totalLogs: number, openedAt: string, now = new Date()) {
  const due = expectedLogsForWeeks(weeksOnSite(openedAt, now));
  if (!due) return 0;
  return Math.min(100, (totalLogs / due) * 100);
}

export function parseTotalLogsFromNotes(notes: string) {
  const match = notes.match(/(\d+)\s+daily logs/i);
  return match ? Number(match[1]) : 0;
}

export type DailyLogJobMetrics = {
  dailyLogsTotal: number;
  /** Logs submitted in the past 4 weeks (when BT provides a count; else null). */
  dailyLogsRecentDone: number | null;
  dailyLogsRecentExpected: number;
  dailyLogsLifetimeDue: number;
  dailyLogLifetimePct: number;
  /** False when Foundation has not started — logs are not required. */
  requiresDailyLogs: boolean;
};

/**
 * Daily logs are required only after the Foundation schedule item has started.
 * `foundationStarted === false` → not required. Missing/unknown → required (mock / legacy).
 */
export function jobRequiresDailyLogs(foundationStarted?: boolean | null) {
  return foundationStarted !== false;
}

export function computeDailyLogMetrics(input: {
  openedAt: string;
  totalLogs: number;
  recentDone?: number | null;
  foundationStarted?: boolean | null;
  now?: Date;
}): DailyLogJobMetrics {
  const now = input.now ?? new Date();
  const dailyLogsTotal = Math.max(0, input.totalLogs);
  const requiresDailyLogs = jobRequiresDailyLogs(input.foundationStarted);
  if (!requiresDailyLogs) {
    return {
      dailyLogsTotal,
      dailyLogsRecentDone: input.recentDone ?? null,
      dailyLogsRecentExpected: 0,
      dailyLogsLifetimeDue: 0,
      dailyLogLifetimePct: 0,
      requiresDailyLogs: false,
    };
  }
  const dailyLogsLifetimeDue = expectedLogsForWeeks(weeksOnSite(input.openedAt, now));
  return {
    dailyLogsTotal,
    dailyLogsRecentDone: input.recentDone ?? null,
    dailyLogsRecentExpected: expectedLogsRolling(now),
    dailyLogsLifetimeDue,
    dailyLogLifetimePct: lifetimeLogCompletionPct(dailyLogsTotal, input.openedAt, now),
    requiresDailyLogs: true,
  };
}

export function enrichOwnerJobs<
  T extends {
    openedAt: string;
    notes: string;
    dailyLogsTotal?: number;
    dailyLogsRecentDone?: number | null;
    foundationStarted?: boolean | null;
  },
>(jobs: T[], now = new Date()): (T & DailyLogJobMetrics)[] {
  return jobs.map((job) => {
    const total = job.dailyLogsTotal ?? parseTotalLogsFromNotes(job.notes);
    return {
      ...job,
      ...computeDailyLogMetrics({
        openedAt: job.openedAt,
        totalLogs: total,
        recentDone: job.dailyLogsRecentDone,
        foundationStarted: job.foundationStarted,
        now,
      }),
    };
  });
}
