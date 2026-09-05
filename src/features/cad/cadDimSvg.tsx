/** Shared SVG marks for plan dimensions (exterior, interior, temp). */

import type { CSSProperties, MouseEvent, PointerEvent } from 'react';

export type CadDimMarkTone = 'overall' | 'segment' | 'interior' | 'manual' | 'temp' | 'locked';

const TONE: Record<
  CadDimMarkTone,
  { stroke: string; fill: string; text: string; lineW: number; tickW: number }
> = {
  overall: {
    stroke: '#334155',
    fill: 'rgba(255,255,255,0.96)',
    text: '#0f172a',
    lineW: 1.25,
    tickW: 1.35,
  },
  segment: {
    stroke: '#64748b',
    fill: 'rgba(255,255,255,0.94)',
    text: '#1e293b',
    lineW: 1.05,
    tickW: 1.15,
  },
  interior: {
    stroke: '#94a3b8',
    fill: 'rgba(255,255,255,0.9)',
    text: '#475569',
    lineW: 0.9,
    tickW: 1,
  },
  manual: {
    stroke: '#1f4e46',
    fill: 'rgba(255,255,255,0.96)',
    text: '#1f4e46',
    lineW: 1.3,
    tickW: 1.35,
  },
  temp: {
    stroke: '#1f4e46',
    fill: 'rgba(255,255,255,0.97)',
    text: '#1f4e46',
    lineW: 1.35,
    tickW: 1.4,
  },
  locked: {
    stroke: '#9a3412',
    fill: 'rgba(255,247,237,0.96)',
    text: '#9a3412',
    lineW: 1.25,
    tickW: 1.3,
  },
};

function unit(dx: number, dy: number): { ux: number; uy: number; len: number } {
  const len = Math.hypot(dx, dy) || 1;
  return { ux: dx / len, uy: dy / len, len };
}

/** Label chip width from text length (SVG units ≈ plan feet). */
export function dimLabelChipWidth(label: string, fontSize: number): number {
  const ch = fontSize * 0.48;
  return Math.max(fontSize * 2.4, label.length * ch + fontSize * 0.7);
}

/** Keep text readable (never upside-down). */
export function dimLabelAngleDeg(dx: number, dy: number): number {
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg > 90 || deg < -90) deg += 180;
  // Normalize to (-180, 180] then prefer (-90, 90]
  deg = ((deg + 180) % 360) - 180;
  if (deg > 90) deg -= 180;
  if (deg <= -90) deg += 180;
  return deg;
}

export type CadDimMarkProps = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  label: string;
  fontSize: number;
  tone: CadDimMarkTone;
  /** Feature endpoints for witness/extension lines (same SVG space). */
  wx1?: number;
  wy1?: number;
  wx2?: number;
  wy2?: number;
  className?: string;
  style?: CSSProperties;
  onPointerDown?: (ev: PointerEvent) => void;
  onDoubleClick?: (ev: MouseEvent) => void;
};

/**
 * Architectural dimension mark: witness lines, 45° ticks, gap for label, white chip.
 */
export function CadDimMark({
  x1,
  y1,
  x2,
  y2,
  labelX,
  labelY,
  label,
  fontSize,
  tone,
  wx1,
  wy1,
  wx2,
  wy2,
  className,
  style,
  onPointerDown,
  onDoubleClick,
}: CadDimMarkProps) {
  const c = TONE[tone];
  const { ux, uy, len } = unit(x2 - x1, y2 - y1);
  const tickLen = fontSize * (tone === 'interior' ? 0.42 : 0.52);
  // 45° oblique tick relative to dim axis (US drafting convention)
  const cos = Math.SQRT1_2;
  const sin = Math.SQRT1_2;
  const tx = (ux * cos - uy * sin) * tickLen;
  const ty = (ux * sin + uy * cos) * tickLen;

  const chipW = dimLabelChipWidth(label, fontSize);
  const chipH = fontSize * (tone === 'interior' ? 1.05 : 1.25);
  const textSize = fontSize * (tone === 'overall' || tone === 'temp' || tone === 'manual' ? 0.82 : tone === 'interior' ? 0.62 : 0.74);
  const angle = dimLabelAngleDeg(x2 - x1, y2 - y1);

  // Gap in dim line so the chip sits in the chain (not on top of it)
  const gapHalf = Math.min(len * 0.42, chipW / 2 + fontSize * 0.2);
  const useGap = len > chipW + fontSize * 1.2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const g1x = mx - ux * gapHalf;
  const g1y = my - uy * gapHalf;
  const g2x = mx + ux * gapHalf;
  const g2y = my + uy * gapHalf;

  // Witness overshoot past dim line
  const over = fontSize * 0.28;
  const hasW1 = wx1 != null && wy1 != null;
  const hasW2 = wx2 != null && wy2 != null;

  function witness(wx: number, wy: number, dx: number, dy: number) {
    const { ux: vx, uy: vy, len: wlen } = unit(dx - wx, dy - wy);
    if (wlen < 0.05) return null;
    // Small gap from feature so stroke does not collide with wall
    const gap = Math.min(fontSize * 0.22, wlen * 0.12);
    const sx = wx + vx * gap;
    const sy = wy + vy * gap;
    const ex = dx + vx * over;
    const ey = dy + vy * over;
    return (
      <line
        x1={sx}
        y1={sy}
        x2={ex}
        y2={ey}
        stroke={c.stroke}
        strokeWidth={c.lineW * 0.75}
        strokeOpacity={0.75}
        strokeLinecap="butt"
      />
    );
  }

  return (
    <g
      className={className}
      style={style}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {hasW1 ? witness(wx1!, wy1!, x1, y1) : null}
      {hasW2 ? witness(wx2!, wy2!, x2, y2) : null}

      {useGap ? (
        <>
          <line x1={x1} y1={y1} x2={g1x} y2={g1y} stroke={c.stroke} strokeWidth={c.lineW} strokeLinecap="butt" />
          <line x1={g2x} y1={g2y} x2={x2} y2={y2} stroke={c.stroke} strokeWidth={c.lineW} strokeLinecap="butt" />
        </>
      ) : (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.stroke} strokeWidth={c.lineW} strokeLinecap="butt" />
      )}

      <line
        x1={x1 - tx}
        y1={y1 - ty}
        x2={x1 + tx}
        y2={y1 + ty}
        stroke={c.stroke}
        strokeWidth={c.tickW}
        strokeLinecap="round"
      />
      <line
        x1={x2 - tx}
        y1={y2 - ty}
        x2={x2 + tx}
        y2={y2 + ty}
        stroke={c.stroke}
        strokeWidth={c.tickW}
        strokeLinecap="round"
      />

      <g transform={`translate(${labelX} ${labelY}) rotate(${angle})`}>
        <rect
          x={-chipW / 2}
          y={-chipH / 2}
          width={chipW}
          height={chipH}
          rx={fontSize * 0.12}
          fill={c.fill}
          stroke={tone === 'temp' || tone === 'manual' || tone === 'locked' ? c.stroke : 'rgba(15,23,42,0.1)'}
          strokeWidth={tone === 'temp' || tone === 'manual' || tone === 'locked' ? 1.05 : 0.7}
        />
        <text
          x={0}
          y={0}
          fill={c.text}
          fontSize={textSize}
          fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
          fontWeight={tone === 'temp' || tone === 'manual' || tone === 'overall' ? 650 : 575}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {label}
        </text>
      </g>
    </g>
  );
}
