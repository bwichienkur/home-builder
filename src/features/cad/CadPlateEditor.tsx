import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CadFixtureKind, CadPlate, CadSegmentRole } from '../../lib/cadStudio/types';
import {
  detectCadRoomStamps,
  formatDraftLength,
  formatRoomAreaSqFt,
} from '../../lib/cadStudio/cadRoomStamps';
import {
  addFixtureHint,
  addOpeningHint,
  addWallCenterline,
  deleteSelection,
  formatWallLengthFt,
  moveFixtureHint,
  moveLabel,
  moveOpeningHint,
  moveWallEndpoint,
  pickAtPoint,
  planToSvgFt,
  segLengthFt,
  svgToPlanFt,
  type CadEditTool,
  type CadPlateSelection,
} from '../../lib/cadStudio/editCadPlate';
import { visibleLabels, visibleSegments } from '../../lib/cadStudio/buildCadPlate';

const ROLE_STROKE: Record<CadSegmentRole, string> = {
  wall: '#1e293b',
  opening: '#b45309',
  fixture: '#0f766e',
  soft: '#475569',
  elevation: '#64748b',
  other: '#94a3b8',
};

const FIXTURE_COLOR: Record<CadFixtureKind, string> = {
  counter: '#b8956c',
  island: '#a16207',
  sink: '#0284c7',
  toilet: '#64748b',
  tub: '#94a3b8',
  appliance: '#475569',
  other: '#78716c',
};

const PAD = 2;

type Props = {
  plate: CadPlate;
  tool: CadEditTool;
  fixtureKind: CadFixtureKind;
  openingKind?: 'door' | 'window';
  wallLayer?: string;
  /** Window sill height in feet when placing windows. */
  windowSillFt?: number;
  selection: CadPlateSelection | null;
  onSelectionChange: (sel: CadPlateSelection | null) => void;
  onPlateChange: (plate: CadPlate) => void;
};

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const local = pt.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

export function CadPlateEditor({
  plate,
  tool,
  fixtureKind,
  openingKind = 'door',
  wallLayer = 'WALLS',
  windowSillFt = 3,
  selection,
  onSelectionChange,
  onPlateChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draftLine, setDraftLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  const dragRef = useRef<{
    selection: CadPlateSelection;
    startPlan: { x: number; y: number };
    orig: CadPlate;
  } | null>(null);

  const { w, h, ox, oy, stroke, fontSize } = useMemo(() => {
    const { minX, minY, maxX, maxY } = plate.bounds;
    const width = Math.max(maxX - minX, 1) + PAD * 2;
    const height = Math.max(maxY - minY, 1) + PAD * 2;
    return {
      w: width,
      h: height,
      ox: minX - PAD,
      oy: minY - PAD,
      stroke: Math.max(width, height) * 0.0012,
      fontSize: Math.max(0.7, Math.min(1.6, Math.max(width, height) * 0.012)),
    };
  }, [plate.bounds]);

  const segs = visibleSegments(plate);
  const labels = visibleLabels(plate);
  const roomStamps = useMemo(() => detectCadRoomStamps(plate), [plate]);

  const planFromEvent = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const svgPt = clientToSvg(svg, e.clientX, e.clientY);
      if (!svgPt) return null;
      return svgToPlanFt(svgPt.x, svgPt.y, plate.bounds, PAD);
    },
    [plate.bounds],
  );

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const plan = planFromEvent(e);
    if (!plan) return;
    svgRef.current?.setPointerCapture(e.pointerId);

    if (tool === 'delete') {
      const hit = pickAtPoint(plate, plan.x, plan.y);
      if (hit) {
        onPlateChange(deleteSelection(plate, hit));
        onSelectionChange(null);
      }
      return;
    }

    if (tool === 'wall' || tool === 'opening') {
      if (!draftLine) {
        setDraftLine({ x1: plan.x, y1: plan.y, x2: plan.x, y2: plan.y });
      } else {
        const { x1, y1 } = draftLine;
        if (Math.hypot(plan.x - x1, plan.y - y1) >= 0.5) {
          if (tool === 'wall') {
            onPlateChange(addWallCenterline(plate, x1, y1, plan.x, plan.y, wallLayer));
          } else {
            onPlateChange(
              addOpeningHint(
                plate,
                x1,
                y1,
                plan.x,
                plan.y,
                openingKind,
                openingKind === 'window' ? windowSillFt : 0,
              ),
            );
          }
        }
        setDraftLine(null);
      }
      return;
    }

    if (tool === 'fixture') {
      onPlateChange(addFixtureHint(plate, fixtureKind, plan.x, plan.y));
      return;
    }

    const hit = pickAtPoint(plate, plan.x, plan.y);
    onSelectionChange(hit);
    if (hit) {
      dragRef.current = { selection: hit, startPlan: plan, orig: plate };
    } else {
      dragRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const plan = planFromEvent(e);
    if (!plan) return;

    if (draftLine) {
      setDraftLine({ ...draftLine, x2: plan.x, y2: plan.y });
      return;
    }

    const drag = dragRef.current;
    if (!drag || tool !== 'select') return;
    const dx = plan.x - drag.startPlan.x;
    const dy = plan.y - drag.startPlan.y;
    const { selection: sel, orig } = drag;

    switch (sel.kind) {
      case 'label': {
        const l = orig.labels[sel.index];
        if (!l) break;
        onPlateChange(moveLabel(orig, sel.index, l.x + dx, l.y + dy));
        break;
      }
      case 'fixture': {
        const f = orig.fixtureHints[sel.index];
        if (!f) break;
        onPlateChange(moveFixtureHint(orig, sel.index, f.xFt + dx, f.yFt + dy));
        break;
      }
      case 'opening': {
        const o = orig.openingHints[sel.index];
        if (!o) break;
        onPlateChange(
          moveOpeningHint(orig, sel.index, (o.x1 + o.x2) / 2 + dx, (o.y1 + o.y2) / 2 + dy),
        );
        break;
      }
      case 'wall': {
        const w0 = orig.wallCenterlines[sel.index];
        if (!w0) break;
        const dStart = Math.hypot(drag.startPlan.x - w0.x1, drag.startPlan.y - w0.y1);
        const dEnd = Math.hypot(drag.startPlan.x - w0.x2, drag.startPlan.y - w0.y2);
        if (dStart <= dEnd) {
          onPlateChange(moveWallEndpoint(orig, sel.index, 'a', w0.x1 + dx, w0.y1 + dy));
        } else {
          onPlateChange(moveWallEndpoint(orig, sel.index, 'b', w0.x2 + dx, w0.y2 + dy));
        }
        break;
      }
      default:
        break;
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  // Escape cancels an in-progress wall/opening draft (Plan7-style).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDraftLine(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isSelected = (kind: CadPlateSelection['kind'], index: number) =>
    selection?.kind === kind && selection.index === index;

  return (
    <svg
      ref={svgRef}
      className="cad-plate-editor-svg"
      viewBox={`0 0 ${w.toFixed(3)} ${h.toFixed(3)}`}
      width="1400"
      height={Math.round((1400 * h) / w)}
      role="img"
      aria-label={`Editable floor plan: ${plate.sourceFileName}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <rect width="100%" height="100%" fill="#f1efe8" />
      <g transform={`translate(${(-ox).toFixed(3)} ${(h + oy).toFixed(3)}) scale(1,-1)`}>
        {segs
          .filter((s) => s.role !== 'wall')
          .map((s, i) => {
            const useDash =
              s.role === 'soft' || /DASH|HIDDEN|PHANTOM|DOT/i.test(s.linetype ?? '');
            return (
              <line
                key={`seg-${i}-${s.layer}`}
                x1={s.x1}
                y1={s.y1}
                x2={s.x2}
                y2={s.y2}
                stroke={ROLE_STROKE[s.role]}
                strokeWidth={stroke * (s.role === 'fixture' ? 0.85 : 1)}
                strokeOpacity={s.role === 'other' ? 0.35 : 0.85}
                strokeDasharray={useDash ? '0.35 0.28' : undefined}
                strokeLinecap="round"
              />
            );
          })}

        {plate.wallCenterlines.map((wall, i) => {
          const selected = isSelected('wall', i);
          const len = formatWallLengthFt(segLengthFt(wall));
          const mid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
          return (
            <g key={`wall-${i}`}>
              <line
                x1={wall.x1}
                y1={wall.y1}
                x2={wall.x2}
                y2={wall.y2}
                stroke={selected ? '#1f4e46' : '#1e293b'}
                strokeWidth={stroke * (selected ? 3.5 : 2)}
                strokeOpacity={0.95}
                strokeLinecap="round"
              />
              {selected && (
                <>
                  <circle cx={wall.x1} cy={wall.y1} r={stroke * 8} fill="#1f4e46" />
                  <circle cx={wall.x2} cy={wall.y2} r={stroke * 8} fill="#1f4e46" />
                  <text
                    x={mid.x}
                    y={mid.y + fontSize * 0.4}
                    fill="#1f4e46"
                    fontSize={fontSize * 0.85}
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {len}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {plate.openingHints.map((o, i) => {
          const selected = isSelected('opening', i);
          return (
            <g key={`open-${i}`}>
              <line
                x1={o.x1}
                y1={o.y1}
                x2={o.x2}
                y2={o.y2}
                stroke={selected ? '#c2410c' : '#b45309'}
                strokeWidth={stroke * (selected ? 3 : 2.2)}
                strokeLinecap="round"
              />
              <circle
                cx={(o.x1 + o.x2) / 2}
                cy={(o.y1 + o.y2) / 2}
                r={stroke * 6}
                fill={selected ? '#c2410c' : '#b45309'}
                fillOpacity={0.35}
              />
            </g>
          );
        })}

        {plate.fixtureHints.map((f, i) => {
          const selected = isSelected('fixture', i);
          const kind = f.kind ?? 'other';
          const hw = (f.widthFt ?? 2) / 2;
          const hd = (f.depthFt ?? 2) / 2;
          return (
            <rect
              key={`fix-${i}`}
              x={f.xFt - hw}
              y={f.yFt - hd}
              width={hw * 2}
              height={hd * 2}
              fill={FIXTURE_COLOR[kind]}
              fillOpacity={selected ? 0.75 : 0.45}
              stroke={selected ? '#1f4e46' : FIXTURE_COLOR[kind]}
              strokeWidth={stroke * (selected ? 2.5 : 1.2)}
              rx={stroke * 2}
            />
          );
        })}

        {draftLine && (
          <line
            x1={draftLine.x1}
            y1={draftLine.y1}
            x2={draftLine.x2}
            y2={draftLine.y2}
            stroke="#1f4e46"
            strokeWidth={stroke * 2.5}
            strokeDasharray="0.4 0.3"
            strokeLinecap="round"
          />
        )}
      </g>

      {roomStamps.map((room) => {
        const sp = planToSvgFt(room.x, room.y, plate.bounds, PAD);
        return (
          <g key={room.id} className="cad-room-stamp">
            <text
              x={sp.x}
              y={sp.y - fontSize * 0.55}
              fill="#0f172a"
              fontSize={fontSize * 0.95}
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontWeight={650}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {room.name}
            </text>
            <text
              x={sp.x}
              y={sp.y + fontSize * 0.55}
              fill="#5b6b7c"
              fontSize={fontSize * 0.78}
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontWeight={500}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {formatRoomAreaSqFt(room.areaSqFt)}
            </text>
          </g>
        );
      })}

      {draftLine &&
        (() => {
          const len = formatDraftLength(draftLine);
          const mid = planToSvgFt(
            (draftLine.x1 + draftLine.x2) / 2,
            (draftLine.y1 + draftLine.y2) / 2,
            plate.bounds,
            PAD,
          );
          return (
            <g className="cad-draft-dim">
              <rect
                x={mid.x - fontSize * 2.2}
                y={mid.y - fontSize * 0.95}
                width={fontSize * 4.4}
                height={fontSize * 1.5}
                rx={fontSize * 0.25}
                fill="rgba(255,255,255,0.92)"
                stroke="#1f4e46"
                strokeWidth={0.8}
              />
              <text
                x={mid.x}
                y={mid.y}
                fill="#1f4e46"
                fontSize={fontSize * 0.9}
                fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {len}
              </text>
            </g>
          );
        })()}

      {labels.map((label, i) => {
        // Skip labels that already appear as room stamps (same text near stamp).
        const covered = roomStamps.some(
          (r) => r.name === label.text && Math.hypot(r.x - label.x, r.y - label.y) < 6,
        );
        if (covered) return null;
        const sp = planToSvgFt(label.x, label.y, plate.bounds, PAD);
        const selected = isSelected('label', i);
        return (
          <text
            key={`lbl-${i}`}
            x={sp.x}
            y={sp.y}
            fill={selected ? '#1f4e46' : '#0f172a'}
            fontSize={fontSize}
            fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
            fontWeight={selected ? 700 : 600}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {label.text}
          </text>
        );
      })}
    </svg>
  );
}
