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

export function isRoofLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  return /ROOF|RAFTER|TRUSS|GUTTER|EAVE|FASCIA|SOFFIT|RIDGE|HIP\b|VALLEY/.test(u);
}

export function isDimLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  return (
    /^(DIM|DIMS|DIMENSIONS?)$/.test(u) ||
    /\bDIM(S|ENSIONS?)?\b/.test(u) ||
    /A-ANNO-DIM|A-DIM/.test(u) ||
    /MEASURE|TICK|WITNESS/.test(u)
  );
}

export function isAnnotationLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  if (isDimLayer(layer)) return true;
  return /TEXT|NOTE|TITLE|BORDER|VIEWPORT|REVCLOUD|HATCH|GRID|REF|DRY\s*WALL|ANNO|SYMBOL|LEGEND|SCHEDULE/.test(
    u,
  );
}

/** MEP / site / roof noise — imported but off by default. */
export function isNoiseLayer(layer: string): boolean {
  const u = layer.trim().toUpperCase();
  if (isRoofLayer(layer)) return true;
  return /ELEC|ELECTRICAL|LIGHT|SWITCH|RECEPT|OUTLET|HVAC|DUCT|DIFFUSER|SPRINK|PLUMB|GAS\b|LANDSCAPE|PLANT|SITE|DRIVE|WALKWAY|PATIO|FENCE|TREE|IRRIG|FIRE\s*ALARM|DATA|COMM/.test(
    u,
  );
}

export function classifyLayerKind(layer: string): CadLayerKind {
  if (isElevationLayer(layer)) return 'elevation';
  if (isFoundationLayer(layer)) return 'foundation';
  if (isAnnotationLayer(layer) || isDimLayer(layer)) return 'annotation';
  if (isRoofLayer(layer) || isNoiseLayer(layer)) return 'other';
  if (isRoomWallLayer(layer) || isOpeningLayer(layer) || isSoftSpaceLayer(layer)) return 'floor';
  const u = layer.trim().toUpperCase();
  if (/FIXTURE|COUNTER|CABINET|APPLIANCE|SHELF|WALL|DOOR|WINDOW|FLOOR|ROOM/.test(u)) return 'floor';
  return 'other';
}

export function classifySegmentRole(layer: string): CadSegmentRole {
  if (isElevationLayer(layer)) return 'elevation';
  if (isDimLayer(layer) || isAnnotationLayer(layer) || isRoofLayer(layer) || isNoiseLayer(layer)) {
    return 'other';
  }
  const base = planVectorRole(layer);
  if (base === 'wall' || base === 'opening' || base === 'fixture' || base === 'soft') return base;
  return 'other';
}

/** Smart import defaults: walls/doors/fixtures/soft on; dims, roof, text, MEP off. */
export function defaultLayerVisible(layer: string, kind: CadLayerKind, role: CadSegmentRole): boolean {
  if (/ROOM/i.test(layer) && !isDimLayer(layer)) return true;
  if (kind === 'elevation' || kind === 'foundation' || kind === 'annotation') return false;
  if (isDimLayer(layer) || isRoofLayer(layer) || isNoiseLayer(layer)) return false;
  if (role === 'wall' || role === 'opening' || role === 'fixture' || role === 'soft') return true;
  if (kind === 'floor') return true;
  return false;
}

/** UI classify options for the layer panel. */
export type CadLayerClassify = 'wall' | 'door' | 'dim' | 'ignore' | 'fixture' | 'soft' | 'other';

export function classifyToRole(classify: CadLayerClassify): CadSegmentRole {
  switch (classify) {
    case 'wall':
      return 'wall';
    case 'door':
      return 'opening';
    case 'fixture':
      return 'fixture';
    case 'soft':
      return 'soft';
    case 'dim':
    case 'ignore':
    case 'other':
    default:
      return 'other';
  }
}

export function roleToClassify(
  role: CadSegmentRole,
  kind: CadLayerKind,
  layerName?: string,
): CadLayerClassify {
  if (role === 'wall') return 'wall';
  if (role === 'opening') return 'door';
  if (role === 'fixture') return 'fixture';
  if (role === 'soft') return 'soft';
  if (kind === 'annotation' || (layerName != null && isDimLayer(layerName))) return 'dim';
  return 'ignore';
}

export { isOpeningLayer, isRoomWallLayer, isSoftSpaceLayer, openingKindFromLayer, planVectorRole };
