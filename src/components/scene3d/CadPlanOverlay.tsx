import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { usePlannerStore } from '../../store/plannerStore';

const FT_TO_M = 0.3048;

type Role = 'wall' | 'opening' | 'fixture' | 'other';

const ROLE_STYLE: Record<Role, { color: string; opacity: number }> = {
  wall: { color: '#1e293b', opacity: 0.55 },
  opening: { color: '#b45309', opacity: 0.72 },
  fixture: { color: '#0f766e', opacity: 0.8 },
  other: { color: '#64748b', opacity: 0.28 },
};

/**
 * Plan-first CAD underlay: exact DXF linework in top/plan view, registered to the
 * same plate center as CAD walls. Non-interactive — rooms/walls remain editable above.
 * 3D continues to extrude from the plan wall/room model.
 */
export function CadPlanOverlay() {
  const cameraMode = usePlannerStore((s) => s.cameraMode);
  const layers = usePlannerStore((s) => s.layerVisibility);
  const floors = usePlannerStore((s) => s.floors);
  const activeFloorId = usePlannerStore((s) => s.activeFloorId);

  const active = floors.find((f) => f.id === activeFloorId);
  const vectors = active?.cadPlanVectorsFt;
  const center = active?.cadBuildCenterFt;

  const geometries = useMemo(() => {
    if (!vectors?.length || !center) return null;
    const buckets: Record<Role, number[]> = { wall: [], opening: [], fixture: [], other: [] };
    for (const s of vectors) {
      const role: Role = s.role ?? 'other';
      // Same transform as buildFloorFromCadWalls → Scene3D world():
      // plan px = WORLD_ORIGIN + (ft - center) * FT_TO_M * PPM
      // world m = (plan px - WORLD_ORIGIN) / PPM = (ft - center) * FT_TO_M
      const x1 = (s.x1 - center.cx) * FT_TO_M;
      const z1 = (s.y1 - center.cy) * FT_TO_M;
      const x2 = (s.x2 - center.cx) * FT_TO_M;
      const z2 = (s.y2 - center.cy) * FT_TO_M;
      const y = -0.048; // below floor plate
      buckets[role].push(x1, y, z1, x2, y, z2);
    }
    const out: Partial<Record<Role, THREE.BufferGeometry>> = {};
    for (const role of Object.keys(buckets) as Role[]) {
      const arr = buckets[role];
      if (!arr.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      out[role] = geo;
    }
    return out;
  }, [vectors, center]);

  useEffect(() => {
    return () => {
      if (!geometries) return;
      for (const geo of Object.values(geometries)) geo?.dispose();
    };
  }, [geometries]);

  if (cameraMode !== 'top' || !layers.cadOverlay || !geometries) return null;

  return (
    <group name="cad-plan-overlay">
      {(Object.keys(ROLE_STYLE) as Role[]).map((role) => {
        const geo = geometries[role];
        if (!geo) return null;
        const style = ROLE_STYLE[role];
        return (
          <lineSegments key={role} geometry={geo} raycast={() => null}>
            <lineBasicMaterial
              color={style.color}
              transparent
              opacity={style.opacity}
              depthWrite={false}
            />
          </lineSegments>
        );
      })}
    </group>
  );
}
