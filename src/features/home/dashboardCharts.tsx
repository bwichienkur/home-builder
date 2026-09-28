import { useCallback, useId, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PhaseSlice, PipelineStage, SalesPerformanceBar } from '../../lib/buildertrend/types';
import { formatCompactUsd, formatUsd } from '../../lib/buildertrend/format';
import {
  CHART_PERIODS,
  formatHistoryDay,
  formatHistorySource,
  type ChartPeriodId,
  type PeriodSeries,
} from '../../lib/dashboard/kpiHistory';

const PHASE_COLOR: Record<string, string> = {
  construction: '#0058a3',
  design: '#d4a017',
  permitting: '#d4a017',
  closeout: '#6b5ea8',
};

const RH_GREEN = '#00c805';
const RH_RED = '#ff5000';

export function Sparkline({
  values,
  label,
  tone = 'accent',
}: {
  values: number[];
  label: string;
  tone?: 'accent' | 'up' | 'down';
}) {
  const width = 88;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stroke = tone === 'up' ? RH_GREEN : tone === 'down' ? RH_RED : 'var(--accent)';
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 4) + 2;
      const y = height - 3 - ((value - min) / span) * (height - 6);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg className="dash-spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <title>{label}</title>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

/** Robinhood-style period pills: 1D 1W 1M 3M YTD 1Y ALL */
export function PeriodFilter({
  value,
  onChange,
}: {
  value: ChartPeriodId;
  onChange: (id: ChartPeriodId) => void;
}) {
  return (
    <div className="dash-period-filter" role="tablist" aria-label="Chart period">
      {CHART_PERIODS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={`dash-period-pill${value === item.id ? ' is-active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function formatSeriesValue(value: number, isMoney: boolean): string {
  if (isMoney) return formatUsd(value);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

/** Full-width period line chart with hover tooltip + click to focus a day. */
export function PeriodLineChart({
  series,
  positive,
  isMoney = true,
  activeIndex = null,
  onActiveIndexChange,
  onToggleDetails,
}: {
  series: PeriodSeries;
  positive: boolean;
  isMoney?: boolean;
  activeIndex?: number | null;
  onActiveIndexChange?: (index: number | null) => void;
  onToggleDetails?: () => void;
}) {
  const gradId = useId().replace(/:/g, '');
  const width = 640;
  const height = 180;
  const values = series.values.length ? series.values : [0, 0];
  const days = series.days.length ? series.days : [''];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const color = positive ? RH_GREEN : RH_RED;
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 8) + 4;
    const y = height - 10 - ((value - min) / span) * (height - 20);
    return { x, y, value, day: days[index] ?? '' };
  });
  const linePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaPath = [
    `M ${coords[0]!.x} ${height}`,
    ...coords.map((c) => `L ${c.x} ${c.y}`),
    `L ${coords.at(-1)!.x} ${height}`,
    'Z',
  ].join(' ');

  const pickIndex = useCallback(
    (clientX: number, target: Element) => {
      const rect = target.getBoundingClientRect();
      if (!rect.width || coords.length === 0) return 0;
      const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(t * (coords.length - 1));
    },
    [coords.length],
  );

  const tip = activeIndex != null ? coords[activeIndex] : null;

  return (
    <div className="dash-period-chart-wrap">
      <svg
        className="dash-period-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Trend ${series.label}. Hover or click a point to see daily pull values.`}
        preserveAspectRatio="none"
        onMouseMove={(event) => {
          const index = pickIndex(event.clientX, event.currentTarget);
          onActiveIndexChange?.(index);
        }}
        onMouseLeave={() => onActiveIndexChange?.(null)}
        onClick={(event) => {
          const index = pickIndex(event.clientX, event.currentTarget);
          onActiveIndexChange?.(index);
          onToggleDetails?.();
        }}
      >
        <defs>
          <linearGradient id={`dashPeriodFill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#dashPeriodFill-${gradId})`} />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={linePoints}
        />
        {tip ? (
          <>
            <line
              x1={tip.x}
              x2={tip.x}
              y1={0}
              y2={height}
              stroke={color}
              strokeOpacity="0.35"
              strokeWidth="1.25"
            />
            <circle cx={tip.x} cy={tip.y} r="5" fill="#fff" stroke={color} strokeWidth="2.5" />
          </>
        ) : null}
      </svg>
      {tip ? (
        <div
          className="dash-period-tooltip"
          style={{ left: `${(tip.x / width) * 100}%` }}
          role="status"
        >
          <strong>{formatSeriesValue(tip.value, isMoney)}</strong>
          <span>{tip.day ? formatHistoryDay(tip.day) : '—'}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Expandable day-by-day table for the selected period series. */
export function PeriodDailyPoints({
  series,
  metricTitle,
  isMoney,
  open,
  onToggle,
  highlightedDay,
  onHighlightDay,
}: {
  series: PeriodSeries;
  metricTitle: string;
  isMoney: boolean;
  open: boolean;
  onToggle: () => void;
  highlightedDay?: string | null;
  onHighlightDay?: (day: string | null) => void;
}) {
  const rows = useMemo(
    () =>
      series.days.map((day, index) => ({
        day,
        value: series.values[index] ?? 0,
        source: series.sources[index] ?? '',
      })),
    [series],
  );

  return (
    <div className="dash-period-daily">
      <button type="button" className="dash-period-daily-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? 'Hide' : 'View'} daily pulls · {rows.length} point{rows.length === 1 ? '' : 's'} ·{' '}
        {series.label}
      </button>
      {open ? (
        <div className="dash-period-daily-panel">
          <p className="dash-period-daily-lede">
            Each row is a stored {metricTitle} value for that calendar day (from a live refresh or the
            scheduled daily job).
          </p>
          <div className="dash-period-daily-scroll">
            <table className="dash-period-daily-table">
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Value</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((row) => (
                  <tr
                    key={row.day}
                    className={highlightedDay === row.day ? 'is-active' : undefined}
                    onMouseEnter={() => onHighlightDay?.(row.day)}
                    onMouseLeave={() => onHighlightDay?.(null)}
                    onClick={() => onHighlightDay?.(row.day)}
                  >
                    <td>{formatHistoryDay(row.day)}</td>
                    <td>{formatSeriesValue(row.value, isMoney)}</td>
                    <td>{formatHistorySource(row.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StatusDonut({
  slices,
  hrefForSlice,
  totalHref,
}: {
  slices: PhaseSlice[];
  hrefForSlice?: (slice: PhaseSlice) => string;
  totalHref?: string;
}) {
  const navigate = useNavigate();
  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const r = 42;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  return (
    <div className="dash-donut-wrap">
      <svg className="dash-donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Project status overview">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--soft)" strokeWidth="14" />
        {slices.map((slice) => {
          const frac = total ? slice.pct / 100 : 0;
          const dash = frac * circ;
          const href = hrefForSlice?.(slice);
          const el = (
            <circle
              key={slice.phase}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={PHASE_COLOR[slice.phase]}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              className={href ? 'dash-donut-seg is-clickable' : undefined}
              style={href ? { cursor: 'pointer' } : undefined}
              onClick={href ? () => navigate(href) : undefined}
            />
          );
          offset += dash;
          return el;
        })}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className={`dash-donut-total${totalHref ? ' is-clickable' : ''}`}
          style={totalHref ? { cursor: 'pointer' } : undefined}
          onClick={totalHref ? () => navigate(totalHref) : undefined}
        >
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="dash-donut-sub">
          jobs
        </text>
      </svg>
      <ul className="dash-legend">
        {slices.map((slice) => {
          const href = hrefForSlice?.(slice);
          return (
            <li key={slice.phase}>
              <span className="dash-swatch" style={{ background: PHASE_COLOR[slice.phase] }} />
              {href ? (
                <Link to={href} className="dash-drill-link">
                  ({slice.count}) {slice.label.replace(/\s*\/\s*/g, ' ')}
                </Link>
              ) : (
                <span>
                  ({slice.count}) {slice.label.replace(/\s*\/\s*/g, ' ')}
                </span>
              )}
              <strong>{Math.round(slice.pct)}%</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PipelineFunnel({
  stages,
  hrefForStage,
}: {
  stages: PipelineStage[];
  hrefForStage?: (stage: PipelineStage) => string;
}) {
  const max = Math.max(...stages.map((stage) => stage.value), 1);
  return (
    <ol className="dash-funnel">
      {stages.map((stage, index) => {
        const width = 30 + (stage.value / max) * 68;
        const href = hrefForStage?.(stage);
        const content = (
          <>
            <span className="dash-funnel-label">
              {index + 1}. {stage.label}
            </span>
            <strong>{formatCompactUsd(stage.value)}</strong>
          </>
        );
        return (
          <li key={stage.id} style={{ width: `${width}%` }}>
            {href ? (
              <Link to={href} className="dash-funnel-btn">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function PerformanceBars({
  bars,
  hrefForBar,
}: {
  bars: SalesPerformanceBar[];
  hrefForBar?: (bar: SalesPerformanceBar) => string;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="dash-bars" role="img" aria-label="Sales performance">
      {bars.map((bar) => {
        const href = hrefForBar?.(bar);
        const content = (
          <>
            <div className="dash-bar-track">
              <div className="dash-bar-fill" style={{ height: `${Math.max(8, (bar.value / max) * 100)}%` }} />
            </div>
            <strong>{formatCompactUsd(bar.value)}</strong>
            <span>{bar.label}</span>
          </>
        );
        return href ? (
          <Link key={bar.id} to={href} className="dash-bar dash-bar-btn">
            {content}
          </Link>
        ) : (
          <div key={bar.id} className="dash-bar">
            {content}
          </div>
        );
      })}
    </div>
  );
}
