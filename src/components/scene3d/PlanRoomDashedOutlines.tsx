import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { usePlannerStore } from '../../store/plannerStore';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';

/**
 * Dashed outlines for room polygons in Plan view — matches DWG dotted space boundaries
 * for open-plan rooms (Great Room, Kitchen, Lanai, etc.).
 */
export function PlanRoomDashedOutlines() {
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const planRooms = usePlannerStore((s) => s.planRooms);

  const outlines = useMemo(() => {
    return planRooms
      .filter((r) => r.points.length >= 3)
      .map((r) => {
        const pts = r.points.map((p) => {
          const x = (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER;
          const z = (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER;
          return [x, 0.02, z] as [number, number, number];
        });
        // Close the loop.
        pts.push(pts[0]!);
        return { id: r.id, name: r.name, points: pts, outdoor: r.roomType === 'Outdoor' };
      });
  }, [planRooms]);

  if (cameraMode !== 'top' || !outlines.length) return null;

  return (
    <group name="plan-room-dashed-outlines">
      {outlines.map((o) => (
        <Line
          key={o.id}
          points={o.points}
          color={o.outdoor ? '#4d7c0f' : '#475569'}
          lineWidth={1.25}
          dashed
          dashSize={0.18}
          gapSize={0.12}
          transparent
          opacity={0.75}
          depthWrite={false}
          raycast={() => null}
        />
      ))}
    </group>
  );
}
