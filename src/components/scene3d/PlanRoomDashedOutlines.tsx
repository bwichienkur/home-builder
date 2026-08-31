import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { usePlannerStore } from '../../store/plannerStore';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';

function distPointToSegM(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-12) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/**
 * Dashed outlines only for soft/open-plan room edges (no solid wall nearby).
 * Solid wall edges are already shown by CAD overlay + WallMeshes — dashing them
 * made Stillwater look double-outlined and "off" the DWG.
 */
export function PlanRoomDashedOutlines() {
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const walls = usePlannerStore((s) => s.walls);

  const wallSegsM = useMemo(
    () =>
      walls.map((w) => ({
        ax: (w.start.x - WORLD_ORIGIN.x) / PIXELS_PER_METER,
        az: (w.start.y - WORLD_ORIGIN.y) / PIXELS_PER_METER,
        bx: (w.end.x - WORLD_ORIGIN.x) / PIXELS_PER_METER,
        bz: (w.end.y - WORLD_ORIGIN.y) / PIXELS_PER_METER,
      })),
    [walls],
  );

  const softEdges = useMemo(() => {
    const edges: { id: string; points: [number, number, number][]; outdoor: boolean }[] = [];
    const wallTolM = 0.55; // ~1.8 ft — edge with a nearby wall is solid, not soft
    for (const r of planRooms) {
      if (r.points.length < 3) continue;
      const pts = r.points.map((p) => {
        const x = (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER;
        const z = (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER;
        return [x, 0.02, z] as [number, number, number];
      });
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        const mx = (a[0] + b[0]) / 2;
        const mz = (a[2] + b[2]) / 2;
        let nearWall = false;
        for (const w of wallSegsM) {
          if (distPointToSegM(mx, mz, w.ax, w.az, w.bx, w.bz) <= wallTolM) {
            nearWall = true;
            break;
          }
        }
        if (nearWall) continue;
        // Skip tiny edges.
        if (Math.hypot(b[0] - a[0], b[2] - a[2]) < 0.35) continue;
        edges.push({
          id: `${r.id}-e${i}`,
          points: [a, b],
          outdoor: r.roomType === 'Outdoor',
        });
      }
    }
    return edges;
  }, [planRooms, wallSegsM]);

  if (cameraMode !== 'top' || !softEdges.length) return null;

  return (
    <group name="plan-room-dashed-outlines">
      {softEdges.map((o) => (
        <Line
          key={o.id}
          points={o.points}
          color={o.outdoor ? '#4d7c0f' : '#475569'}
          lineWidth={1.35}
          dashed
          dashSize={0.18}
          gapSize={0.12}
          transparent
          opacity={0.8}
          depthWrite={false}
          raycast={() => null}
        />
      ))}
    </group>
  );
}
