import { useMemo } from 'react';
import * as THREE from 'three';
import type { CadRoofMassing } from '../../lib/cadStudio/types';
import { metalRoofMaterial, tileRoofMaterial } from '../../lib/cadStudio/cadSceneMaterials';

const FT_TO_M = 0.3048;

type Envelope = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * Roof mesh from DXF elevation profile — front silhouette extruded to plan depth.
 * Procedural flat / shed / gable when no DXF profile (or forced).
 */
export function CadProfileRoofMesh({
  roof,
  storyHeightM,
  envelope,
}: {
  roof: CadRoofMassing;
  storyHeightM: number;
  envelope: Envelope;
}) {
  const kind = roof.kind ?? 'gable';
  if (kind === 'flat') {
    return <CadFlatRoof roof={roof} storyHeightM={storyHeightM} envelope={envelope} />;
  }
  if (kind === 'shed') {
    return <CadShedRoof roof={roof} storyHeightM={storyHeightM} envelope={envelope} />;
  }
  return <CadGableOrProfileRoof roof={roof} storyHeightM={storyHeightM} envelope={envelope} />;
}

function CadGableOrProfileRoof({
  roof,
  storyHeightM,
  envelope,
}: {
  roof: CadRoofMassing;
  storyHeightM: number;
  envelope: Envelope;
}) {
  const geom = useMemo(() => {
    const w = Math.max(0.5, envelope.maxX - envelope.minX);
    const d = Math.max(0.5, envelope.maxZ - envelope.minZ);
    const cx = (envelope.minX + envelope.maxX) / 2;
    const cz = (envelope.minZ + envelope.maxZ) / 2;
    const overhang = roof.overhangM;
    const eaveM = storyHeightM;
    const profile = roof.profile ?? [];

    if (roof.style === 'dxf' && profile.length >= 4 && !roof.ridgeAlongX) {
      const sorted = [...profile].sort((a, b) => a.xFt - b.xFt);
      const widthFt = sorted[sorted.length - 1]!.xFt - sorted[0]!.xFt || roof.facadeWidthFt;
      const xScale = (w + overhang * 2) / Math.max(1, widthFt * FT_TO_M);
      const zFront = cz - d / 2 - overhang;
      const zBack = cz + d / 2 + overhang;
      const x0 = cx - w / 2 - overhang;

      const positions: number[] = [];
      const indices: number[] = [];

      const addQuad = (
        ax: number, ay: number, az: number,
        bx: number, by: number, bz: number,
        cx2: number, cy: number, cz2: number,
        dx: number, dy: number, dz: number,
      ) => {
        const base = positions.length / 3;
        positions.push(ax, ay, az, bx, by, bz, cx2, cy, cz2, dx, dy, dz);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      };

      for (let i = 0; i < sorted.length - 1; i++) {
        const p0 = sorted[i]!;
        const p1 = sorted[i + 1]!;
        const xA = x0 + p0.xFt * FT_TO_M * xScale;
        const xB = x0 + p1.xFt * FT_TO_M * xScale;
        const yA = Math.max(eaveM, p0.yFt * FT_TO_M);
        const yB = Math.max(eaveM, p1.yFt * FT_TO_M);
        addQuad(xA, yA, zFront, xB, yB, zFront, xB, eaveM, zBack, xA, eaveM, zBack);
      }

      const leftX = x0 + sorted[0]!.xFt * FT_TO_M * xScale;
      const rightX = x0 + sorted[sorted.length - 1]!.xFt * FT_TO_M * xScale;
      const leftY = Math.max(eaveM, sorted[0]!.yFt * FT_TO_M);
      const rightY = Math.max(eaveM, sorted[sorted.length - 1]!.yFt * FT_TO_M);
      addQuad(leftX, leftY, zFront, leftX, eaveM, zFront, leftX, eaveM, zBack, leftX, leftY, zBack);
      addQuad(rightX, rightY, zFront, rightX, rightY, zBack, rightX, eaveM, zBack, rightX, eaveM, zFront);

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      return { geometry: g, fallback: false as const };
    }

    return { geometry: null, fallback: true as const };
  }, [roof, storyHeightM, envelope]);

  if (!geom.fallback && geom.geometry) {
    return (
      <mesh geometry={geom.geometry} castShadow receiveShadow material={tileRoofMaterial()} />
    );
  }

  return <CadGableRoofFallback roof={roof} storyHeightM={storyHeightM} envelope={envelope} />;
}

function CadFlatRoof({
  roof,
  storyHeightM,
  envelope,
}: {
  roof: CadRoofMassing;
  storyHeightM: number;
  envelope: Envelope;
}) {
  const w = Math.max(0.5, envelope.maxX - envelope.minX) + roof.overhangM * 2;
  const d = Math.max(0.5, envelope.maxZ - envelope.minZ) + roof.overhangM * 2;
  const cx = (envelope.minX + envelope.maxX) / 2;
  const cz = (envelope.minZ + envelope.maxZ) / 2;
  const thick = 0.14;
  return (
    <mesh
      position={[cx, storyHeightM + thick / 2, cz]}
      castShadow
      receiveShadow
      material={metalRoofMaterial()}
    >
      <boxGeometry args={[w, thick, d]} />
    </mesh>
  );
}

function CadShedRoof({
  roof,
  storyHeightM,
  envelope,
}: {
  roof: CadRoofMassing;
  storyHeightM: number;
  envelope: Envelope;
}) {
  const w = Math.max(0.5, envelope.maxX - envelope.minX);
  const d = Math.max(0.5, envelope.maxZ - envelope.minZ);
  const cx = (envelope.minX + envelope.maxX) / 2;
  const cz = (envelope.minZ + envelope.maxZ) / 2;
  const overhang = roof.overhangM;
  const riseM = Math.max(0.35, roof.ridgeHeightM - storyHeightM);
  const span = roof.ridgeAlongX ? w : d;
  const slopeLen = Math.hypot(span, riseM);
  const pitch = Math.atan2(riseM, span);
  const thick = 0.12;
  const mat = metalRoofMaterial();

  return (
    <group position={[cx, storyHeightM, cz]}>
      {roof.ridgeAlongX ? (
        <mesh
          position={[0, riseM / 2, 0]}
          rotation={[0, 0, pitch]}
          castShadow
          receiveShadow
          material={mat}
        >
          <boxGeometry args={[slopeLen, thick, d + overhang * 2]} />
        </mesh>
      ) : (
        <mesh
          position={[0, riseM / 2, 0]}
          rotation={[pitch, 0, 0]}
          castShadow
          receiveShadow
          material={mat}
        >
          <boxGeometry args={[w + overhang * 2, thick, slopeLen]} />
        </mesh>
      )}
    </group>
  );
}

function CadGableRoofFallback({
  roof,
  storyHeightM,
  envelope,
}: {
  roof: CadRoofMassing;
  storyHeightM: number;
  envelope: Envelope;
}) {
  const w = Math.max(0.5, envelope.maxX - envelope.minX);
  const d = Math.max(0.5, envelope.maxZ - envelope.minZ);
  const cx = (envelope.minX + envelope.maxX) / 2;
  const cz = (envelope.minZ + envelope.maxZ) / 2;
  const overhang = roof.overhangM;
  const riseM = Math.max(0.35, roof.ridgeHeightM - storyHeightM);
  const ridgeAlongX = roof.ridgeAlongX;
  const halfSpan = (ridgeAlongX ? w : d) / 2;
  const slopeLen = Math.hypot(halfSpan, riseM);
  const pitch = Math.atan2(riseM, halfSpan);
  const mat = roof.style === 'dxf' ? tileRoofMaterial() : metalRoofMaterial();
  const thick = 0.12;

  return (
    <group position={[cx, storyHeightM, cz]}>
      {ridgeAlongX ? (
        <>
          <mesh position={[-halfSpan / 2, riseM / 2, 0]} rotation={[0, 0, pitch]} castShadow receiveShadow material={mat}>
            <boxGeometry args={[slopeLen, thick, d + overhang * 2]} />
          </mesh>
          <mesh position={[halfSpan / 2, riseM / 2, 0]} rotation={[0, 0, -pitch]} castShadow receiveShadow material={mat}>
            <boxGeometry args={[slopeLen, thick, d + overhang * 2]} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, riseM / 2, -halfSpan / 2]} rotation={[pitch, 0, 0]} castShadow receiveShadow material={mat}>
            <boxGeometry args={[w + overhang * 2, thick, slopeLen]} />
          </mesh>
          <mesh position={[0, riseM / 2, halfSpan / 2]} rotation={[-pitch, 0, 0]} castShadow receiveShadow material={mat}>
            <boxGeometry args={[w + overhang * 2, thick, slopeLen]} />
          </mesh>
        </>
      )}
    </group>
  );
}
