import type { CadPlate, CadUnderlay } from './types';

export type { CadUnderlay };

/** Set or clear the plate underlay. */
export function setUnderlay(plate: CadPlate, underlay: CadUnderlay | null): CadPlate {
  if (underlay == null) {
    if (!plate.underlay) return plate;
    return { ...plate, underlay: undefined };
  }
  return {
    ...plate,
    underlay: {
      ...underlay,
      opacity: clampOpacity(underlay.opacity),
      widthFt: Math.max(0.1, underlay.widthFt),
      heightFt: Math.max(0.1, underlay.heightFt),
    },
  };
}

/**
 * Scale underlay width/height so a measured span matches a known real length.
 * `pixelOrPlanLengthFt` is the current underlay-space length of that span.
 */
export function calibrateUnderlay(
  plate: CadPlate,
  knownLengthFt: number,
  pixelOrPlanLengthFt: number,
): CadPlate {
  const u = plate.underlay;
  if (!u) return plate;
  const measured = Math.abs(pixelOrPlanLengthFt);
  if (measured < 1e-9) return plate;
  const known = Math.abs(knownLengthFt);
  if (known < 1e-9) return plate;
  const scale = known / measured;
  return {
    ...plate,
    underlay: {
      ...u,
      widthFt: Math.max(0.1, u.widthFt * scale),
      heightFt: Math.max(0.1, u.heightFt * scale),
    },
  };
}

/** Set underlay opacity (0..1). */
export function setUnderlayOpacity(plate: CadPlate, opacity: number): CadPlate {
  const u = plate.underlay;
  if (!u) return plate;
  return { ...plate, underlay: { ...u, opacity: clampOpacity(opacity) } };
}

function clampOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return 1;
  return Math.max(0, Math.min(1, opacity));
}
