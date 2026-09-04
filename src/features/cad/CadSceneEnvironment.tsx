import { ContactShadows, Environment, Sky } from '@react-three/drei';

/** Shared outdoor lighting for CAD Studio 3D views. */
export function CadSceneEnvironment({
  sunPosition = [40, 28, 20] as [number, number, number],
  targetY = 2.8,
  shadows = true,
}: {
  sunPosition?: [number, number, number];
  targetY?: number;
  shadows?: boolean;
}) {
  return (
    <>
      <Sky sunPosition={sunPosition} turbidity={4} rayleigh={2} mieCoefficient={0.004} />
      <Environment preset="city" environmentIntensity={0.35} />
      <ambientLight intensity={0.28} />
      <hemisphereLight args={['#dbeafe', '#78716c', 0.45]} />
      <directionalLight
        position={sunPosition}
        intensity={1.35}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={120}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-12, 8, -10]} intensity={0.25} />
      {shadows && (
        <ContactShadows
          position={[0, 0.002, 0]}
          opacity={0.45}
          scale={80}
          blur={2.5}
          far={30}
          resolution={512}
        />
      )}
    </>
  );
}

export function CadGroundPlane({ size }: { size: number }) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.008, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#b8a88a" roughness={0.95} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} receiveShadow>
        <planeGeometry args={[size * 0.85, size * 0.85]} />
        <meshStandardMaterial color="#c4b49a" roughness={0.92} />
      </mesh>
    </>
  );
}
