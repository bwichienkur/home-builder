import {
  isOpeningLayer,
  isRoomWallLayer,
  isSoftSpaceLayer,
  openingKindFromLayer,
  planVectorRole,
} from '../housePlans/dxfDrawingImport';
import type { CadLayerKind, CadSegmentRole } from './types';

/** Elevation / section / facade layers — sheet reference only, not floor extrusion. */
export function isElevationLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  if (!u) return false;
  return (
    /ELEV|ELEVATION|FACADE|FAÇADE|SECTION|F\.?\s*ELEV|S\.?\s*ELEV|FRONT\s*ELEV|SIDE\s*ELEV|REAR\s*ELEV/.test(
      u,
    ) || /^A-ELEV/.test(u)
  );
}

export function isFoundationLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  return /FOUND|FOOTING|SLAB|STEM|PIER|CONC/.test(u) && !isRoomWallLayer(layer);
}

export function isAnnotationLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  return /TEXT|DIM|NOTE|TITLE|BORDER|VIEWPORT|REVCLOUD|HATCH|GRID|REF|DRY\s*WALL|MEASURE|TICK/.test(
    u,
  );
}

export function classifyLayerKind(layer: string): CadLayerKind {
  if (isElevationLayer(layer)) return 'elevation';
  if (isFoundationLayer(layer)) return 'foundation';
  if (isAnnotationLayer(layer)) return 'annotation';
  if (isRoomWallLayer(layer) || isOpeningLayer(layer) || isSoftSpaceLayer(layer)) return 'floor';
  const u = layer.trim().toUpperCase();
  if (/FIXTURE|COUNTER|CABINET|APPLIANCE|PLUMB|SHELF|WALL|DOOR|WINDOW|FLOOR|ROOM/.test(u)) return 'floor';
  return 'other';
}

export function classifySegmentRole(layer: string): CadSegmentRole {
  if (isElevationLayer(layer)) return 'elevation';
  const base = planVectorRole(layer);
  if (base === 'wall' || base === 'opening' || base === 'fixture' || base === 'soft') return base;
  return 'other';
}

export { isOpeningLayer, isRoomWallLayer, isSoftSpaceLayer, openingKindFromLayer, planVectorRole };
