import { ContactShadows, Environment, Sky } from '@react-three/drei';

/** Shared outdoor lighting for CAD Studio 3D views. */
export function CadSceneEnvironment({
  sunPosition = [40, 28, 20] as [number, number, number],
  targetY = 2.8,
  shadows = true,
  richEnvironment = false,
}: {
  sunPosition?: [number, number, number];
  targetY?: number;
  shadows?: boolean;
  /** Stronger HDRI / sky for presentation & photoreal. */
  richEnvironment?: boolean;
}) {
  return (
    <>
      <Sky
        sunPosition={sunPosition}
        turbidity={richEnvironment ? 2.5 : 4}
        rayleigh={richEnvironment ? 1.2 : 2}
        mieCoefficient={richEnvironment ? 0.003 : 0.004}
      />
      <Environment
        preset={richEnvironment ? 'sunset' : 'city'}
        environmentIntensity={richEnvironment ? 0.7 : 0.35}
      />
      <ambientLight intensity={richEnvironment ? 0.22 : 0.28} />
      <hemisphereLight args={['#dbeafe', '#78716c', richEnvironment ? 0.55 : 0.45]} />
      <directionalLight
        position={sunPosition}
        intensity={richEnvironment ? 1.65 : 1.35}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={120}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-12, 8, -10]} intensity={richEnvironment ? 0.35 : 0.25} />
      {shadows && (
        <ContactShadows
          position={[0, 0.002, 0]}
          opacity={richEnvironment ? 0.55 : 0.45}
          scale={80}
          blur={richEnvironment ? 2.2 : 2.5}
          far={30}
          resolution={512}
        />
      )}
    </>
  );
}

export function CadGroundPlane({
  size,
  siteContext = false,
}: {
  size: number;
  /** Lawn + drive pad for presentation / photoreal. */
  siteContext?: boolean;
}) {
  if (siteContext) {
    return (
      <>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]} receiveShadow>
          <planeGeometry args={[size * 1.35, size * 1.35]} />
          <meshStandardMaterial color="#5f7d4e" roughness={0.98} metalness={0} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.008, 0]} receiveShadow>
          <planeGeometry args={[size * 1.05, size * 1.05]} />
          <meshStandardMaterial color="#6f8f5c" roughness={0.96} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[size * 0.22, -0.006, size * 0.18]} receiveShadow>
          <planeGeometry args={[size * 0.42, size * 0.28]} />
          <meshStandardMaterial color="#7a7f88" roughness={0.9} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} receiveShadow>
          <planeGeometry args={[size * 0.72, size * 0.72]} />
          <meshStandardMaterial color="#c4b49a" roughness={0.92} />
        </mesh>
      </>
    );
  }
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
