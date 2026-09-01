import type { Seg } from '../housePlans/dxfRooms';

const FT_EPS = 0.08;
const FT_TO_M = 0.3048;

export type WallEndTrimM = { startM: number; endM: number };

/** No 3D miter trim — centerline corner resolution handles joins; trimming boxes creates gaps. */
export function wallEndTrimsFt(_segments: Array<Seg & { exterior?: boolean }>): WallEndTrimM[] {
  return _segments.map(() => ({ startM: 0, endM: 0 }));
}

export function trimmedWallLengthM(
  lengthFt: number,
  trim: WallEndTrimM,
): { lenM: number } {
  const lenM = lengthFt * FT_TO_M;
  const trimmed = Math.max(0.05, lenM - trim.startM - trim.endM);
  return { lenM: trimmed };
}
