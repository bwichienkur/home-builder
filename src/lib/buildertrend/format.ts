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
  const minutes = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000));
  const ago = minutes < 1 ? 'just now' : minutes === 1 ? '1m ago' : `${minutes}m ago`;
  const date = then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `Updated ${ago} · ${date}`;
}

export function totalSlipDays(slip: { permit: number; selections: number; purchasing: number; construction: number }) {
  return slip.permit + slip.selections + slip.purchasing + slip.construction;
}
