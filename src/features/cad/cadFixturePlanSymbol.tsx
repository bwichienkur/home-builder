import type { CadFixtureKind } from '../../lib/cadStudio/types';

export const FIXTURE_PLAN_COLOR: Record<CadFixtureKind, string> = {
  counter: '#b8956c',
  island: '#a16207',
  sink: '#0284c7',
  toilet: '#64748b',
  tub: '#7891a8',
  appliance: '#475569',
  mirror: '#64748b',
  other: '#78716c',
};

type SymbolProps = {
  kind: CadFixtureKind;
  widthFt: number;
  depthFt: number;
  /** Stroke width in plan feet (SVG user units). */
  stroke: number;
  selected?: boolean;
  /** Prefer stove burners when block name looks like a range. */
  blockName?: string;
};

/**
 * Architectural 2D plan symbol in local space: origin at center,
 * +X along width, +Y toward the "back" (wall / tank side).
 */
export function CadFixturePlanSymbol({
  kind,
  widthFt,
  depthFt,
  stroke,
  selected,
  blockName,
}: SymbolProps) {
  const w = Math.max(0.4, widthFt);
  const d = Math.max(0.25, depthFt);
  const hw = w / 2;
  const hd = d / 2;
  const color = FIXTURE_PLAN_COLOR[kind];
  const strokeCol = selected ? '#1f4e46' : color;
  const sw = stroke * (selected ? 1.8 : 1.15);
  const fillOp = selected ? 0.55 : 0.32;
  const isStove = kind === 'appliance' && !/FRIDGE|REF|DISHW|WASHER|DRYER|MICRO/i.test(blockName ?? 'STOVE');

  if (kind === 'toilet') {
    const tankW = w * 0.72;
    const tankD = Math.min(0.55, d * 0.28);
    const bowlRx = w * 0.32;
    const bowlRy = d * 0.34;
    return (
      <g>
        <rect
          x={-tankW / 2}
          y={hd - tankD}
          width={tankW}
          height={tankD}
          fill={color}
          fillOpacity={fillOp + 0.15}
          stroke={strokeCol}
          strokeWidth={sw}
          rx={stroke * 1.2}
        />
        <ellipse
          cx={0}
          cy={-hd * 0.15}
          rx={bowlRx}
          ry={bowlRy}
          fill="#f8fafc"
          fillOpacity={0.92}
          stroke={strokeCol}
          strokeWidth={sw}
        />
        <ellipse
          cx={0}
          cy={-hd * 0.12}
          rx={bowlRx * 0.45}
          ry={bowlRy * 0.4}
          fill="none"
          stroke={strokeCol}
          strokeWidth={sw * 0.7}
          strokeOpacity={0.7}
        />
      </g>
    );
  }

  if (kind === 'tub') {
    const inset = Math.min(0.22, w * 0.06, d * 0.1);
    return (
      <g>
        <rect
          x={-hw}
          y={-hd}
          width={w}
          height={d}
          fill={color}
          fillOpacity={fillOp}
          stroke={strokeCol}
          strokeWidth={sw}
          rx={Math.min(0.35, d * 0.22)}
        />
        <rect
          x={-hw + inset}
          y={-hd + inset}
          width={w - inset * 2}
          height={d - inset * 2}
          fill="#f1f5f9"
          fillOpacity={0.85}
          stroke={strokeCol}
          strokeWidth={sw * 0.75}
          rx={Math.min(0.28, d * 0.16)}
        />
        <circle
          cx={-hw + inset + 0.35}
          cy={0}
          r={Math.min(0.18, d * 0.12)}
          fill="none"
          stroke={strokeCol}
          strokeWidth={sw * 0.7}
        />
      </g>
    );
  }

  if (kind === 'sink') {
    const basinRx = w * 0.28;
    const basinRy = d * 0.28;
    const double = w >= 2.4;
    return (
      <g>
        <rect
          x={-hw}
          y={-hd}
          width={w}
          height={d}
          fill={color}
          fillOpacity={fillOp * 0.7}
          stroke={strokeCol}
          strokeWidth={sw}
          rx={stroke * 1.5}
        />
        {double ? (
          <>
            <ellipse cx={-w * 0.22} cy={0} rx={basinRx * 0.85} ry={basinRy} fill="#e0f2fe" fillOpacity={0.95} stroke={strokeCol} strokeWidth={sw * 0.8} />
            <ellipse cx={w * 0.22} cy={0} rx={basinRx * 0.85} ry={basinRy} fill="#e0f2fe" fillOpacity={0.95} stroke={strokeCol} strokeWidth={sw * 0.8} />
          </>
        ) : (
          <ellipse cx={0} cy={0} rx={basinRx} ry={basinRy} fill="#e0f2fe" fillOpacity={0.95} stroke={strokeCol} strokeWidth={sw * 0.85} />
        )}
        <circle cx={0} cy={hd * 0.55} r={stroke * 2.2} fill={strokeCol} fillOpacity={0.55} />
      </g>
    );
  }

  if (kind === 'counter' || kind === 'island') {
    const edge = Math.min(0.12, d * 0.08);
    return (
      <g>
        <rect
          x={-hw}
          y={-hd}
          width={w}
          height={d}
          fill={color}
          fillOpacity={kind === 'island' ? fillOp + 0.12 : fillOp}
          stroke={strokeCol}
          strokeWidth={sw}
          rx={stroke * 0.8}
        />
        {/* Front edge band */}
        <rect
          x={-hw}
          y={-hd}
          width={w}
          height={edge}
          fill={strokeCol}
          fillOpacity={0.35}
        />
        {/* Light hatch hint */}
        <line
          x1={-hw + 0.25}
          y1={hd - edge * 1.5}
          x2={hw - 0.25}
          y2={hd - edge * 1.5}
          stroke={strokeCol}
          strokeWidth={sw * 0.55}
          strokeOpacity={0.35}
        />
        {kind === 'island' && (
          <rect
            x={-hw + 0.2}
            y={-hd + 0.2}
            width={w - 0.4}
            height={d - 0.4}
            fill="none"
            stroke={strokeCol}
            strokeWidth={sw * 0.55}
            strokeOpacity={0.45}
            strokeDasharray={`${stroke * 3} ${stroke * 2}`}
          />
        )}
      </g>
    );
  }

  if (kind === 'appliance') {
    if (isStove) {
      const br = Math.min(0.28, w * 0.14, d * 0.16);
      const positions = [
        [-0.28, -0.22],
        [0.28, -0.22],
        [-0.28, 0.18],
        [0.28, 0.18],
      ] as const;
      return (
        <g>
          <rect
            x={-hw}
            y={-hd}
            width={w}
            height={d}
            fill={color}
            fillOpacity={fillOp + 0.1}
            stroke={strokeCol}
            strokeWidth={sw}
            rx={stroke * 0.6}
          />
          {positions.map(([px, py], i) => (
            <g key={i}>
              <circle
                cx={px * w}
                cy={py * d}
                r={br}
                fill="none"
                stroke={strokeCol}
                strokeWidth={sw * 0.85}
              />
              <circle
                cx={px * w}
                cy={py * d}
                r={br * 0.35}
                fill={strokeCol}
                fillOpacity={0.35}
              />
            </g>
          ))}
          {/* Control panel strip at back */}
          <rect
            x={-hw * 0.85}
            y={hd - Math.min(0.28, d * 0.18)}
            width={w * 0.85}
            height={Math.min(0.22, d * 0.14)}
            fill={strokeCol}
            fillOpacity={0.4}
            rx={stroke * 0.4}
          />
        </g>
      );
    }
    // Generic appliance (fridge / dishwasher silhouette)
    return (
      <g>
        <rect
          x={-hw}
          y={-hd}
          width={w}
          height={d}
          fill={color}
          fillOpacity={fillOp}
          stroke={strokeCol}
          strokeWidth={sw}
          rx={stroke * 0.6}
        />
        <line
          x1={-hw * 0.7}
          y1={0}
          x2={hw * 0.7}
          y2={0}
          stroke={strokeCol}
          strokeWidth={sw * 0.7}
          strokeOpacity={0.5}
        />
        <circle cx={hw * 0.65} cy={0} r={stroke * 2} fill={strokeCol} fillOpacity={0.45} />
      </g>
    );
  }

  if (kind === 'mirror') {
    const glassD = Math.max(0.12, Math.min(d, 0.45));
    return (
      <g>
        <rect
          x={-hw}
          y={-glassD / 2}
          width={w}
          height={glassD}
          fill="#e2e8f0"
          fillOpacity={0.75}
          stroke={strokeCol}
          strokeWidth={sw}
          rx={stroke * 0.5}
        />
        <line
          x1={-hw + 0.15}
          y1={-glassD * 0.15}
          x2={hw - 0.15}
          y2={glassD * 0.2}
          stroke={strokeCol}
          strokeWidth={sw * 0.7}
          strokeOpacity={0.45}
        />
        <line
          x1={-hw + 0.35}
          y1={glassD * 0.25}
          x2={hw * 0.2}
          y2={-glassD * 0.3}
          stroke={strokeCol}
          strokeWidth={sw * 0.55}
          strokeOpacity={0.3}
        />
      </g>
    );
  }

  // other
  return (
    <rect
      x={-hw}
      y={-hd}
      width={w}
      height={d}
      fill={color}
      fillOpacity={fillOp}
      stroke={strokeCol}
      strokeWidth={sw}
      rx={stroke * 2}
    />
  );
}
