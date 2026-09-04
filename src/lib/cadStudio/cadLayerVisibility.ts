import type { CadPlate, CadSlabFt, CadWallCenterlineFt } from './types';

/** Soft layer visibility — does not rebuild/destroy authored geometry. */
export function layerVisibleSet(plate: CadPlate): Set<string> {
  return new Set(plate.layers.filter((l) => l.visible).map((l) => l.name));
}

export function isLayerOn(plate: CadPlate, layer: string | undefined, fallback = true): boolean {
  if (!layer) return fallback;
  const info = plate.layers.find((l) => l.name === layer);
  if (!info) return fallback;
  return info.visible;
}

export function visibleWallCenterlines(plate: CadPlate): CadWallCenterlineFt[] {
  return plate.wallCenterlines.filter((w) => isLayerOn(plate, w.layer ?? 'WALLS'));
}

export function visibleOpeningHints(plate: CadPlate) {
  return plate.openingHints.filter((o) => isLayerOn(plate, o.layer, true));
}

export function visibleSlabs(plate: CadPlate): CadSlabFt[] {
  return (plate.slabs ?? []).filter((s) => isLayerOn(plate, s.layer, true));
}

export function visibleStairs(plate: CadPlate) {
  return (plate.stairs ?? []).filter((s) => isLayerOn(plate, s.layer, true));
}

export function visibleFixtures(plate: CadPlate) {
  return plate.fixtureHints.filter((f) => isLayerOn(plate, f.layer, true));
}

export function visibleDormers(plate: CadPlate) {
  return (plate.dormers ?? []).filter((d) => isLayerOn(plate, d.layer, true));
}

/** Toggle only the visible flag — keep wallCenterlines / openings intact. */
export function softSetLayerVisibility(
  plate: CadPlate,
  visibility: Record<string, boolean>,
): CadPlate {
  return {
    ...plate,
    layers: plate.layers.map((l) => ({
      ...l,
      visible: visibility[l.name] ?? l.visible,
    })),
  };
}

export function softToggleLayer(plate: CadPlate, layerName: string): CadPlate {
  return {
    ...plate,
    layers: plate.layers.map((l) =>
      l.name === layerName ? { ...l, visible: !l.visible } : l,
    ),
  };
}

export function softSetAllLayers(plate: CadPlate, visible: boolean): CadPlate {
  return {
    ...plate,
    layers: plate.layers.map((l) => ({ ...l, visible })),
  };
}
