import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CadFixtureKind, CadPlate, CadSegmentRole, CadSlabKind } from '../../lib/cadStudio/types';
import {
  detectCadRoomStamps,
  formatDraftLength,
  formatRoomAreaSqFt,
} from '../../lib/cadStudio/cadRoomStamps';
import { computeExteriorDims, computeInteriorDims } from '../../lib/cadStudio/cadExteriorDims';
import { snapCadDraftPoint, type CadSnapResult } from '../../lib/cadStudio/cadDrawSnap';
import {
  addDormer,
  addFixtureHint,
  addGuideline,
  addOpeningHint,
  addSectionCut,
  addSlab,
  addStair,
  addWallCenterline,
  deleteSelection,
  formatWallLengthFt,
  moveFixtureHint,
  moveLabel,
  moveOpeningHint,
  moveSlab,
  moveWallEndpoint,
  pickAtPoint,
  planToSvgFt,
  segLengthFt,
  svgToPlanFt,
  updateStair,
  type CadEditTool,
  type CadPlateSelection,
} from '../../lib/cadStudio/editCadPlate';
import { wallStrokeForMaterial } from '../../lib/cadStudio/cadSceneMaterials';
import { visibleLabels, visibleSegments } from '../../lib/cadStudio/buildCadPlate';
import type { CadStairFt } from '../../lib/cadStudio/types';

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

const SLAB_FILL: Record<CadSlabKind, string> = {
  terrace: '#c4a574',
  driveway: '#8a8f98',
  garden: '#6b8f71',
  balcony: '#b7a99a',
  footing: '#78716c',
  foundation: '#a8a29e',
  plot: '#0f766e',
};

const ROOM_FILL_PALETTE = [
  '#93c5fd',
  '#a7f3d0',
  '#fde68a',
  '#fbcfe8',
  '#c4b5fd',
  '#fdba74',
  '#99f6e4',
  '#ddd6fe',
];

/** Extra pad so exterior dim chains fit in the viewBox. */
const PAD = 8;
const SLAB_CLOSE_TOL_FT = 1.25;

type Props = {
  plate: CadPlate;
  tool: CadEditTool;
  fixtureKind: CadFixtureKind;
  openingKind?: 'door' | 'window' | 'passage' | 'garage';
  wallLayer?: string;
  /** Window sill height in feet when placing windows. */
  windowSillFt?: number;
  slabKind?: CadSlabKind;
  showExteriorDims?: boolean;
  snapOn?: boolean;
  showInteriorDims?: boolean;
  showRoomFills?: boolean;
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

function polyPointsAttr(pts: Array<{ x: number; y: number }>): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

/** Plan-space corners + tread lines for a stair (local origin at bottom-left). */
function stairPlanGeom(st: CadStairFt) {
  const rad = (st.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const toWorld = (lx: number, ly: number) => ({
    x: st.xFt + lx * cos - ly * sin,
    y: st.yFt + lx * sin + ly * cos,
  });
  const corners = [
    toWorld(0, 0),
    toWorld(st.runFt, 0),
    toWorld(st.runFt, st.widthFt),
    toWorld(0, st.widthFt),
  ];
  const treads: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
  const steps = Math.max(2, st.steps);
  for (let i = 1; i < steps; i++) {
    const t = (i / steps) * st.runFt;
    treads.push([toWorld(t, 0), toWorld(t, st.widthFt)]);
  }
  return { corners, treads };
}

export function CadPlateEditor({
  plate,
  tool,
  fixtureKind,
  openingKind = 'door',
  wallLayer = 'WALLS',
  windowSillFt = 3,
  slabKind = 'terrace',
  showExteriorDims = true,
  snapOn = true,
  showInteriorDims = false,
  showRoomFills = true,
  selection,
  onSelectionChange,
  onPlateChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draftLine, setDraftLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  const [draftPoly, setDraftPoly] = useState<Array<{ x: number; y: number }>>([]);
  const [cursorPlan, setCursorPlan] = useState<{ x: number; y: number } | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [lastSnap, setLastSnap] = useState<CadSnapResult | null>(null);
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
  const exteriorDims = useMemo(
    () => (showExteriorDims ? computeExteriorDims(plate) : []),
    [plate, showExteriorDims],
  );
  const interiorDims = useMemo(
    () => (showInteriorDims ? computeInteriorDims(plate) : []),
    [plate, showInteriorDims],
  );
  const slabs = plate.slabs ?? [];
  const guidelines = plate.guidelines ?? [];

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

  const snapPlan = useCallback(
    (plan: { x: number; y: number }, from?: { x: number; y: number } | null): CadSnapResult => {
      const snapped = snapCadDraftPoint(plate, plan.x, plan.y, {
        enabled: snapOn,
        ortho: shiftHeld,
        from: from ?? null,
      });
      setLastSnap(snapped);
      return snapped;
    },
    [plate, snapOn, shiftHeld],
  );

  const closeDraftPoly = useCallback(() => {
    if (draftPoly.length >= 3) {
      onPlateChange(addSlab(plate, slabKind, draftPoly));
    }
    setDraftPoly([]);
    setCursorPlan(null);
    setLastSnap(null);
  }, [draftPoly, onPlateChange, plate, slabKind]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const raw = planFromEvent(e);
    if (!raw) return;
    svgRef.current?.setPointerCapture(e.pointerId);

    if (tool === 'delete') {
      const hit = pickAtPoint(plate, raw.x, raw.y);
      if (hit) {
        onPlateChange(deleteSelection(plate, hit));
        onSelectionChange(null);
      }
      return;
    }

    if (tool === 'slab') {
      const from = draftPoly.length ? draftPoly[draftPoly.length - 1]! : null;
      const plan = snapPlan(raw, from);
      if (draftPoly.length >= 3) {
        const first = draftPoly[0]!;
        if (Math.hypot(plan.x - first.x, plan.y - first.y) <= SLAB_CLOSE_TOL_FT) {
          closeDraftPoly();
          return;
        }
      }
      setDraftPoly((prev) => [...prev, { x: plan.x, y: plan.y }]);
      setCursorPlan({ x: plan.x, y: plan.y });
      return;
    }

    if (tool === 'wall' || tool === 'opening' || tool === 'guide' || tool === 'section') {
      if (!draftLine) {
        const plan = snapPlan(raw);
        setDraftLine({ x1: plan.x, y1: plan.y, x2: plan.x, y2: plan.y });
      } else {
        const { x1, y1 } = draftLine;
        const plan = snapPlan(raw, { x: x1, y: y1 });
        if (Math.hypot(plan.x - x1, plan.y - y1) >= 0.5) {
          if (tool === 'wall') {
            onPlateChange(addWallCenterline(plate, x1, y1, plan.x, plan.y, wallLayer));
          } else if (tool === 'guide') {
            onPlateChange(addGuideline(plate, x1, y1, plan.x, plan.y));
          } else if (tool === 'section') {
            onPlateChange(addSectionCut(plate, x1, y1, plan.x, plan.y));
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
        setLastSnap(null);
      }
      return;
    }

    if (tool === 'fixture') {
      onPlateChange(addFixtureHint(plate, fixtureKind, raw.x, raw.y));
      return;
    }

    if (tool === 'stair') {
      const plan = snapPlan(raw);
      onPlateChange(addStair(plate, plan.x, plan.y));
      return;
    }

    if (tool === 'dormer') {
      const plan = snapPlan(raw);
      onPlateChange(addDormer(plate, plan.x, plan.y));
      return;
    }

    const hit = pickAtPoint(plate, raw.x, raw.y);
    onSelectionChange(hit);
    if (hit) {
      dragRef.current = { selection: hit, startPlan: raw, orig: plate };
    } else {
      dragRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const raw = planFromEvent(e);
    if (!raw) return;

    if (tool === 'slab' && draftPoly.length) {
      const from = draftPoly[draftPoly.length - 1]!;
      const plan = snapPlan(raw, from);
      setCursorPlan({ x: plan.x, y: plan.y });
      return;
    }

    if (draftLine && (tool === 'wall' || tool === 'opening' || tool === 'guide' || tool === 'section')) {
      const plan = snapPlan(raw, { x: draftLine.x1, y: draftLine.y1 });
      setDraftLine({ ...draftLine, x2: plan.x, y2: plan.y });
      setCursorPlan({ x: plan.x, y: plan.y });
      return;
    }

    if (draftLine) {
      setDraftLine({ ...draftLine, x2: raw.x, y2: raw.y });
      return;
    }

    const drag = dragRef.current;
    if (!drag || tool !== 'select') return;
    const dx = raw.x - drag.startPlan.x;
    const dy = raw.y - drag.startPlan.y;
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
      case 'slab': {
        onPlateChange(moveSlab(orig, sel.index, dx, dy));
        break;
      }
      case 'stair': {
        const st = orig.stairs?.[sel.index];
        if (!st) break;
        onPlateChange(updateStair(orig, sel.index, { xFt: st.xFt + dx, yFt: st.yFt + dy }));
        break;
      }
      default:
        break;
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool !== 'slab' || draftPoly.length < 3) return;
    e.preventDefault();
    closeDraftPoly();
  };

  // Escape cancels drafts; Enter closes slab polygon (Plan7-style).
  // Track Shift for ortho snap.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true);
      if (e.key === 'Escape') {
        setDraftLine(null);
        setDraftPoly([]);
        setCursorPlan(null);
        setLastSnap(null);
      }
      if (e.key === 'Enter' && tool === 'slab' && draftPoly.length >= 3) {
        e.preventDefault();
        closeDraftPoly();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [closeDraftPoly, draftPoly.length, tool]);

  useEffect(() => {
    if (tool !== 'slab') {
      setDraftPoly([]);
      setCursorPlan(null);
    }
    if (tool !== 'wall' && tool !== 'opening' && tool !== 'guide' && tool !== 'section') {
      setDraftLine(null);
      setLastSnap(null);
    }
  }, [tool]);

  const isSelected = (kind: CadPlateSelection['kind'], index: number) =>
    selection?.kind === kind && selection.index === index;

  const draftPolyPreview =
    draftPoly.length && cursorPlan ? [...draftPoly, cursorPlan] : draftPoly;
  const showSnapMarker =
    Boolean(draftLine || draftPoly.length) &&
    cursorPlan &&
    (lastSnap?.kind === 'endpoint' || lastSnap?.kind === 'guide');

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
      onDoubleClick={handleDoubleClick}
    >
      <rect width="100%" height="100%" fill="#f1efe8" />
      <g transform={`translate(${(-ox).toFixed(3)} ${(h + oy).toFixed(3)}) scale(1,-1)`}>
        {slabs.map((slab, i) => {
          const selected = isSelected('slab', i);
          const isPlot = slab.kind === 'plot';
          return (
            <polygon
              key={slab.id}
              points={polyPointsAttr(slab.points)}
              fill={isPlot ? 'none' : SLAB_FILL[slab.kind]}
              fillOpacity={isPlot ? 0 : selected ? 0.55 : 0.32}
              stroke={selected ? '#1f4e46' : SLAB_FILL[slab.kind]}
              strokeWidth={stroke * (selected ? 2.8 : isPlot ? 2.2 : 1.4)}
              strokeDasharray={isPlot ? '0.5 0.35' : undefined}
              strokeLinejoin="round"
            />
          );
        })}

        {showRoomFills &&
          roomStamps.map((room, i) =>
            room.points.length >= 3 ? (
              <polygon
                key={`fill-${room.id}`}
                points={polyPointsAttr(room.points)}
                fill={ROOM_FILL_PALETTE[i % ROOM_FILL_PALETTE.length]}
                fillOpacity={0.18}
                stroke="none"
              />
            ) : null,
          )}

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
          const wallStroke = selected
            ? '#1f4e46'
            : wallStrokeForMaterial(wall.materialId, wall.exterior);
          return (
            <g key={`wall-${i}`}>
              <line
                x1={wall.x1}
                y1={wall.y1}
                x2={wall.x2}
                y2={wall.y2}
                stroke={wallStroke}
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

        {guidelines.map((g, gi) => (
          <line
            key={g.id}
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            stroke={gi % 2 === 0 ? '#c026d3' : '#0d9488'}
            strokeWidth={stroke * 1.1}
            strokeDasharray="0.55 0.35"
            strokeOpacity={0.85}
            strokeLinecap="round"
          />
        ))}

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

        {(plate.stairs ?? []).map((st, i) => {
          const selected = isSelected('stair', i);
          const { corners, treads } = stairPlanGeom(st);
          return (
            <g key={st.id}>
              <polygon
                points={polyPointsAttr(corners)}
                fill={selected ? '#1f4e46' : '#64748b'}
                fillOpacity={selected ? 0.28 : 0.14}
                stroke={selected ? '#1f4e46' : '#475569'}
                strokeWidth={stroke * (selected ? 2.6 : 1.6)}
                strokeLinejoin="round"
              />
              {treads.map(([a, b], ti) => (
                <line
                  key={`tread-${st.id}-${ti}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={selected ? '#1f4e46' : '#64748b'}
                  strokeWidth={stroke * 0.9}
                  strokeOpacity={0.75}
                  strokeLinecap="round"
                />
              ))}
            </g>
          );
        })}

        {(plate.dormers ?? []).map((d, i) => {
          const selected = isSelected('dormer', i);
          const hw = d.widthFt / 2;
          const hd = d.depthFt / 2;
          return (
            <g key={d.id}>
              <rect
                x={d.xFt - hw}
                y={d.yFt - hd}
                width={d.widthFt}
                height={d.depthFt}
                fill={selected ? '#0f766e' : '#14b8a6'}
                fillOpacity={0.25}
                stroke={selected ? '#134e4a' : '#0f766e'}
                strokeWidth={stroke * (selected ? 2.4 : 1.5)}
              />
              <text
                x={d.xFt}
                y={d.yFt}
                fill="#134e4a"
                fontSize={Math.max(0.9, stroke * 8)}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ pointerEvents: 'none' }}
              >
                DORMER
              </text>
            </g>
          );
        })}

        {(plate.sectionCuts ?? []).map((c, i) => {
          const selected = isSelected('section', i);
          return (
            <g key={c.id}>
              <line
                x1={c.x1}
                y1={c.y1}
                x2={c.x2}
                y2={c.y2}
                stroke={selected ? '#b91c1c' : '#dc2626'}
                strokeWidth={stroke * (selected ? 3 : 2)}
                strokeDasharray="0.6 0.35"
                strokeLinecap="round"
              />
              <circle cx={c.x1} cy={c.y1} r={stroke * 3} fill="#dc2626" />
              <circle cx={c.x2} cy={c.y2} r={stroke * 3} fill="#dc2626" />
            </g>
          );
        })}

        {draftLine && (
          <line
            x1={draftLine.x1}
            y1={draftLine.y1}
            x2={draftLine.x2}
            y2={draftLine.y2}
            stroke={tool === 'guide' ? '#0d9488' : tool === 'section' ? '#dc2626' : '#1f4e46'}
            strokeWidth={stroke * 2.5}
            strokeDasharray="0.4 0.3"
            strokeLinecap="round"
          />
        )}

        {draftPolyPreview.length >= 2 && (
          <polyline
            points={polyPointsAttr(draftPolyPreview)}
            fill="none"
            stroke="#1f4e46"
            strokeWidth={stroke * 2.2}
            strokeDasharray="0.45 0.3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {draftPoly.map((p, i) => (
          <circle
            key={`dp-${i}`}
            cx={p.x}
            cy={p.y}
            r={stroke * (i === 0 ? 7 : 5)}
            fill={i === 0 ? '#1f4e46' : '#5b6b7c'}
            fillOpacity={0.85}
          />
        ))}

        {showSnapMarker && cursorPlan && (
          <circle
            cx={cursorPlan.x}
            cy={cursorPlan.y}
            r={stroke * 6}
            fill="none"
            stroke={lastSnap?.kind === 'guide' ? '#0d9488' : '#c026d3'}
            strokeWidth={stroke * 1.8}
          />
        )}
      </g>

      {exteriorDims.map((dim) => {
        const a = planToSvgFt(dim.x1, dim.y1, plate.bounds, PAD);
        const b = planToSvgFt(dim.x2, dim.y2, plate.bounds, PAD);
        const lp = planToSvgFt(dim.labelX, dim.labelY, plate.bounds, PAD);
        const tick = fontSize * 0.45;
        return (
          <g key={dim.id} className="cad-ext-dim">
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#5b6b7c"
              strokeWidth={1.1}
            />
            <line x1={a.x - tick} y1={a.y - tick} x2={a.x + tick} y2={a.y + tick} stroke="#5b6b7c" strokeWidth={1} />
            <line x1={b.x - tick} y1={b.y - tick} x2={b.x + tick} y2={b.y + tick} stroke="#5b6b7c" strokeWidth={1} />
            <rect
              x={lp.x - fontSize * 2.1}
              y={lp.y - fontSize * 0.7}
              width={fontSize * 4.2}
              height={fontSize * 1.35}
              rx={fontSize * 0.2}
              fill="rgba(241,239,232,0.92)"
            />
            <text
              x={lp.x}
              y={lp.y}
              fill="#334155"
              fontSize={fontSize * 0.78}
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontWeight={600}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {dim.label}
            </text>
          </g>
        );
      })}

      {interiorDims.map((dim) => {
        const a = planToSvgFt(dim.x1, dim.y1, plate.bounds, PAD);
        const b = planToSvgFt(dim.x2, dim.y2, plate.bounds, PAD);
        const lp = planToSvgFt(dim.labelX, dim.labelY, plate.bounds, PAD);
        const tick = fontSize * 0.35;
        return (
          <g key={dim.id} className="cad-int-dim">
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#94a3b8"
              strokeWidth={0.9}
            />
            <line x1={a.x - tick} y1={a.y - tick} x2={a.x + tick} y2={a.y + tick} stroke="#94a3b8" strokeWidth={0.85} />
            <line x1={b.x - tick} y1={b.y - tick} x2={b.x + tick} y2={b.y + tick} stroke="#94a3b8" strokeWidth={0.85} />
            <rect
              x={lp.x - fontSize * 1.85}
              y={lp.y - fontSize * 0.55}
              width={fontSize * 3.7}
              height={fontSize * 1.1}
              rx={fontSize * 0.15}
              fill="rgba(241,239,232,0.88)"
            />
            <text
              x={lp.x}
              y={lp.y}
              fill="#64748b"
              fontSize={fontSize * 0.65}
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontWeight={500}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {dim.label}
            </text>
          </g>
        );
      })}

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
