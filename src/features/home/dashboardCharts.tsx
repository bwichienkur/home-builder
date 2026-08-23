import type { PhaseSlice, PipelineStage, SalesPerformanceBar } from '../../lib/buildertrend/types';
import { formatCompactUsd } from '../../lib/buildertrend/format';

const PHASE_COLOR: Record<string, string> = {
  construction: '#0058a3',
  permitting: '#2a9d8f',
  design: '#d4a017',
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
  onSliceClick,
  onTotalClick,
}: {
  slices: PhaseSlice[];
  onSliceClick?: (slice: PhaseSlice) => void;
  onTotalClick?: () => void;
}) {
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
              className={onSliceClick ? 'dash-donut-seg is-clickable' : undefined}
              onClick={onSliceClick ? () => onSliceClick(slice) : undefined}
              style={onSliceClick ? { cursor: 'pointer' } : undefined}
            />
          );
          offset += dash;
          return el;
        })}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className={`dash-donut-total${onTotalClick ? ' is-clickable' : ''}`}
          onClick={onTotalClick}
          style={onTotalClick ? { cursor: 'pointer' } : undefined}
        >
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="dash-donut-sub">
          jobs
        </text>
      </svg>
      <ul className="dash-legend">
        {slices.map((slice) => (
          <li key={slice.phase}>
            <span className="dash-swatch" style={{ background: PHASE_COLOR[slice.phase] }} />
            {onSliceClick ? (
              <button type="button" className="dash-drill-link" onClick={() => onSliceClick(slice)}>
                {slice.label} · {slice.count}
              </button>
            ) : (
              <span>
                {slice.label} · {slice.count}
              </span>
            )}
            <strong>{Math.round(slice.pct)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PipelineFunnel({
  stages,
  onStageClick,
}: {
  stages: PipelineStage[];
  onStageClick?: (stage: PipelineStage) => void;
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <ol className="dash-funnel">
      {stages.map((stage, index) => {
        const width = 30 + (stage.value / max) * 68;
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
            {onStageClick ? (
              <button type="button" className="dash-funnel-btn" onClick={() => onStageClick(stage)}>
                {content}
              </button>
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
  onBarClick,
}: {
  bars: SalesPerformanceBar[];
  onBarClick?: (bar: SalesPerformanceBar) => void;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="dash-bars" role="img" aria-label="Sales performance">
      {bars.map((bar) => {
        const content = (
          <>
            <div className="dash-bar-track">
              <div className="dash-bar-fill" style={{ height: `${Math.max(8, (bar.value / max) * 100)}%` }} />
            </div>
            <strong>{formatCompactUsd(bar.value)}</strong>
            <span>{bar.label}</span>
          </>
        );
        return onBarClick ? (
          <button key={bar.id} type="button" className="dash-bar dash-bar-btn" onClick={() => onBarClick(bar)}>
            {content}
          </button>
        ) : (
          <div key={bar.id} className="dash-bar">
            {content}
          </div>
        );
      })}
    </div>
  );
}
