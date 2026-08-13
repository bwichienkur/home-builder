import { Detailed, useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import type { Group } from 'three';
import type { FurnitureItem } from '../../types';

export function CatalogModel({ lowUrl, fullUrl }: { lowUrl: string; fullUrl: string }) {
  const low = useGLTF(lowUrl);
  const full = useGLTF(fullUrl);
  const scenes = useMemo(() => [full.scene.clone(true), low.scene.clone(true)] as Group[], [full.scene, low.scene]);

  useEffect(
    () => () => {
      scenes.forEach((scene) =>
        scene.traverse((obj) => {
          const mesh = obj as any;
          mesh.geometry?.dispose?.();
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.filter(Boolean).forEach((m: any) => {
            Object.values(m).forEach((v: any) => v?.isTexture && v.dispose());
            m.dispose?.();
          });
        }),
      );
    },
    [scenes],
  );

  return (
    <Detailed distances={[0, 8]}>
      {scenes.map((scene, i) => (
        <primitive key={i} object={scene} />
      ))}
    </Detailed>
  );
}

export function ProxyFurniture({
  item,
  colliding,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  item: FurnitureItem;
  colliding?: boolean;
  onSelect?: (e: any) => void;
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerCancel?: (e: any) => void;
}) {
  return (
    <mesh
      position={[0, item.height / 2, 0]}
      scale={[item.width, item.height, item.depth]}
      castShadow
      receiveShadow
      onClick={onSelect}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <boxGeometry />
      <meshStandardMaterial
        color={colliding ? '#d94a45' : item.color}
        roughness={0.78}
        metalness={0.04}
        emissive={colliding ? '#4a1010' : '#000000'}
        emissiveIntensity={colliding ? 0.12 : 0}
      />
    </mesh>
  );
}

export function FurnitureVisual({
  item,
  lowUrl,
  fullUrl,
  colliding,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  item: FurnitureItem;
  lowUrl?: string;
  fullUrl?: string;
  colliding?: boolean;
  onSelect?: (e: any) => void;
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerCancel?: (e: any) => void;
}) {
  if (!lowUrl && !fullUrl) {
    return (
      <ProxyFurniture
        item={item}
        colliding={colliding}
        onSelect={onSelect}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    );
  }

  const low = lowUrl || fullUrl!;
  const full = fullUrl || lowUrl!;

  return (
    <group onClick={onSelect} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
      <Suspense fallback={<ProxyFurniture item={item} colliding={colliding} />}>
        <group position={[0, 0, 0]}>
          <CatalogModel lowUrl={low} fullUrl={full} />
        </group>
      </Suspense>
      {colliding && (
        <mesh position={[0, item.height / 2, 0]} scale={[item.width * 1.02, item.height * 1.02, item.depth * 1.02]}>
          <boxGeometry />
          <meshStandardMaterial color="#d94a45" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
