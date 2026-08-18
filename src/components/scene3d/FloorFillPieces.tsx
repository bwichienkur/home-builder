import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Point } from '../../types';
import { catalog } from '../catalog/catalogData';
import { useInventoryStore } from '../../store/inventoryStore';
import { roomPolygonWorld, roomShapeWithHoles } from '../../lib/geometry/rooms';
import {
  FLOOR_FILL_TOP_Y,
  floorPieceSpec,
  layoutFloorPieces,
  type FloorHole,
  type FloorPieceSpec,
} from '../../lib/geometry/floorFillLayout';
import { CatalogSurfaceMaterial } from './CatalogSurfaceMaterial';

const dummy = new THREE.Object3D();

function groutColor(spec: FloorPieceSpec, name: string, fallback: string) {
  const n = name.toLowerCase();
  if (spec.kind === 'running-bond' && (n.includes('oak') || n.includes('walnut') || n.includes('ash') || n.includes('wood'))) {
    return '#5c4634';
  }
  if (spec.kind === 'running-bond') return '#6a6d70';
  if (spec.kind === 'hex') return '#8d867c';
  if (spec.kind === 'grid') return '#c4bfb6';
  return fallback;
}

function PieceMaterial({
  color,
  product,
  pieceSpan,
  opacity,
  transparent,
  depthWrite,
}: {
  color: string;
  product: {
    textureUrl?: string;
    roughnessMapUrl?: string;
    normalMapUrl?: string;
    metalnessMapUrl?: string;
    textureRepeat?: number;
    roughness?: number;
  };
  pieceSpan: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}) {
  return (
    <CatalogSurfaceMaterial
      color={color}
      maps={
        product.textureUrl
          ? {
              textureUrl: product.textureUrl,
              roughnessMapUrl: product.roughnessMapUrl,
              normalMapUrl: product.normalMapUrl,
              metalnessMapUrl: product.metalnessMapUrl,
              textureRepeat: Math.max(pieceSpan, product.textureRepeat ?? pieceSpan),
              roughness: product.roughness,
            }
          : undefined
      }
      worldSpan={pieceSpan}
      roughness={product.roughness}
      opacity={opacity}
      transparent={transparent}
      depthWrite={depthWrite}
      side={THREE.DoubleSide}
    />
  );
}

/**
 * Real 3D floor fill: instanced planks/tiles (or an extruded slab) using catalog dims.
 * A grout / underlayment plate keeps clicks and stair holes working.
 */
export function FloorFillPieces({
  points,
  holes = [],
  catalogId,
  color,
  opacity,
  transparent,
  depthWrite,
  onClick,
}: {
  points: Point[];
  holes?: FloorHole[];
  catalogId: string;
  color: string;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  onClick?: (e: any) => void;
}) {
  const inventory = useInventoryStore((s) => s.items);
  const product = useMemo(
    () => inventory.find((i) => i.id === catalogId) || catalog.find((i) => i.id === catalogId),
    [catalogId, inventory],
  );
  const polygon = useMemo(() => roomPolygonWorld(points), [points]);
  const spec = useMemo(
    () =>
      floorPieceSpec({
        dims: product?.dims ?? [0.3, 0.012, 0.3],
        name: product?.name,
        subcategory: product?.subcategory,
        category: product?.category,
      }),
    [product],
  );
  const poses = useMemo(
    () => layoutFloorPieces({ polygon, spec, holes }),
    [polygon, spec, holes],
  );
  const mesh = useRef<THREE.InstancedMesh>(null);
  const shape = useMemo(() => roomShapeWithHoles(points, holes), [points, holes]);

  useLayoutEffect(() => {
    const inst = mesh.current;
    if (!inst) return;
    poses.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.count = poses.length;
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
  }, [poses]);

  const groutY = FLOOR_FILL_TOP_Y - spec.thickness - 0.003;
  const underlay = (
    <mesh
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, groutY, 0]}
      receiveShadow
      onClick={onClick}
    >
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        color={groutColor(spec, product?.name ?? '', color)}
        roughness={0.92}
        side={THREE.DoubleSide}
        transparent={transparent}
        opacity={opacity}
        depthWrite={depthWrite}
      />
    </mesh>
  );

  if (!product) return underlay;

  if (spec.kind === 'slab' || poses.length === 0) {
    return (
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, FLOOR_FILL_TOP_Y, 0]} receiveShadow onClick={onClick}>
        <extrudeGeometry args={[shape, { depth: spec.thickness, bevelEnabled: false, steps: 1 }]} />
        <PieceMaterial
          color={color}
          product={product}
          pieceSpan={Math.max(spec.width, spec.length, 1)}
          opacity={opacity}
          transparent={transparent}
          depthWrite={depthWrite}
        />
      </mesh>
    );
  }

  const count = Math.max(poses.length, 1);
  const pieceSpan = Math.max(spec.width, spec.length);
  return (
    <group>
      {underlay}
      <instancedMesh
        key={`${catalogId}-${spec.kind}-${count}`}
        ref={mesh}
        args={[undefined, undefined, count]}
        receiveShadow
        frustumCulled={false}
        onClick={onClick}
      >
        {spec.kind === 'hex' ? (
          <cylinderGeometry args={[spec.width / Math.sqrt(3), spec.width / Math.sqrt(3), spec.thickness, 6]} />
        ) : (
          <boxGeometry args={[spec.width, spec.thickness, spec.length]} />
        )}
        <PieceMaterial
          color={color}
          product={product}
          pieceSpan={pieceSpan}
          opacity={opacity}
          transparent={transparent}
          depthWrite={depthWrite}
        />
      </instancedMesh>
    </group>
  );
}
