import { Detailed, useGLTF, useTexture } from '@react-three/drei';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Group } from 'three';
import type { FurnitureItem } from '../../types';

function useFittedClone(scene: Group, width: number, depth: number, height: number) {
  const clone = useMemo(() => scene.clone(true) as Group, [scene]);
  const group = useRef<Group>(null);
  useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    if (size.x < 1e-4 || size.y < 1e-4 || size.z < 1e-4) return;
    const scale = Math.min(width / size.x, height / size.y, depth / size.z);
    const center = box.getCenter(new THREE.Vector3());
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    if (group.current) group.current.updateMatrixWorld(true);
  }, [clone, width, depth, height]);
  return { clone, group };
}

export function CatalogModel({
  lowUrl,
  fullUrl,
  width,
  depth,
  height,
}: {
  lowUrl: string;
  fullUrl: string;
  width: number;
  depth: number;
  height: number;
}) {
  const low = useGLTF(lowUrl);
  const full = useGLTF(fullUrl);
  const fittedFull = useFittedClone(full.scene as Group, width, depth, height);
  const fittedLow = useFittedClone(low.scene as Group, width, depth, height);

  useEffect(
    () => () => {
      [fittedFull.clone, fittedLow.clone].forEach((scene) =>
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
    [fittedFull.clone, fittedLow.clone],
  );

  return (
    <Detailed distances={[0, 8]}>
      <group ref={fittedFull.group}>
        <primitive object={fittedFull.clone} />
      </group>
      <group ref={fittedLow.group}>
        <primitive object={fittedLow.clone} />
      </group>
    </Detailed>
  );
}

function SelectionHalo({
  width,
  depth,
  height,
  selected,
  colliding,
}: {
  width: number;
  depth: number;
  height: number;
  selected?: boolean;
  colliding?: boolean;
}) {
  if (!selected && !colliding) return null;
  const color = colliding ? '#c0392b' : '#0058a3';
  const opacity = colliding ? 0.28 : 0.2;
  return (
    <mesh position={[0, height / 2, 0]}>
      <boxGeometry args={[width * 1.04, height * 1.04, depth * 1.04]} />
      <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

function TexturedArt({
  width,
  height,
  depth,
  color,
  url,
  mirror,
}: {
  width: number;
  height: number;
  depth: number;
  color: string;
  url: string;
  mirror?: boolean;
}) {
  const texture = useTexture(url);
  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <>
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={mirror ? 0.35 : 0.05} />
      </mesh>
      <mesh position={[0, height / 2, depth / 2 + 0.003]}>
        <planeGeometry args={[width * (mirror ? 0.9 : 0.86), height * (mirror ? 0.9 : 0.86)]} />
        {mirror ? (
          <meshPhysicalMaterial map={texture} roughness={0.12} metalness={0.85} clearcoat={0.4} />
        ) : (
          <meshStandardMaterial map={texture} roughness={0.9} />
        )}
      </mesh>
    </>
  );
}

export function ProxyFurniture({
  item,
  colliding,
  selected,
  textureUrl,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  item: FurnitureItem;
  colliding?: boolean;
  selected?: boolean;
  textureUrl?: string;
  onSelect?: (e: any) => void;
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerCancel?: (e: any) => void;
}) {
  const color = item.color;
  const handlers = { onClick: onSelect, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
  const category = item.category.toLowerCase();
  const name = item.name.toLowerCase();
  const halo = <SelectionHalo width={item.width} depth={item.depth} height={item.height} selected={selected} colliding={colliding} />;

  if (textureUrl && (item.mountingType === 'wall' || name.includes('picture') || name.includes('mirror') || name.includes('art'))) {
    return (
      <group {...handlers}>
        <Suspense
          fallback={
            <mesh position={[0, item.height / 2, 0]}>
              <boxGeometry args={[item.width, item.height, item.depth]} />
              <meshStandardMaterial color={color} />
            </mesh>
          }
        >
          <TexturedArt
            width={item.width}
            height={item.height}
            depth={item.depth}
            color={color}
            url={textureUrl}
            mirror={name.includes('mirror')}
          />
        </Suspense>
        {halo}
      </group>
    );
  }

  if (name.includes('mirror') || (name.includes('window panel') && item.mountingType === 'wall')) {
    return (
      <group {...handlers}>
        <mesh position={[0, item.height / 2, 0]} castShadow>
          <boxGeometry args={[item.width, item.height, item.depth]} />
          <meshStandardMaterial color="#2c3034" roughness={0.45} metalness={0.4} />
        </mesh>
        <mesh position={[0, item.height / 2, item.depth / 2 + 0.002]}>
          <planeGeometry args={[item.width * 0.88, item.height * 0.88]} />
          <meshPhysicalMaterial
            color={name.includes('window') ? '#bce4ec' : '#c5d0d8'}
            roughness={0.08}
            metalness={name.includes('mirror') ? 0.9 : 0.1}
            transmission={name.includes('window') ? 0.55 : 0}
            thickness={0.02}
            transparent={name.includes('window')}
            opacity={name.includes('window') ? 0.65 : 1}
          />
        </mesh>
        {halo}
      </group>
    );
  }

  if (category.includes('textile') || name.includes('rug')) {
    return (
      <group {...handlers}>
        <mesh position={[0, Math.max(0.01, item.height / 2), 0]} receiveShadow>
          <boxGeometry args={[item.width, Math.max(0.02, item.height), item.depth]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
        {halo}
      </group>
    );
  }

  if (category.includes('light') && item.mountingType === 'wall') {
    return (
      <group {...handlers}>
        <mesh position={[0, item.height / 2, 0]} castShadow>
          <boxGeometry args={[item.width, item.height, item.depth]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.35} />
        </mesh>
        <mesh position={[0, item.height / 2, item.depth / 2 + 0.02]}>
          <sphereGeometry args={[Math.min(item.width, item.height) * 0.28, 16, 16]} />
          <meshStandardMaterial color="#fff6d8" emissive="#ffd978" emissiveIntensity={0.65} />
        </mesh>
        {halo}
      </group>
    );
  }

  if (category === 'bedroom' || name.includes('bed')) {
    return (
      <group {...handlers}>
        <mesh position={[0, item.height * 0.35, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width, item.height * 0.45, item.depth]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
        <mesh position={[0, item.height * 0.7, -item.depth * 0.42]} castShadow>
          <boxGeometry args={[item.width, item.height * 0.55, item.depth * 0.12]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {halo}
      </group>
    );
  }

  if (category === 'lighting') {
    return (
      <group {...handlers}>
        <mesh position={[0, item.height * 0.05, 0]} castShadow>
          <cylinderGeometry args={[item.width * 0.25, item.width * 0.3, item.height * 0.08, 16]} />
          <meshStandardMaterial color="#444" metalness={0.4} roughness={0.45} />
        </mesh>
        <mesh position={[0, item.height * 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, item.height * 0.8, 8]} />
          <meshStandardMaterial color="#333" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, item.height * 0.9, 0]}>
          <sphereGeometry args={[item.width * 0.22, 16, 16]} />
          <meshStandardMaterial color="#fff4d0" emissive="#ffe08a" emissiveIntensity={0.5} />
        </mesh>
        {halo}
      </group>
    );
  }

  return (
    <group {...handlers}>
      <mesh position={[0, item.height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, item.height, item.depth]} />
        <meshStandardMaterial color={color} roughness={0.78} metalness={0.04} />
      </mesh>
      {halo}
    </group>
  );
}

export function FurnitureVisual({
  item,
  lowUrl,
  fullUrl,
  textureUrl,
  colliding,
  selected,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  item: FurnitureItem;
  lowUrl?: string;
  fullUrl?: string;
  textureUrl?: string;
  colliding?: boolean;
  selected?: boolean;
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
        selected={selected}
        textureUrl={textureUrl}
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
      <Suspense fallback={<ProxyFurniture item={item} colliding={colliding} selected={selected} textureUrl={textureUrl} />}>
        <CatalogModel lowUrl={low} fullUrl={full} width={item.width} depth={item.depth} height={item.height} />
      </Suspense>
      <SelectionHalo width={item.width} depth={item.depth} height={item.height} selected={selected} colliding={colliding} />
    </group>
  );
}
