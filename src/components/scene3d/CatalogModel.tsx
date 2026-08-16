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

  if (item.placementKind === 'stair' || name === 'stair' || category.includes('circulation')) {
    const steps = Math.max(3, item.stair?.steps ?? 12);
    const rise = item.stair?.riseM ?? Math.max(item.height > 1 ? item.height : 2.7, 2.4);
    const run = item.stair?.runM ?? Math.max(item.depth - (item.stair?.landingM ?? 0), item.depth * 0.75);
    const landing = item.stair?.landingM ?? Math.max(0, item.depth - run);
    const tread = run / steps;
    return (
      <group {...handlers}>
        {Array.from({ length: steps }, (_, i) => (
          <mesh
            key={i}
            position={[0, rise * ((i + 0.5) / steps), -item.depth / 2 + tread * (i + 0.5)]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[item.width, rise / steps, tread * 0.92]} />
            <meshStandardMaterial color={color} roughness={0.78} />
          </mesh>
        ))}
        {landing > 0.05 && (
          <mesh position={[0, rise, item.depth / 2 - landing / 2]} castShadow receiveShadow>
            <boxGeometry args={[item.width, 0.08, landing]} />
            <meshStandardMaterial color={color} roughness={0.72} />
          </mesh>
        )}
        <mesh position={[-item.width / 2 + 0.03, rise * 0.55, -landing / 2]} castShadow>
          <boxGeometry args={[0.04, rise * 0.9, item.depth - landing]} />
          <meshStandardMaterial color="#6e5844" roughness={0.7} />
        </mesh>
        <mesh position={[item.width / 2 - 0.03, rise * 0.55, -landing / 2]} castShadow>
          <boxGeometry args={[0.04, rise * 0.9, item.depth - landing]} />
          <meshStandardMaterial color="#6e5844" roughness={0.7} />
        </mesh>
        {halo}
      </group>
    );
  }

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
    const frame = '#6e5340';
    const linen = color;
    return (
      <group {...handlers}>
        {/* Platform / box spring */}
        <mesh position={[0, item.height * 0.22, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width * 0.96, item.height * 0.28, item.depth * 0.92]} />
          <meshStandardMaterial color={frame} roughness={0.75} />
        </mesh>
        {/* Mattress */}
        <mesh position={[0, item.height * 0.42, 0.02]} castShadow receiveShadow>
          <boxGeometry args={[item.width * 0.9, item.height * 0.22, item.depth * 0.84]} />
          <meshStandardMaterial color={linen} roughness={0.9} />
        </mesh>
        {/* Pillows */}
        <mesh position={[-item.width * 0.22, item.height * 0.58, -item.depth * 0.28]} castShadow>
          <boxGeometry args={[item.width * 0.32, item.height * 0.12, item.depth * 0.18]} />
          <meshStandardMaterial color="#f2ebe3" roughness={0.92} />
        </mesh>
        <mesh position={[item.width * 0.22, item.height * 0.58, -item.depth * 0.28]} castShadow>
          <boxGeometry args={[item.width * 0.32, item.height * 0.12, item.depth * 0.18]} />
          <meshStandardMaterial color="#f2ebe3" roughness={0.92} />
        </mesh>
        {/* Headboard */}
        <mesh position={[0, item.height * 0.7, -item.depth * 0.44]} castShadow>
          <boxGeometry args={[item.width, item.height * 0.55, item.depth * 0.08]} />
          <meshStandardMaterial color={frame} roughness={0.7} />
        </mesh>
        {halo}
      </group>
    );
  }

  if (name.includes('sofa') || name.includes('loveseat') || name.includes('sectional') || (category.includes('seating') && name.includes('sofa'))) {
    const seatH = item.height * 0.42;
    return (
      <group {...handlers}>
        <mesh position={[0, seatH * 0.55, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width, seatH, item.depth * 0.9]} />
          <meshStandardMaterial color={color} roughness={0.88} />
        </mesh>
        <mesh position={[0, item.height * 0.72, -item.depth * 0.32]} castShadow>
          <boxGeometry args={[item.width * 0.98, item.height * 0.5, item.depth * 0.28]} />
          <meshStandardMaterial color={color} roughness={0.86} />
        </mesh>
        <mesh position={[-item.width * 0.46, item.height * 0.55, 0]} castShadow>
          <boxGeometry args={[item.width * 0.1, item.height * 0.55, item.depth * 0.88]} />
          <meshStandardMaterial color={color} roughness={0.84} />
        </mesh>
        <mesh position={[item.width * 0.46, item.height * 0.55, 0]} castShadow>
          <boxGeometry args={[item.width * 0.1, item.height * 0.55, item.depth * 0.88]} />
          <meshStandardMaterial color={color} roughness={0.84} />
        </mesh>
        {halo}
      </group>
    );
  }

  if (name.includes('chair') || name.includes('lounge')) {
    return (
      <group {...handlers}>
        <mesh position={[0, item.height * 0.42, 0.02]} castShadow receiveShadow>
          <boxGeometry args={[item.width * 0.9, item.height * 0.1, item.depth * 0.7]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        <mesh position={[0, item.height * 0.7, -item.depth * 0.28]} castShadow>
          <boxGeometry args={[item.width * 0.88, item.height * 0.45, item.depth * 0.12]} />
          <meshStandardMaterial color={color} roughness={0.78} />
        </mesh>
        {[
          [-0.35, -0.35],
          [0.35, -0.35],
          [-0.35, 0.32],
          [0.35, 0.32],
        ].map(([lx, lz], i) => (
          <mesh key={i} position={[item.width * lx, item.height * 0.2, item.depth * lz]} castShadow>
            <cylinderGeometry args={[0.02, 0.025, item.height * 0.4, 8]} />
            <meshStandardMaterial color="#4a3a2c" roughness={0.55} metalness={0.15} />
          </mesh>
        ))}
        {halo}
      </group>
    );
  }

  if (name.includes('stool')) {
    return (
      <group {...handlers}>
        <mesh position={[0, item.height * 0.72, 0]} castShadow>
          <cylinderGeometry args={[item.width * 0.35, item.width * 0.38, item.height * 0.08, 20]} />
          <meshStandardMaterial color={color} roughness={0.75} />
        </mesh>
        <mesh position={[0, item.height * 0.36, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.035, item.height * 0.65, 10]} />
          <meshStandardMaterial color="#555" metalness={0.45} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.03, 0]} receiveShadow>
          <cylinderGeometry args={[item.width * 0.32, item.width * 0.32, 0.04, 20]} />
          <meshStandardMaterial color="#444" metalness={0.35} roughness={0.5} />
        </mesh>
        {halo}
      </group>
    );
  }

  if (name.includes('toilet') || (category.includes('plumbing') && name.includes('toilet'))) {
    return (
      <group {...handlers}>
        <mesh position={[0, item.height * 0.72, -item.depth * 0.15]} castShadow>
          <boxGeometry args={[item.width * 0.7, item.height * 0.45, item.depth * 0.45]} />
          <meshStandardMaterial color="#f2f2f2" roughness={0.35} />
        </mesh>
        <mesh position={[0, item.height * 0.32, item.depth * 0.08]} castShadow receiveShadow>
          <cylinderGeometry args={[item.width * 0.38, item.width * 0.42, item.height * 0.35, 20]} />
          <meshStandardMaterial color="#f7f7f7" roughness={0.32} />
        </mesh>
        <mesh position={[0, item.height * 0.5, item.depth * 0.08]} castShadow>
          <cylinderGeometry args={[item.width * 0.34, item.width * 0.34, 0.04, 20]} />
          <meshStandardMaterial color="#e8e8e8" roughness={0.4} />
        </mesh>
        {halo}
      </group>
    );
  }

  if (name.includes('shower')) {
    return (
      <group {...handlers}>
        <mesh position={[0, 0.04, 0]} receiveShadow>
          <boxGeometry args={[item.width, 0.08, item.depth]} />
          <meshStandardMaterial color="#d5d8db" roughness={0.55} />
        </mesh>
        <mesh position={[0, item.height * 0.5, -item.depth * 0.48]}>
          <boxGeometry args={[item.width, item.height, 0.02]} />
          <meshPhysicalMaterial color="#d9eef2" roughness={0.08} transmission={0.65} thickness={0.02} transparent opacity={0.55} />
        </mesh>
        <mesh position={[-item.width * 0.48, item.height * 0.5, 0]}>
          <boxGeometry args={[0.02, item.height, item.depth]} />
          <meshPhysicalMaterial color="#d9eef2" roughness={0.08} transmission={0.65} thickness={0.02} transparent opacity={0.55} />
        </mesh>
        <mesh position={[item.width * 0.35, item.height * 0.75, -item.depth * 0.4]} castShadow>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#c0c4c6" metalness={0.8} roughness={0.25} />
        </mesh>
        {halo}
      </group>
    );
  }

  if (
    name.includes('counter') ||
    name.includes('countertop') ||
    name.includes('island top') ||
    (category.includes('surface') && item.height < 0.12)
  ) {
    return (
      <group {...handlers}>
        <mesh position={[0, item.height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width, item.height, item.depth]} />
          <meshStandardMaterial color={color} roughness={0.28} metalness={0.08} />
        </mesh>
        <mesh position={[0, item.height * 0.92, 0]}>
          <boxGeometry args={[item.width * 0.995, item.height * 0.15, item.depth * 0.995]} />
          <meshPhysicalMaterial color={color} roughness={0.18} clearcoat={0.45} clearcoatRoughness={0.25} />
        </mesh>
        {halo}
      </group>
    );
  }

  if (name.includes('island') || name.includes('base cab') || name.includes('cabinet') || name.includes('vanity') || name.includes('pantry') || category.includes('cabinetry')) {
    const topH = Math.min(0.04, item.height * 0.06);
    const bodyH = item.height - topH;
    return (
      <group {...handlers}>
        <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width, bodyH, item.depth]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Door reveals */}
        <mesh position={[-item.width * 0.22, bodyH * 0.55, item.depth / 2 + 0.004]}>
          <planeGeometry args={[item.width * 0.38, bodyH * 0.7]} />
          <meshStandardMaterial color={color} roughness={0.62} />
        </mesh>
        <mesh position={[item.width * 0.22, bodyH * 0.55, item.depth / 2 + 0.004]}>
          <planeGeometry args={[item.width * 0.38, bodyH * 0.7]} />
          <meshStandardMaterial color={color} roughness={0.62} />
        </mesh>
        <mesh position={[-item.width * 0.08, bodyH * 0.55, item.depth / 2 + 0.008]} castShadow>
          <boxGeometry args={[0.015, 0.06, 0.02]} />
          <meshStandardMaterial color="#b0b0b0" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[item.width * 0.08, bodyH * 0.55, item.depth / 2 + 0.008]} castShadow>
          <boxGeometry args={[0.015, 0.06, 0.02]} />
          <meshStandardMaterial color="#b0b0b0" metalness={0.7} roughness={0.3} />
        </mesh>
        {name.includes('island') && (
          <mesh position={[0, bodyH + topH / 2, 0]} castShadow>
            <boxGeometry args={[item.width * 1.04, topH, item.depth * 1.04]} />
            <meshStandardMaterial color="#cfd4d5" roughness={0.25} />
          </mesh>
        )}
        {/* Toe kick */}
        <mesh position={[0, 0.05, item.depth * 0.02]} castShadow>
          <boxGeometry args={[item.width * 0.98, 0.1, item.depth * 0.9]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.85} />
        </mesh>
        {halo}
      </group>
    );
  }

  if (name.includes('nightstand') || name.includes('dresser') || name.includes('drawer') || name.includes('filing')) {
    return (
      <group {...handlers}>
        <mesh position={[0, item.height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width, item.height, item.depth]} />
          <meshStandardMaterial color={color} roughness={0.72} />
        </mesh>
        {[0.28, 0.55, 0.78].map((t, i) =>
          t * item.height < item.height - 0.05 ? (
            <mesh key={i} position={[0, item.height * t, item.depth / 2 + 0.005]} castShadow>
              <boxGeometry args={[item.width * 0.82, item.height * 0.16, 0.02]} />
              <meshStandardMaterial color={color} roughness={0.65} />
            </mesh>
          ) : null,
        )}
        {halo}
      </group>
    );
  }

  if (name.includes('bookshelf') || name.includes('bookcase')) {
    const shelves = 4;
    return (
      <group {...handlers}>
        <mesh position={[-item.width / 2 + 0.02, item.height / 2, 0]} castShadow>
          <boxGeometry args={[0.04, item.height, item.depth]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        <mesh position={[item.width / 2 - 0.02, item.height / 2, 0]} castShadow>
          <boxGeometry args={[0.04, item.height, item.depth]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {Array.from({ length: shelves + 1 }, (_, i) => (
          <mesh key={i} position={[0, (i / shelves) * item.height, 0]} castShadow receiveShadow>
            <boxGeometry args={[item.width, 0.03, item.depth]} />
            <meshStandardMaterial color={color} roughness={0.68} />
          </mesh>
        ))}
        {/* Book blocks */}
        <mesh position={[-item.width * 0.2, item.height * 0.2, 0]} castShadow>
          <boxGeometry args={[0.12, item.height * 0.16, item.depth * 0.7]} />
          <meshStandardMaterial color="#6b4f36" roughness={0.85} />
        </mesh>
        <mesh position={[0.05, item.height * 0.45, 0]} castShadow>
          <boxGeometry args={[0.1, item.height * 0.14, item.depth * 0.65]} />
          <meshStandardMaterial color="#8a6548" roughness={0.85} />
        </mesh>
        {halo}
      </group>
    );
  }

  if (name.includes('table') || name.includes('desk') || name.includes('console') || category.includes('table')) {
    const topH = Math.min(0.06, item.height * 0.1);
    return (
      <group {...handlers}>
        <mesh position={[0, item.height - topH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width, topH, item.depth]} />
          <meshStandardMaterial color={color} roughness={0.55} />
        </mesh>
        {[
          [-0.42, -0.4],
          [0.42, -0.4],
          [-0.42, 0.4],
          [0.42, 0.4],
        ].map(([lx, lz], i) => (
          <mesh key={i} position={[item.width * lx, (item.height - topH) / 2, item.depth * lz]} castShadow>
            <boxGeometry args={[0.05, item.height - topH, 0.05]} />
            <meshStandardMaterial color="#5a4030" roughness={0.65} />
          </mesh>
        ))}
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
