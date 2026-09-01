import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { CadExtrusion } from '../../lib/cadStudio';
import { world } from '../../components/scene3d/sceneWorld';
import type { Opening, Wall } from '../../types';

function WallMesh({ wall, openings }: { wall: Wall; openings: Opening[] }) {
  const [sx, sz] = world(wall.start.x, wall.start.y);
  const [ex, ez] = world(wall.end.x, wall.end.y);
  const dx = ex - sx;
  const dz = ez - sz;
  const len = Math.hypot(dx, dz) || 0.01;
  const angle = Math.atan2(dz, dx);
  const mid: [number, number, number] = [(sx + ex) / 2, wall.height / 2, (sz + ez) / 2];
  const wallOpenings = openings.filter((o) => o.wallId === wall.id);

  return (
    <group position={mid} rotation={[0, -angle, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[len, wall.height, wall.thickness]} />
        <meshStandardMaterial color={wall.assembly === 'exterior' ? '#e8e2d6' : '#f3f0e9'} />
      </mesh>
      {wallOpenings.map((o) => {
        const localX = (o.offset - 0.5) * len;
        const y = o.sill + o.height / 2;
        return (
          <mesh key={o.id} position={[localX, y - wall.height / 2, 0]}>
            <boxGeometry args={[o.width, o.height, wall.thickness + 0.04]} />
            <meshStandardMaterial
              color={o.type === 'window' ? '#7dd3fc' : '#1e293b'}
              transparent={o.type === 'window'}
              opacity={o.type === 'window' ? 0.45 : 0.9}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Scene({ extrusion }: { extrusion: CadExtrusion }) {
  const { walls, openings } = extrusion;
  const floorSize = useMemo(() => {
    if (!walls.length) return 20;
    let max = 10;
    for (const w of walls) {
      const [x1, z1] = world(w.start.x, w.start.y);
      const [x2, z2] = world(w.end.x, w.end.y);
      max = Math.max(max, Math.abs(x1), Math.abs(z1), Math.abs(x2), Math.abs(z2));
    }
    return max * 2.4;
  }, [walls]);

  return (
    <>
      <color attach="background" args={['#dfe5ec']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color="#c9b18f" />
      </mesh>
      <gridHelper
        args={[floorSize, Math.max(10, Math.round(floorSize)), '#94a3b8', '#cbd5e1']}
        position={[0, 0.001, 0]}
      />
      {walls.map((w) => (
        <WallMesh key={w.id} wall={w} openings={openings} />
      ))}
      <OrbitControls makeDefault target={[0, 1.2, 0]} />
    </>
  );
}

export function CadExtrudeView({ extrusion }: { extrusion: CadExtrusion }) {
  if (!extrusion.walls.length) {
    return (
      <div className="cad-empty">No wall centerlines to extrude yet. Import a DXF with wall layers.</div>
    );
  }
  return (
    <div className="cad-extrude-host">
      <Canvas
        shadows
        camera={{ position: [18, 14, 18], fov: 42, near: 0.1, far: 500 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.shadowMap.enabled = true;
        }}
      >
        <Scene extrusion={extrusion} />
      </Canvas>
    </div>
  );
}
