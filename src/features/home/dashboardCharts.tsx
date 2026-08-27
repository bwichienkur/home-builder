import { Link, useNavigate } from 'react-router-dom';
import type { PhaseSlice, PipelineStage, SalesPerformanceBar } from '../../lib/buildertrend/types';
import { formatCompactUsd } from '../../lib/buildertrend/format';

const PHASE_COLOR: Record<string, string> = {
  construction: '#0058a3',
  design: '#d4a017',
  permitting: '#d4a017',
  closeout: '#6b5ea8',
};

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 88;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
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
      <polyline fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
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
