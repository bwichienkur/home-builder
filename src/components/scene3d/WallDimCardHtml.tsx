import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import type { WallDimPlacement } from '../../lib/geometry/roomWalls';

const GAP_PX = 52;

/**
 * Screen-space L/W/H card: project the exterior wall-face anchor, then push the
 * card fully clear with CSS px (zoom-independent). World-meter Html offsets
 * were still landing on the wall at wall-focus zoom.
 */
export function WallDimCardHtml({
  facePos,
  placement,
  children,
}: {
  facePos: [number, number, number];
  placement: WallDimPlacement;
  children: ReactNode;
}) {
  const { camera, size, gl } = useThree();
  const vec = useMemo(() => new THREE.Vector3(), []);
  const [screen, setScreen] = useState({ x: 0, y: 0, ok: false });

  useFrame(() => {
    vec.set(facePos[0], facePos[1], facePos[2]);
    vec.project(camera);
    const x = (vec.x * 0.5 + 0.5) * size.width;
    const y = (-vec.y * 0.5 + 0.5) * size.height;
    const ok = vec.z < 1 && Number.isFinite(x) && Number.isFinite(y);
    setScreen((prev) => (Math.abs(prev.x - x) < 0.25 && Math.abs(prev.y - y) < 0.25 && prev.ok === ok ? prev : { x, y, ok }));
  });

  const transform =
    placement === 'top'
      ? `translate(-50%, calc(-100% - ${GAP_PX}px))`
      : placement === 'bottom'
        ? `translate(-50%, ${GAP_PX}px)`
        : placement === 'left'
          ? `translate(calc(-100% - ${GAP_PX}px), -50%)`
          : `translate(${GAP_PX}px, -50%)`;

  const host = gl.domElement.parentElement;
  if (!host) return null;

  return createPortal(
    <div
      className="wall-dim-card-screen"
      style={{
        position: 'absolute',
        left: screen.x,
        top: screen.y,
        transform,
        zIndex: 45,
        pointerEvents: screen.ok ? 'auto' : 'none',
        opacity: screen.ok ? 1 : 0,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    host,
  );
}
