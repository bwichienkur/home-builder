import type { TimeMetric } from './types';

/** Schedule milestone dates from Gantt (expected/projected). */
export type JobScheduleMilestones = {
  firstScheduleStart?: string;
  permittingEndDate?: string;
  foundationStartDate?: string;
  closingEndDate?: string;
};

export function calendarDaysBetween(start: string, end: string): number | null {
  if (!start || !end) return null;
  const a = new Date(`${start}T12:00:00`).getTime();
  const b = new Date(`${end}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Project-specific estimated durations from schedule milestone dates.
 * Same formulas as portfolio Average time metrics, but for one job’s Gantt dates.
 */
export function estimatedTimeMetricsForJob(milestones: JobScheduleMilestones): TimeMetric[] {
  const close = milestones.closingEndDate;
  if (!close) return [];

  const contractDays = calendarDaysBetween(milestones.firstScheduleStart ?? '', close);
  const permitDays = calendarDaysBetween(milestones.permittingEndDate ?? '', close);
  const slabDays = calendarDaysBetween(milestones.foundationStartDate ?? '', close);

  return [
    contractDays != null && contractDays >= 0
      ? { id: 'contract-close', label: 'Est. contract to close', days: contractDays, deltaDays: 0 }
      : null,
    permitDays != null && permitDays >= 0
      ? { id: 'permit-close', label: 'Est. permit to close', days: permitDays, deltaDays: 0 }
      : null,
    slabDays != null && slabDays >= 0
      ? { id: 'slab-close', label: 'Est. slab pour to close', days: slabDays, deltaDays: 0 }
      : null,
  ].filter((row): row is TimeMetric => row != null);
}

export function scheduleMilestonesFromJob(job: JobScheduleMilestones): JobScheduleMilestones {
  return {
    firstScheduleStart: job.firstScheduleStart,
    permittingEndDate: job.permittingEndDate,
    foundationStartDate: job.foundationStartDate,
    closingEndDate: job.closingEndDate,
  };
}
