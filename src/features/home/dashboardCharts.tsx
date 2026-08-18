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

export function StatusDonut({ slices }: { slices: PhaseSlice[] }) {
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
            />
          );
          offset += dash;
          return el;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="dash-donut-total">
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
            <span>{slice.label}</span>
            <strong>{Math.round(slice.pct)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PipelineFunnel({ stages }: { stages: PipelineStage[] }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <ol className="dash-funnel">
      {stages.map((stage, index) => {
          const width = 30 + (stage.value / max) * 68;
        return (
          <li key={stage.id} style={{ width: `${width}%` }}>
            <span className="dash-funnel-label">
              {index + 1}. {stage.label}
            </span>
            <strong>{formatCompactUsd(stage.value)}</strong>
          </li>
        );
      })}
    </ol>
  );
}

export function PerformanceBars({ bars }: { bars: SalesPerformanceBar[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="dash-bars" role="img" aria-label="Sales performance">
      {bars.map((bar) => (
        <div key={bar.id} className="dash-bar">
          <div className="dash-bar-track">
            <div className="dash-bar-fill" style={{ height: `${Math.max(8, (bar.value / max) * 100)}%` }} />
          </div>
          <strong>{formatCompactUsd(bar.value)}</strong>
          <span>{bar.label}</span>
        </div>
      ))}
    </div>
  );
}
