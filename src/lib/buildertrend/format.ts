const PHASE_LABEL: Record<string, string> = {
  design: 'Design / Permitting',
  permitting: 'Design / Permitting',
  construction: 'Construction',
  closeout: 'Closeout / Warranty',
};

export function phaseLabel(phase: string) {
  return PHASE_LABEL[phase] ?? phase;
}

export function formatCompactUsd(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

export function formatUsd(amount: number) {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function formatPct(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function formatDays(value: number) {
  const rounded = Math.round(value * 10) / 10;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${rounded > 0 ? '+' : ''}${body}d`;
}

/** Split a day count into 30-day months + remainder (for schedule duration labels). */
export function splitMonthsDays(totalDays: number) {
  const total = Math.max(0, Math.round(totalDays));
  return { months: Math.floor(total / 30), days: total % 30 };
}

/** e.g. 244 → "8 months 4 days", 420 → "14 months" */
export function formatMonthsDays(totalDays: number) {
  const { months, days } = splitMonthsDays(totalDays);
  const parts: string[] = [];
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : '0 days';
}

export function formatDelta(delta: number, unit: 'pct' | 'pts') {
  const arrow = delta >= 0 ? '↑' : '↓';
  const abs = Math.abs(delta).toFixed(1);
  return unit === 'pts' ? `${arrow} ${abs} pts` : `${arrow} ${abs}%`;
}

export function formatCloseDate(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatRefreshedAt(iso: string, now = new Date()) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const totalMinutes = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000));
  const ago = formatRefreshAgo(totalMinutes);
  const date = then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `Updated ${ago} · ${date}`;
}

/** Relative age as days / hours / minutes (e.g. "1d 3h 12m ago"). */
export function formatRefreshAgo(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 1) return 'just now';
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
  return `${parts.join(' ')} ago`;
}

export function totalSlipDays(slip: { permit: number; selections: number; construction: number }) {
  return slip.permit + slip.selections + slip.construction;
}
