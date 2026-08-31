/**
 * First-person walkthrough: WASD + look, wall collision with door/passage portals.
 * Desktop: pointer-lock look. Mobile/coarse: drag-to-look + on-screen stick.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { usePlannerStore } from '../../store/plannerStore';
import { WORLD_ORIGIN } from '../../lib/geometry/placement';
import { PIXELS_PER_METER } from '../../lib/geometry/snapping';
import type { Opening, PlanRoomLabel, Wall } from '../../types';

const EYE_H = 1.55;
const SPEED = 3.2;
const LOOK_SENS = 0.0022;
const TOUCH_LOOK_SENS = 0.0035;
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
    if (Math.hypot(x - px, z - pz) < s.thick / 2 + WALL_PAD) return true;
  }
  return false;
}

/** Wall collision segments with door/passage openings cut out as portals. */
export function wallCollisionSegs(walls: Wall[], openings: Opening[]): Seg[] {
  const out: Seg[] = [];
  for (const w of walls) {
    const [ax, az] = worldXZ(w.start.x, w.start.y);
    const [bx, bz] = worldXZ(w.end.x, w.end.y);
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1e-6;
    const portals = openings
      .filter((o) => o.wallId === w.id && (o.type === 'door' || o.type === 'passage'))
      .map((o) => {
        const center = o.offset * len;
        return {
          a: Math.max(0, center - o.width / 2 - 0.08),
          b: Math.min(len, center + o.width / 2 + 0.08),
        };
      })
      .sort((a, b) => a.a - b.a);
    let cursor = 0;
    const ranges: { a: number; b: number }[] = [];
    for (const p of portals) {
      if (p.a > cursor + 0.05) ranges.push({ a: cursor, b: p.a });
      cursor = Math.max(cursor, p.b);
    }
    if (cursor < len - 0.05) ranges.push({ a: cursor, b: len });
    if (!ranges.length) ranges.push({ a: 0, b: len });
    for (const r of ranges) {
      out.push({
        ax: ax + (dx * r.a) / len,
        az: az + (dz * r.a) / len,
        bx: ax + (dx * r.b) / len,
        bz: az + (dz * r.b) / len,
        thick: w.thickness,
      });
    }
  }
  return out;
}

function pickSpawnRoom(planRooms: PlanRoomLabel[], selectedRoomId: string | null): PlanRoomLabel | undefined {
  if (selectedRoomId) {
    const focused = planRooms.find((r) => r.id === selectedRoomId);
    if (focused) return focused;
  }
  for (const re of [/FOYER|ENTRY|VESTIBULE/i, /GREAT|LIVING|FAMILY/i]) {
    const hit = planRooms.find((r) => re.test(r.name));
    if (hit) return hit;
  }
  return planRooms[0];
}

function WalkMobileHud({
  onStick,
  onLookDelta,
}: {
  onStick: (x: number, y: number) => void;
  onLookDelta: (dx: number, dy: number) => void;
}) {
  const stickRef = useRef<HTMLDivElement>(null);
  const lookActive = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = stickRef.current;
    if (!el) return;
    const setFromTouch = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const nx = Math.max(-1, Math.min(1, (clientX - cx) / (rect.width / 2)));
      const ny = Math.max(-1, Math.min(1, (clientY - cy) / (rect.height / 2)));
      onStick(nx, -ny);
    };
    const clear = () => onStick(0, 0);
    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (t) setFromTouch(t.clientX, t.clientY);
    };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (t) setFromTouch(t.clientX, t.clientY);
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', clear);
    el.addEventListener('touchcancel', clear);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', clear);
      el.removeEventListener('touchcancel', clear);
    };
  }, [onStick]);

  useEffect(() => {
    const onStart = (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.closest?.('.walk-stick')) return;
      lookActive.current = true;
      last.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!lookActive.current || !last.current) return;
      onLookDelta(e.clientX - last.current.x, e.clientY - last.current.y);
      last.current = { x: e.clientX, y: e.clientY };
    };
    const onEnd = () => {
      lookActive.current = false;
      last.current = null;
    };
    window.addEventListener('pointerdown', onStart);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    return () => {
      window.removeEventListener('pointerdown', onStart);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
    };
  }, [onLookDelta]);

  return createPortal(
    <div className="walk-mobile-hud" aria-hidden="true">
      <div className="walk-stick" ref={stickRef}>
        <span>Move</span>
      </div>
      <p className="walk-mobile-hint">Drag to look · stick to walk · Esc exits</p>
    </div>,
    document.body,
  );
}

export function FirstPersonControls() {
  const mode = usePlannerStore((s) => s.cameraMode);
  const setCameraMode = usePlannerStore((s) => s.setCameraMode);
  const walls = usePlannerStore((s) => s.walls);
  const openings = usePlannerStore((s) => s.openings);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const selectedRoomId = usePlannerStore((s) => s.selectedRoomId);
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });
  const yaw = useRef(0);
  const pitch = useRef(0);
  const pos = useRef(new THREE.Vector3(0, EYE_H, 0));
  const primed = useRef(false);
  const locked = useRef(false);
  const [coarse, setCoarse] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  );

  const segs = useRef<Seg[]>([]);
  useEffect(() => {
    segs.current = wallCollisionSegs(walls, openings);
  }, [walls, openings]);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(pointer: coarse)');
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (mode !== 'firstPerson') {
      primed.current = false;
      return;
    }
    const room = pickSpawnRoom(planRooms, selectedRoomId);
    if (room && room.points.length >= 3) {
      const xs = room.points.map((p) => (p.x - WORLD_ORIGIN.x) / PIXELS_PER_METER);
      const zs = room.points.map((p) => (p.y - WORLD_ORIGIN.y) / PIXELS_PER_METER);
      pos.current.set((Math.min(...xs) + Math.max(...xs)) / 2, EYE_H, (Math.min(...zs) + Math.max(...zs)) / 2);
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
      if (e.code === 'Escape') {
        if (document.pointerLockElement === el) document.exitPointerLock();
        setCameraMode('orbit');
        e.preventDefault();
        return;
      }
      keys.current.add(e.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onClick = () => {
      if (!coarse && !locked.current) void el.requestPointerLock();
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
  }, [mode, gl, setCameraMode, coarse]);

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
    if (stick.current.x || stick.current.y) {
      wish.addScaledVector(forward, stick.current.y);
      wish.addScaledVector(right, stick.current.x);
    }
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

  if (mode !== 'firstPerson' || !coarse || typeof document === 'undefined') return null;

  return (
    <WalkMobileHud
      onStick={(x, y) => {
        stick.current = { x, y };
      }}
      onLookDelta={(dx, dy) => {
        yaw.current -= dx * TOUCH_LOOK_SENS;
        pitch.current -= dy * TOUCH_LOOK_SENS;
        pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current));
      }}
    />
  );
}
