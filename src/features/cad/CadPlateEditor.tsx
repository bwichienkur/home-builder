import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CadFixtureKind, CadPlate, CadSegmentRole, CadSlabKind } from '../../lib/cadStudio/types';
import {
  detectCadRoomStamps,
  formatDraftLength,
  formatRoomAreaSqFt,
} from '../../lib/cadStudio/cadRoomStamps';
import { computeExteriorDims, computeInteriorDims } from '../../lib/cadStudio/cadExteriorDims';
import {
  applyTempDimEdit,
  applyAssociativeExteriorDim,
  buildBetweenWallDim,
  buildTempDimsForSelection,
  type CadTempDim,
} from '../../lib/cadStudio/cadDimEdit';
import { buildBetweenOpeningsDim } from '../../lib/cadStudio/cadOpeningEdit';
import { snapCadDraftPoint, type CadSnapResult } from '../../lib/cadStudio/cadDrawSnap';
import { parseArchitecturalLength } from '../../lib/cadStudio/cadLengthParse';
import { isLayerOn } from '../../lib/cadStudio/cadLayerVisibility';
import {
  autoJoinWallEndpoints,
  breakWallAt,
  extendWallTo,
  moveWall,
  moveWalls,
  offsetWall,
  placeHostedOpening,
  trimWallTo,
} from '../../lib/cadStudio/cadWallModify';
import { stretchSharedNode } from '../../lib/cadStudio/cadWallGraph';
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
  nearestWallHost,
  pickAtPoint,
  planToSvgFt,
  segLengthFt,
  svgToPlanFt,
  updateStair,
  type CadEditTool,
  type CadGripKind,
  type CadPlateSelection,
} from '../../lib/cadStudio/editCadPlate';
import { wallStrokeForMaterial } from '../../lib/cadStudio/cadSceneMaterials';
import { visibleLabels, visibleSegments } from '../../lib/cadStudio/buildCadPlate';
import type { CadStairFt } from '../../lib/cadStudio/types';
import { CadDimMark } from './cadDimSvg';

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
const PAD = 10;
const SLAB_CLOSE_TOL_FT = 1.25;
const GRIP_HIT_FT = 1.2;
const OPENING_HOST_TOL_FT = 2.5;

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
  /** Drafting paper grid (1' minor / 4' major), Plan7-style. */
  showGrid?: boolean;
  selection: CadPlateSelection | null;
  onSelectionChange: (sel: CadPlateSelection | null) => void;
  /** Discrete edits (draw complete, trim, delete, etc.) — pushes undo history. */
  onPlateChange: (plate: CadPlate) => void;
  /** Live grip/move updates — replaces present without pushing history. */
  onPlatePreview?: (plate: CadPlate) => void;
  /** End of a drag gesture — one history entry for the whole move. */
  onPlateCommit?: (plate: CadPlate) => void;
  /** Extra wall indices selected with Shift+click (primary is `selection`). */
  wallMulti?: number[];
  onWallMultiChange?: (indices: number[]) => void;
  onStatus?: (msg: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** @deprecated Prefer click-to-edit on temporary dims; kept for Properties focus. */
  onRequestWallLengthEdit?: (index: number) => void;
  onPromoteTempDim?: (dim: CadTempDim) => void;
  onAssociativeExteriorDimEdit?: (dimId: string, valueFt: number) => void;
  openingMulti?: number[];
  onOpeningMultiChange?: (indices: number[]) => void;
};

function hitWallGrip(
  wall: { x1: number; y1: number; x2: number; y2: number },
  px: number,
  py: number,
  tolFt = GRIP_HIT_FT,
): CadGripKind | null {
  const mid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
  const dStart = Math.hypot(px - wall.x1, py - wall.y1);
  const dEnd = Math.hypot(px - wall.x2, py - wall.y2);
  const dMid = Math.hypot(px - mid.x, py - mid.y);
  const best = Math.min(dStart, dEnd, dMid);
  if (best > tolFt) return null;
  if (best === dStart) return 'start';
  if (best === dEnd) return 'end';
  return 'mid';
}

function defaultOpeningWidthFt(kind: 'door' | 'window' | 'passage' | 'garage'): number {
  if (kind === 'window') return 4;
  if (kind === 'garage') return 16;
  if (kind === 'passage') return 3;
  return 3;
}

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
  showGrid = true,
  selection,
  onSelectionChange,
  onPlateChange,
  onPlatePreview,
  onPlateCommit,
  wallMulti = [],
  onWallMultiChange,
  onStatus,
  onUndo,
  onRedo,
  onRequestWallLengthEdit,
  onPromoteTempDim,
  onAssociativeExteriorDimEdit,
  openingMulti = [],
  onOpeningMultiChange,
}: Props) {
  const gridId = useId().replace(/:/g, '');
  const gridMinorId = `cad-grid-minor-${gridId}`;
  const gridMajorId = `cad-grid-major-${gridId}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lengthInputRef = useRef<HTMLInputElement>(null);
  const tempDimInputRef = useRef<HTMLInputElement>(null);
  const [draftLine, setDraftLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  const [draftPoly, setDraftPoly] = useState<Array<{ x: number; y: number }>>([]);
  const [cursorPlan, setCursorPlan] = useState<{ x: number; y: number } | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [lastSnap, setLastSnap] = useState<CadSnapResult | null>(null);
  const [cutterWallIndex, setCutterWallIndex] = useState<number | null>(null);
  const [lengthHud, setLengthHud] = useState<{
    value: string;
    left: number;
    top: number;
  } | null>(null);
  const [tempDimHud, setTempDimHud] = useState<{
    dim: CadTempDim;
    value: string;
    left: number;
    top: number;
    associativeId?: string;
  } | null>(null);
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastPreviewRef = useRef<CadPlate | null>(null);
  const dragRef = useRef<{
    kind: 'grip' | 'selection';
    grip?: CadGripKind;
    wallIndex?: number;
    selection: CadPlateSelection;
    startPlan: { x: number; y: number };
    orig: CadPlate;
    multi: number[];
    moved: boolean;
  } | null>(null);

  const emitPreview = useCallback(
    (next: CadPlate) => {
      lastPreviewRef.current = next;
      if (onPlatePreview) onPlatePreview(next);
      else onPlateChange(next);
    },
    [onPlateChange, onPlatePreview],
  );

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
  const tempDims = useMemo(() => {
    if (!selection) return [] as CadTempDim[];
    if (selection.kind === 'wall') {
      const dims = buildTempDimsForSelection(plate, { kind: 'wall', index: selection.index });
      const other = wallMulti.find((i) => i !== selection.index);
      if (other != null) {
        const between = buildBetweenWallDim(plate, selection.index, other);
        if (between) dims.push(between);
      }
      return dims;
    }
    if (selection.kind === 'opening') {
      const dims = buildTempDimsForSelection(plate, { kind: 'opening', index: selection.index });
      const other = openingMulti.find((i) => i !== selection.index);
      if (other != null) {
        const between = buildBetweenOpeningsDim(plate, selection.index, other);
        if (between) {
          dims.push({
            id: between.id,
            kind: 'between-openings',
            openingIndexA: between.openingIndexA,
            openingIndexB: between.openingIndexB,
            x1: between.x1,
            y1: between.y1,
            x2: between.x2,
            y2: between.y2,
            valueFt: between.valueFt,
            label: between.label,
          });
        }
      }
      return dims;
    }
    return [];
  }, [plate, selection, wallMulti, openingMulti]);
  const slabs = plate.slabs ?? [];
  const guidelines = plate.guidelines ?? [];
  const underlay = plate.underlay;

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

  const commitDraftLine = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      if (Math.hypot(x2 - x1, y2 - y1) < 0.5) return;
      if (tool === 'wall') {
        let next = addWallCenterline(plate, x1, y1, x2, y2, wallLayer);
        const last = next.wallCenterlines.length - 1;
        next = autoJoinWallEndpoints(next, last);
        onPlateChange(next);
      } else if (tool === 'guide') {
        onPlateChange(addGuideline(plate, x1, y1, x2, y2));
      } else if (tool === 'section') {
        onPlateChange(addSectionCut(plate, x1, y1, x2, y2));
      } else if (tool === 'opening') {
        onPlateChange(
          addOpeningHint(
            plate,
            x1,
            y1,
            x2,
            y2,
            openingKind,
            openingKind === 'window' ? windowSillFt : 0,
          ),
        );
      }
    },
    [onPlateChange, openingKind, plate, tool, wallLayer, windowSillFt],
  );

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
        onWallMultiChange?.([]);
      }
      return;
    }

    if (tool === 'trim' || tool === 'extend') {
      const hit = pickAtPoint(plate, raw.x, raw.y);
      if (!hit || hit.kind !== 'wall') {
        onStatus?.(
          tool === 'trim'
            ? 'Trim: click a wall (cutter first, then wall to shorten)'
            : 'Extend: click a wall (boundary first, then wall to lengthen)',
        );
        return;
      }
      if (cutterWallIndex == null) {
        setCutterWallIndex(hit.index);
        onSelectionChange(hit);
        onStatus?.(
          tool === 'trim'
            ? 'Trim: now click the wall to shorten'
            : 'Extend: now click the wall to lengthen',
        );
        return;
      }
      if (hit.index === cutterWallIndex) {
        onStatus?.('Pick a different wall for the second click');
        return;
      }
      const next =
        tool === 'trim'
          ? trimWallTo(plate, hit.index, cutterWallIndex)
          : extendWallTo(plate, hit.index, cutterWallIndex);
      onPlateChange(next);
      setCutterWallIndex(null);
      onSelectionChange({ kind: 'wall', index: hit.index });
      onStatus?.(tool === 'trim' ? 'Trim applied' : 'Extend applied');
      return;
    }

    if (tool === 'break') {
      const hit = pickAtPoint(plate, raw.x, raw.y);
      if (!hit || hit.kind !== 'wall') {
        onStatus?.('Break: click a wall at the split point');
        return;
      }
      onPlateChange(breakWallAt(plate, hit.index, raw.x, raw.y));
      onSelectionChange(null);
      onStatus?.('Wall broken');
      return;
    }

    if (tool === 'offset') {
      const hit = pickAtPoint(plate, raw.x, raw.y);
      if (!hit || hit.kind !== 'wall') {
        onStatus?.('Offset: click a wall (default 1 ft)');
        return;
      }
      onPlateChange(offsetWall(plate, hit.index, 1));
      onSelectionChange({ kind: 'wall', index: plate.wallCenterlines.length });
      onStatus?.('Wall offset 1 ft');
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

    if (tool === 'opening' && !draftLine) {
      const host = nearestWallHost(plate, raw.x, raw.y, OPENING_HOST_TOL_FT);
      if (host) {
        const width = defaultOpeningWidthFt(openingKind);
        onPlateChange(
          placeHostedOpening(
            plate,
            host.wallIndex,
            host.t,
            width,
            openingKind,
            openingKind === 'window' ? windowSillFt : 0,
          ),
        );
        onSelectionChange({ kind: 'opening', index: plate.openingHints.length });
        onStatus?.(`Placed ${openingKind} (${width}' wide)`);
        return;
      }
      // Fallback: two-click line when no host nearby
      const plan = snapPlan(raw);
      setDraftLine({ x1: plan.x, y1: plan.y, x2: plan.x, y2: plan.y });
      onStatus?.('No wall nearby — click second point for free opening span');
      return;
    }

    if (tool === 'wall' || tool === 'opening' || tool === 'guide' || tool === 'section') {
      if (!draftLine) {
        const plan = snapPlan(raw);
        setDraftLine({ x1: plan.x, y1: plan.y, x2: plan.x, y2: plan.y });
      } else {
        const { x1, y1 } = draftLine;
        const plan = snapPlan(raw, { x: x1, y: y1 });
        commitDraftLine(x1, y1, plan.x, plan.y);
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

    // Select / move — prefer grips on current wall selection
    if (selection?.kind === 'wall') {
      const wall = plate.wallCenterlines[selection.index];
      if (wall && isLayerOn(plate, wall.layer)) {
        const grip = hitWallGrip(wall, raw.x, raw.y);
        if (grip) {
          onSelectionChange(selection);
          dragRef.current = {
            kind: 'grip',
            grip,
            wallIndex: selection.index,
            selection,
            startPlan: raw,
            orig: plate,
            multi: wallMulti,
            moved: false,
          };
          lastPreviewRef.current = null;
          return;
        }
      }
    }

    const hit = pickAtPoint(plate, raw.x, raw.y);
    if (hit?.kind === 'wall' && (e.shiftKey || shiftHeld)) {
      const primary = hit.index;
      onSelectionChange(hit);
      const prevPrimary =
        selection?.kind === 'wall' && selection.index !== primary ? selection.index : null;
      let others = wallMulti.filter((i) => i !== primary);
      if (wallMulti.includes(primary)) {
        others = wallMulti.filter((i) => i !== primary);
      } else {
        if (prevPrimary != null && !others.includes(prevPrimary)) others = [...others, prevPrimary];
      }
      onWallMultiChange?.(others);
      onOpeningMultiChange?.([]);
      dragRef.current = null;
      return;
    }

    if (hit?.kind === 'opening' && (e.shiftKey || shiftHeld)) {
      const primary = hit.index;
      onSelectionChange(hit);
      const prevPrimary =
        selection?.kind === 'opening' && selection.index !== primary ? selection.index : null;
      let others = openingMulti.filter((i) => i !== primary);
      if (openingMulti.includes(primary)) {
        others = openingMulti.filter((i) => i !== primary);
      } else if (prevPrimary != null && !others.includes(prevPrimary)) {
        others = [...others, prevPrimary];
      }
      onOpeningMultiChange?.(others);
      onWallMultiChange?.([]);
      dragRef.current = null;
      return;
    }

    onSelectionChange(hit);
    onWallMultiChange?.([]);
    onOpeningMultiChange?.([]);
    if (hit) {
      dragRef.current = {
        kind: 'selection',
        selection: hit,
        startPlan: raw,
        orig: plate,
        multi: [],
        moved: false,
      };
      lastPreviewRef.current = null;
    } else {
      dragRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    lastPointerClientRef.current = { x: e.clientX, y: e.clientY };
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
    if (Math.hypot(dx, dy) < 1e-9 && !drag.moved) return;
    drag.moved = true;
    const { selection: sel, orig } = drag;

    if (drag.kind === 'grip' && drag.wallIndex != null && drag.grip) {
      const w0 = orig.wallCenterlines[drag.wallIndex];
      if (!w0) return;
      if (drag.grip === 'start') {
        emitPreview(
          stretchSharedNode(orig, drag.wallIndex, 'a', w0.x1 + dx, w0.y1 + dy),
        );
      } else if (drag.grip === 'end') {
        emitPreview(
          stretchSharedNode(orig, drag.wallIndex, 'b', w0.x2 + dx, w0.y2 + dy),
        );
      } else {
        const indices = [drag.wallIndex, ...drag.multi.filter((i) => i !== drag.wallIndex)];
        emitPreview(indices.length > 1 ? moveWalls(orig, indices, dx, dy) : moveWall(orig, drag.wallIndex, dx, dy));
      }
      return;
    }

    switch (sel.kind) {
      case 'label': {
        const l = orig.labels[sel.index];
        if (!l) break;
        emitPreview(moveLabel(orig, sel.index, l.x + dx, l.y + dy));
        break;
      }
      case 'fixture': {
        const f = orig.fixtureHints[sel.index];
        if (!f) break;
        emitPreview(moveFixtureHint(orig, sel.index, f.xFt + dx, f.yFt + dy));
        break;
      }
      case 'opening': {
        const o = orig.openingHints[sel.index];
        if (!o) break;
        emitPreview(
          moveOpeningHint(orig, sel.index, (o.x1 + o.x2) / 2 + dx, (o.y1 + o.y2) / 2 + dy),
        );
        break;
      }
      case 'wall': {
        const indices = [sel.index, ...drag.multi.filter((i) => i !== sel.index)];
        emitPreview(indices.length > 1 ? moveWalls(orig, indices, dx, dy) : moveWall(orig, sel.index, dx, dy));
        break;
      }
      case 'slab': {
        emitPreview(moveSlab(orig, sel.index, dx, dy));
        break;
      }
      case 'stair': {
        const st = orig.stairs?.[sel.index];
        if (!st) break;
        emitPreview(updateStair(orig, sel.index, { xFt: st.xFt + dx, yFt: st.yFt + dy }));
        break;
      }
      default:
        break;
    }
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    if (drag?.moved) {
      const finalPlate = lastPreviewRef.current;
      if (finalPlate) {
        if (onPlateCommit) onPlateCommit(finalPlate);
        else onPlateChange(finalPlate);
      }
    }
    lastPreviewRef.current = null;
    dragRef.current = null;
  };

  const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool !== 'slab' || draftPoly.length < 3) return;
    e.preventDefault();
    closeDraftPoly();
  };

  // Escape cancels drafts; Enter closes slab polygon (Plan7-style).
  // Tab opens inline length HUD while drafting; Ctrl+Z/Y undo/redo.
  // Track Shift for ortho snap.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true);
      if (e.key === 'Escape') {
        if (tempDimHud) {
          setTempDimHud(null);
          return;
        }
        if (lengthHud) {
          setLengthHud(null);
          return;
        }
        setDraftLine(null);
        setDraftPoly([]);
        setCursorPlan(null);
        setLastSnap(null);
        setCutterWallIndex(null);
      }
      if (e.key === 'Enter' && tool === 'slab' && draftPoly.length >= 3 && !lengthHud) {
        e.preventDefault();
        closeDraftPoly();
      }
      if (
        e.key === 'Tab' &&
        draftLine &&
        !lengthHud &&
        !tempDimHud &&
        (tool === 'wall' || tool === 'opening' || tool === 'guide')
      ) {
        e.preventDefault();
        const dx = draftLine.x2 - draftLine.x1;
        const dy = draftLine.y2 - draftLine.y1;
        const cur = Math.hypot(dx, dy);
        const host = hostRef.current;
        const client = lastPointerClientRef.current;
        let left = 16;
        let top = 16;
        if (host && client) {
          const rect = host.getBoundingClientRect();
          left = client.x - rect.left + 12;
          top = client.y - rect.top - 40;
        } else if (host) {
          const rect = host.getBoundingClientRect();
          left = rect.width / 2 - 60;
          top = 24;
        }
        setLengthHud({
          value: cur > 0.5 ? formatWallLengthFt(cur) : `10'-0"`,
          left: Math.max(8, left),
          top: Math.max(8, top),
        });
        queueMicrotask(() => {
          lengthInputRef.current?.focus();
          lengthInputRef.current?.select();
        });
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
      }
      if (mod && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        e.preventDefault();
        onRedo?.();
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
  }, [
    closeDraftPoly,
    draftLine,
    draftPoly.length,
    lengthHud,
    tempDimHud,
    onRedo,
    onUndo,
    tool,
  ]);

  const commitLengthHud = useCallback(() => {
    if (!lengthHud || !draftLine) return;
    if (!(tool === 'wall' || tool === 'opening' || tool === 'guide')) return;
    const dx = draftLine.x2 - draftLine.x1;
    const dy = draftLine.y2 - draftLine.y1;
    const cur = Math.hypot(dx, dy);
    const ux = cur > 1e-9 ? dx / cur : 1;
    const uy = cur > 1e-9 ? dy / cur : 0;
    const len = parseArchitecturalLength(lengthHud.value);
    if (len == null || len < 0.5) {
      onStatus?.('Enter a length like 12\'-0" or 10.5');
      return;
    }
    const x2 = draftLine.x1 + ux * len;
    const y2 = draftLine.y1 + uy * len;
    commitDraftLine(draftLine.x1, draftLine.y1, x2, y2);
    setDraftLine(null);
    setLastSnap(null);
    setLengthHud(null);
    onStatus?.(`Committed length ${formatWallLengthFt(len)}`);
  }, [commitDraftLine, draftLine, lengthHud, onStatus, tool]);

  const openTempDimHud = useCallback(
    (dim: CadTempDim, clientX?: number, clientY?: number) => {
      const host = hostRef.current;
      let left = 16;
      let top = 16;
      if (host && clientX != null && clientY != null) {
        const rect = host.getBoundingClientRect();
        left = clientX - rect.left + 12;
        top = clientY - rect.top - 40;
      } else if (host) {
        const mid = planToSvgFt(
          (dim.x1 + dim.x2) / 2,
          (dim.y1 + dim.y2) / 2,
          plate.bounds,
          PAD,
        );
        // Approximate: place near center of host
        left = Math.max(8, host.clientWidth * 0.35);
        top = Math.max(8, host.clientHeight * 0.2);
        void mid;
      }
      setLengthHud(null);
      setTempDimHud({
        dim,
        value: dim.label,
        left: Math.max(8, left),
        top: Math.max(8, top),
      });
      queueMicrotask(() => {
        tempDimInputRef.current?.focus();
        tempDimInputRef.current?.select();
      });
    },
    [plate.bounds],
  );

  const commitTempDimHud = useCallback(() => {
    if (!tempDimHud) return;
    const len = parseArchitecturalLength(tempDimHud.value);
    if (len == null || len < 0.25) {
      onStatus?.('Enter a length like 4\'-0" or 10.5');
      return;
    }
    if (tempDimHud.associativeId) {
      const next = applyAssociativeExteriorDim(plate, tempDimHud.associativeId, len);
      onPlateChange(next);
      onAssociativeExteriorDimEdit?.(tempDimHud.associativeId, len);
    } else {
      const next = applyTempDimEdit(plate, tempDimHud.dim, len);
      onPlateChange(next);
    }
    setTempDimHud(null);
    onStatus?.(`Dim set to ${formatWallLengthFt(len)}`);
  }, [onAssociativeExteriorDimEdit, onPlateChange, onStatus, plate, tempDimHud]);

  useEffect(() => {
    if (tool !== 'slab') {
      setDraftPoly([]);
      setCursorPlan(null);
    }
    if (tool !== 'wall' && tool !== 'opening' && tool !== 'guide' && tool !== 'section') {
      setDraftLine(null);
      setLastSnap(null);
      setLengthHud(null);
    }
    if (tool !== 'trim' && tool !== 'extend') {
      setCutterWallIndex(null);
    }
  }, [tool]);

  useEffect(() => {
    if (!draftLine) setLengthHud(null);
  }, [draftLine]);

  useEffect(() => {
    if (!selection) setTempDimHud(null);
  }, [selection]);

  useEffect(() => {
    if (tool === 'trim') onStatus?.('Trim: click cutter wall, then wall to shorten');
    else if (tool === 'extend') onStatus?.('Extend: click boundary wall, then wall to lengthen');
    else if (tool === 'break') onStatus?.('Break: click wall at split point');
    else if (tool === 'offset') onStatus?.('Offset: click wall to copy parallel 1 ft');
  }, [tool, onStatus]);

  const isSelected = (kind: CadPlateSelection['kind'], index: number) =>
    selection?.kind === kind && selection.index === index;

  const isWallHighlighted = (index: number) =>
    isSelected('wall', index) || wallMulti.includes(index);

  const draftPolyPreview =
    draftPoly.length && cursorPlan ? [...draftPoly, cursorPlan] : draftPoly;
  const showSnapMarker =
    Boolean(draftLine || draftPoly.length) &&
    cursorPlan &&
    (lastSnap?.kind === 'endpoint' || lastSnap?.kind === 'guide');

  return (
    <div className="cad-plate-editor-host" ref={hostRef}>
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
      {/* Drafting paper — cool light field like Plan7 tutorial plan views */}
      <rect width="100%" height="100%" fill="#f7f8fa" />
      <defs>
        {/* 1' minor / 4' major grid in plan feet (userSpaceOnUse inside flipped group). */}
        <pattern
          id={gridMinorId}
          width="1"
          height="1"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 1 0 L 0 0 0 1"
            fill="none"
            stroke="#b0bac6"
            strokeWidth={0.035}
          />
        </pattern>
        <pattern
          id={gridMajorId}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 4 0 L 0 0 0 4"
            fill="none"
            stroke="#7b8794"
            strokeWidth={0.06}
          />
        </pattern>
      </defs>
      <g transform={`translate(${(-ox).toFixed(3)} ${(h + oy).toFixed(3)}) scale(1,-1)`}>
        {showGrid && (
          <g className="cad-drafting-grid" pointerEvents="none" aria-hidden>
            <rect
              x={ox}
              y={oy}
              width={w}
              height={h}
              fill={`url(#${gridMinorId})`}
            />
            <rect
              x={ox}
              y={oy}
              width={w}
              height={h}
              fill={`url(#${gridMajorId})`}
            />
          </g>
        )}
        {underlay && (
          <g
            className="cad-underlay"
            transform={`translate(${underlay.xFt} ${underlay.yFt + underlay.heightFt}) scale(1,-1)`}
            pointerEvents="none"
          >
            <image
              href={underlay.imageUrl}
              width={underlay.widthFt}
              height={underlay.heightFt}
              opacity={underlay.opacity}
              preserveAspectRatio="none"
            />
          </g>
        )}
        {slabs.map((slab, i) => {
          if (!isLayerOn(plate, slab.layer)) return null;
          const selected = isSelected('slab', i);
          const isPlot = slab.kind === 'plot';
          return (
            <polygon
              key={slab.id}
              points={polyPointsAttr(slab.points)}
              fill={isPlot ? '#d8ead8' : SLAB_FILL[slab.kind]}
              fillOpacity={isPlot ? (selected ? 0.5 : 0.38) : selected ? 0.55 : 0.32}
              stroke={selected ? '#1f4e46' : isPlot ? '#0f766e' : SLAB_FILL[slab.kind]}
              strokeWidth={stroke * (selected ? 2.8 : isPlot ? 2.6 : 1.4)}
              strokeDasharray={isPlot ? '0.55 0.35' : undefined}
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
          if (!isLayerOn(plate, wall.layer)) return null;
          const selected = isWallHighlighted(i);
          const primary = isSelected('wall', i);
          const wallStroke = selected
            ? '#1f4e46'
            : wallStrokeForMaterial(wall.materialId, wall.exterior);
          const mid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
          const gripR = stroke * 10;
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
              {primary && (
                <g className="cad-grips">
                  <circle className="cad-grip" cx={wall.x1} cy={wall.y1} r={gripR} fill="#1f4e46" fillOpacity={0.9} />
                  <circle className="cad-grip" cx={wall.x2} cy={wall.y2} r={gripR} fill="#1f4e46" fillOpacity={0.9} />
                  <circle className="cad-grip" cx={mid.x} cy={mid.y} r={gripR * 0.85} fill="#fff" stroke="#1f4e46" strokeWidth={stroke * 2} />
                </g>
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
          if (!isLayerOn(plate, o.layer)) return null;
          const selected = isSelected('opening', i) || openingMulti.includes(i);
          const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1) || 1;
          const ux = (o.x2 - o.x1) / len;
          const uy = (o.y2 - o.y1) / len;
          const nx = -uy;
          const ny = ux;
          const mx = (o.x1 + o.x2) / 2;
          const my = (o.y1 + o.y2) / 2;
          const swing = o.swing ?? (o.kind === 'door' ? 'left' : 'none');
          const swingR = Math.min(len, 3.5);
          const swingSign = swing === 'right' ? -1 : 1;
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
              {o.kind === 'door' && swing !== 'none' && (
                <path
                  d={`M ${o.x1} ${o.y1} A ${swingR} ${swingR} 0 0 ${swingSign > 0 ? 1 : 0} ${
                    o.x1 + ux * 0 + nx * swingR * swingSign
                  } ${o.y1 + uy * 0 + ny * swingR * swingSign}`}
                  fill="none"
                  stroke={selected ? '#c2410c' : '#d97706'}
                  strokeWidth={stroke * 1.1}
                  strokeDasharray="0.35 0.25"
                  strokeOpacity={0.85}
                />
              )}
              <circle
                cx={mx}
                cy={my}
                r={stroke * 6}
                fill={selected ? '#c2410c' : '#b45309'}
                fillOpacity={0.35}
              />
              {selected && (
                <g className="cad-opening-grips">
                  <circle cx={o.x1} cy={o.y1} r={stroke * 5} fill="#fff" stroke="#c2410c" strokeWidth={stroke * 1.5} />
                  <circle cx={o.x2} cy={o.y2} r={stroke * 5} fill="#fff" stroke="#c2410c" strokeWidth={stroke * 1.5} />
                  <circle cx={mx} cy={my} r={stroke * 5.5} fill="#c2410c" fillOpacity={0.85} />
                </g>
              )}
              {o.mark && (
                <g transform={`translate(${mx} ${my}) scale(1,-1)`}>
                  <text
                    y={-stroke * 10}
                    fill="#9a3412"
                    fontSize={Math.max(0.85, stroke * 9)}
                    fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
                    fontWeight={700}
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    {o.mark}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {plate.fixtureHints.map((f, i) => {
          if (!isLayerOn(plate, f.layer)) return null;
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
          if (!isLayerOn(plate, st.layer)) return null;
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
          if (!isLayerOn(plate, d.layer)) return null;
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

      {tempDims.map((dim) => {
        const a = planToSvgFt(dim.x1, dim.y1, plate.bounds, PAD);
        const b = planToSvgFt(dim.x2, dim.y2, plate.bounds, PAD);
        const lp = planToSvgFt((dim.x1 + dim.x2) / 2, (dim.y1 + dim.y2) / 2, plate.bounds, PAD);
        return (
          <CadDimMark
            key={dim.id}
            className="cad-temp-dim"
            style={{ cursor: 'pointer' }}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            labelX={lp.x}
            labelY={lp.y}
            label={dim.label}
            fontSize={fontSize}
            tone="temp"
            onPointerDown={(ev) => {
              ev.stopPropagation();
              openTempDimHud(dim, ev.clientX, ev.clientY);
            }}
            onDoubleClick={(ev) => {
              ev.stopPropagation();
              onPromoteTempDim?.(dim);
            }}
          />
        );
      })}
      {exteriorDims.map((dim) => {
        const a = planToSvgFt(dim.x1, dim.y1, plate.bounds, PAD);
        const b = planToSvgFt(dim.x2, dim.y2, plate.bounds, PAD);
        const lp = planToSvgFt(dim.labelX, dim.labelY, plate.bounds, PAD);
        const w1 =
          dim.wx1 != null && dim.wy1 != null
            ? planToSvgFt(dim.wx1, dim.wy1, plate.bounds, PAD)
            : null;
        const w2 =
          dim.wx2 != null && dim.wy2 != null
            ? planToSvgFt(dim.wx2, dim.wy2, plate.bounds, PAD)
            : null;
        const isManual = (plate.annotativeDims ?? []).some((d) => d.id === dim.id);
        const associative = dim.id === 'overall-w' || dim.id === 'overall-d';
        const tone = dim.locked
          ? 'locked'
          : isManual
            ? 'manual'
            : associative
              ? 'overall'
              : 'segment';
        return (
          <CadDimMark
            key={dim.id}
            className={isManual ? 'cad-ext-dim cad-ext-dim-manual' : 'cad-ext-dim'}
            style={associative || isManual ? { cursor: dim.locked ? 'not-allowed' : 'pointer' } : undefined}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            labelX={lp.x}
            labelY={lp.y}
            label={dim.locked ? `[L] ${dim.label}` : dim.label}
            fontSize={fontSize}
            tone={tone}
            wx1={w1?.x}
            wy1={w1?.y}
            wx2={w2?.x}
            wy2={w2?.y}
            onPointerDown={(ev) => {
              if (!associative && !isManual) return;
              if (dim.locked) return;
              ev.stopPropagation();
              const host = hostRef.current;
              const rect = host?.getBoundingClientRect();
              const left = rect ? ev.clientX - rect.left + 12 : 24;
              const top = rect ? ev.clientY - rect.top - 40 : 24;
              setTempDimHud({
                dim: {
                  id: dim.id,
                  kind: 'wall-length',
                  x1: dim.x1,
                  y1: dim.y1,
                  x2: dim.x2,
                  y2: dim.y2,
                  valueFt: dim.valueFt ?? 10,
                  label: dim.label,
                },
                value: dim.label,
                left: Math.max(8, left),
                top: Math.max(8, top),
                associativeId: associative ? dim.id : undefined,
              });
              queueMicrotask(() => {
                tempDimInputRef.current?.focus();
                tempDimInputRef.current?.select();
              });
            }}
          />
        );
      })}

      {interiorDims.map((dim) => {
        const a = planToSvgFt(dim.x1, dim.y1, plate.bounds, PAD);
        const b = planToSvgFt(dim.x2, dim.y2, plate.bounds, PAD);
        const lp = planToSvgFt(dim.labelX, dim.labelY, plate.bounds, PAD);
        const w1 =
          dim.wx1 != null && dim.wy1 != null
            ? planToSvgFt(dim.wx1, dim.wy1, plate.bounds, PAD)
            : null;
        const w2 =
          dim.wx2 != null && dim.wy2 != null
            ? planToSvgFt(dim.wx2, dim.wy2, plate.bounds, PAD)
            : null;
        return (
          <CadDimMark
            key={dim.id}
            className="cad-int-dim"
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            labelX={lp.x}
            labelY={lp.y}
            label={dim.label}
            fontSize={fontSize}
            tone="interior"
            wx1={w1?.x}
            wy1={w1?.y}
            wx2={w2?.x}
            wy2={w2?.y}
          />
        );
      })}

      {roomStamps.map((room) => {
        const sp = planToSvgFt(room.x, room.y, plate.bounds, PAD);
        const nameSize = fontSize * 0.92;
        const areaSize = fontSize * 0.72;
        const name = room.name;
        const area = formatRoomAreaSqFt(room.areaSqFt);
        const chipW = Math.max(
          name.length * nameSize * 0.52,
          area.length * areaSize * 0.48,
        ) + fontSize * 1.1;
        const chipH = fontSize * 2.35;
        return (
          <g key={room.id} className="cad-room-stamp" pointerEvents="none">
            <rect
              x={sp.x - chipW / 2}
              y={sp.y - chipH / 2}
              width={chipW}
              height={chipH}
              rx={fontSize * 0.18}
              fill="rgba(255,255,255,0.88)"
              stroke="rgba(15,23,42,0.08)"
              strokeWidth={0.7}
            />
            <text
              x={sp.x}
              y={sp.y - fontSize * 0.42}
              fill="#0f172a"
              fontSize={nameSize}
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontWeight={650}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {name}
            </text>
            <line
              x1={sp.x - chipW * 0.28}
              y1={sp.y + fontSize * 0.05}
              x2={sp.x + chipW * 0.28}
              y2={sp.y + fontSize * 0.05}
              stroke="rgba(15,23,42,0.12)"
              strokeWidth={0.55}
            />
            <text
              x={sp.x}
              y={sp.y + fontSize * 0.55}
              fill="#5b6b7c"
              fontSize={areaSize}
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontWeight={500}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {area}
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
    {lengthHud && (
      <div
        className="cad-length-hud"
        style={{ left: lengthHud.left, top: lengthHud.top }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <label>
          <span className="cad-length-hud-label">Length</span>
          <input
            ref={lengthInputRef}
            type="text"
            value={lengthHud.value}
            aria-label="Draft length"
            onChange={(e) => setLengthHud({ ...lengthHud, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                commitLengthHud();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setLengthHud(null);
              }
              if (e.key === 'Tab') {
                e.preventDefault();
              }
            }}
          />
        </label>
      </div>
    )}
    {tempDimHud && (
      <div
        className="cad-length-hud cad-temp-dim-hud"
        style={{ left: tempDimHud.left, top: tempDimHud.top }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <label>
          <span className="cad-length-hud-label">
            {tempDimHud.dim.kind === 'between-walls'
              ? 'Distance'
              : tempDimHud.dim.kind === 'opening-width'
                ? 'Width'
                : 'Length'}
          </span>
          <input
            ref={tempDimInputRef}
            type="text"
            value={tempDimHud.value}
            aria-label="Temporary dimension value"
            onChange={(e) => setTempDimHud({ ...tempDimHud, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                commitTempDimHud();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setTempDimHud(null);
              }
            }}
          />
        </label>
        {onPromoteTempDim && (
          <button
            type="button"
            className="cad-temp-dim-promote"
            onClick={() => {
              onPromoteTempDim(tempDimHud.dim);
              setTempDimHud(null);
            }}
          >
            Keep
          </button>
        )}
      </div>
    )}
    </div>
  );
}
