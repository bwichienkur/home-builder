/**
 * First-person walkthrough controls for Plan-derived 3D scenes.
 * WASD + pointer-lock look; simple wall collision from wall segments.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { usePlannerStore } from '../../store/plannerStore';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';

const EYE_H = 1.55;
const SPEED = 3.2;
const LOOK_SENS = 0.0022;
const WALL_PAD = 0.28;

function worldXZ(px: number, py: number): [number, number] {
  return [(px - WORLD_ORIGIN.x) / PIXELS_PER_METER, (py - WORLD_ORIGIN.y) / PIXELS_PER_METER];
}

type Seg = { ax: number; az: number; bx: number; bz: number; thick: number };

function collides(x: number, z: number, segs: Seg[]): boolean {
  for (const s of segs) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const len2 = dx * dx + dz * dz || 1e-6;
    let t = ((x - s.ax) * dx + (z - s.az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = s.ax + t * dx;
    const pz = s.az + t * dz;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < s.thick / 2 + WALL_PAD) return true;
  }
  return false;
}

export function FirstPersonControls() {
  const mode = usePlannerStore((s) => s.cameraMode);
  const walls = usePlannerStore((s) => s.walls);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const pos = useRef(new THREE.Vector3(0, EYE_H, 0));
  const primed = useRef(false);
  const locked = useRef(false);

  const segs = useRef<Seg[]>([]);
  useEffect(() => {
    segs.current = walls.map((w) => {
      const [ax, az] = worldXZ(w.start.x, w.start.y);
      const [bx, bz] = worldXZ(w.end.x, w.end.y);
      return { ax, az, bx, bz, thick: w.thickness };
    });
  }, [walls]);

  // Seed camera inside focused room (or plate center).
  useEffect(() => {
    if (mode !== 'firstPerson') {
      primed.current = false;
      return;
    }
    const room = planRooms.find((r) => r.id === selectedRoomId) ?? planRooms[0];
    if (room && room.points.length >= 3) {
      const xs = room.points.map((p) => (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER);
      const zs = room.points.map((p) => (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER);
      pos.current.set(
        (Math.min(...xs) + Math.max(...xs)) / 2,
        EYE_H,
        (Math.min(...zs) + Math.max(...zs)) / 2,
      );
    } else if (walls.length) {
      const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
      const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
      const [cx, cz] = worldXZ((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
      pos.current.set(cx, EYE_H, cz);
    }
    yaw.current = 0;
    pitch.current = 0;
    primed.current = true;
    camera.position.copy(pos.current);
    camera.rotation.set(0, 0, 0);
    camera.up.set(0, 1, 0);
  }, [mode, selectedRoomId, planRooms, walls, camera]);

  useEffect(() => {
    if (mode !== 'firstPerson') return;
    const el = gl.domElement;
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onClick = () => {
      if (!locked.current) void el.requestPointerLock();
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === el;
    };
    const onMove = (e: MouseEvent) => {
      if (!locked.current) return;
      yaw.current -= e.movementX * LOOK_SENS;
      pitch.current -= e.movementY * LOOK_SENS;
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current));
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    el.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMove);
      if (document.pointerLockElement === el) document.exitPointerLock();
      locked.current = false;
    };
  }, [mode, gl]);

  useFrame((_, dt) => {
    if (mode !== 'firstPerson' || !primed.current) return;
    const k = keys.current;
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current));
    const wish = new THREE.Vector3();
    if (k.has('KeyW') || k.has('ArrowUp')) wish.add(forward);
    if (k.has('KeyS') || k.has('ArrowDown')) wish.sub(forward);
    if (k.has('KeyD') || k.has('ArrowRight')) wish.add(right);
    if (k.has('KeyA') || k.has('ArrowLeft')) wish.sub(right);
    if (wish.lengthSq() > 0) {
      wish.normalize().multiplyScalar(SPEED * Math.min(dt, 0.05));
      const nx = pos.current.x + wish.x;
      const nz = pos.current.z + wish.z;
      if (!collides(nx, pos.current.z, segs.current)) pos.current.x = nx;
      if (!collides(pos.current.x, nz, segs.current)) pos.current.z = nz;
    }
    pos.current.y = EYE_H;
    camera.position.copy(pos.current);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
  });

  return null;
}
