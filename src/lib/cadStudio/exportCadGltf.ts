import type { CadExtrusion, CadPlate } from './types';
import { extrudeCadPlate } from './extrudeCadPlate';

const FT_TO_M = 0.3048;

type Vec3 = [number, number, number];

function boxMesh(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  name: string,
): { name: string; positions: number[]; indices: number[] } {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const corners: Vec3[] = [
    [cx - hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz],
    [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz],
    [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz],
    [cx - hx, cy + hy, cz + hz],
  ];
  return {
    name,
    positions: corners.flat(),
    indices: [
      0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 2, 6, 7, 2, 7, 3, 0, 3, 7, 0, 7, 4, 1, 5, 6,
      1, 6, 2,
    ],
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/**
 * Minimal glTF 2.0 JSON from a CadExtrusion (walls + slabs as boxes).
 * Suitable for Twinmotion / Blender / glTF viewers (X-06).
 */
export function exportCadExtrusionGltf(extrusion: CadExtrusion): string {
  const meshes: ReturnType<typeof boxMesh>[] = [];
  const { centerFt } = extrusion;

  for (let i = 0; i < extrusion.wallSegmentsFt.length; i++) {
    const s = extrusion.wallSegmentsFt[i]!;
    const mx = ((s.x1 + s.x2) / 2 - centerFt.cx) * FT_TO_M;
    const mz = ((s.y1 + s.y2) / 2 - centerFt.cy) * FT_TO_M;
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * FT_TO_M;
    const thick = (s.exterior ? 0.59 : 0.39) * FT_TO_M;
    const h = extrusion.heightM;
    const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const sx = Math.abs(Math.cos(ang)) * len + Math.abs(Math.sin(ang)) * thick;
    const sz = Math.abs(Math.sin(ang)) * len + Math.abs(Math.cos(ang)) * thick;
    meshes.push(boxMesh(mx, h / 2, mz, Math.max(0.05, sx), h, Math.max(0.05, sz), `wall-${i}`));
  }

  for (const slab of extrusion.slabs) {
    if (slab.kind === 'plot') continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of slab.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const cx = ((minX + maxX) / 2 - centerFt.cx) * FT_TO_M;
    const cz = ((minY + maxY) / 2 - centerFt.cy) * FT_TO_M;
    const sx = Math.max(0.1, (maxX - minX) * FT_TO_M);
    const sz = Math.max(0.1, (maxY - minY) * FT_TO_M);
    const sy = Math.max(0.02, slab.thicknessFt * FT_TO_M);
    const cy = slab.elevationFt * FT_TO_M + sy / 2;
    meshes.push(boxMesh(cx, cy, cz, sx, sy, sz, slab.id));
  }

  if (!meshes.length) {
    meshes.push(boxMesh(0, 0.5, 0, 1, 1, 1, 'placeholder'));
  }

  const accessors: unknown[] = [];
  const bufferViews: unknown[] = [];
  const glMeshes: unknown[] = [];
  const nodes: unknown[] = [];
  const binParts: Uint8Array[] = [];
  let offset = 0;

  const pushF32 = (arr: number[]) => {
    const buf = new ArrayBuffer(arr.length * 4);
    new Float32Array(buf).set(arr);
    return new Uint8Array(buf);
  };
  const pushU16 = (arr: number[]) => {
    const buf = new ArrayBuffer(arr.length * 2);
    new Uint16Array(buf).set(arr);
    return new Uint8Array(buf);
  };

  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i]!;
    const posBytes = pushF32(m.positions);
    const idxBytes = pushU16(m.indices);
    const posPad = (4 - (posBytes.length % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: posBytes.length, target: 34962 });
    binParts.push(posBytes);
    if (posPad) binParts.push(new Uint8Array(posPad));
    offset += posBytes.length + posPad;

    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: idxBytes.length, target: 34963 });
    binParts.push(idxBytes);
    const idxPad = (4 - (idxBytes.length % 4)) % 4;
    if (idxPad) binParts.push(new Uint8Array(idxPad));
    offset += idxBytes.length + idxPad;

    const posAccIdx = accessors.length;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let p = 0; p < m.positions.length; p += 3) {
      minX = Math.min(minX, m.positions[p]!);
      minY = Math.min(minY, m.positions[p + 1]!);
      minZ = Math.min(minZ, m.positions[p + 2]!);
      maxX = Math.max(maxX, m.positions[p]!);
      maxY = Math.max(maxY, m.positions[p + 1]!);
      maxZ = Math.max(maxZ, m.positions[p + 2]!);
    }
    accessors.push({
      bufferView: bufferViews.length - 2,
      componentType: 5126,
      count: m.positions.length / 3,
      type: 'VEC3',
      max: [maxX, maxY, maxZ],
      min: [minX, minY, minZ],
    });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5123,
      count: m.indices.length,
      type: 'SCALAR',
    });

    glMeshes.push({
      name: m.name,
      primitives: [{ attributes: { POSITION: posAccIdx }, indices: posAccIdx + 1, mode: 4 }],
    });
    nodes.push({ mesh: i, name: m.name });
  }

  const totalLen = binParts.reduce((s, b) => s + b.length, 0);
  const merged = new Uint8Array(totalLen);
  let o = 0;
  for (const b of binParts) {
    merged.set(b, o);
    o += b.length;
  }

  const doc = {
    asset: { version: '2.0', generator: 'Olsen CAD Studio' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: glMeshes,
    accessors,
    bufferViews,
    buffers: [
      {
        byteLength: totalLen,
        uri: `data:application/octet-stream;base64,${bytesToBase64(merged)}`,
      },
    ],
  };
  return JSON.stringify(doc, null, 2);
}

export function exportCadPlateGltf(plate: CadPlate): string {
  return exportCadExtrusionGltf(extrudeCadPlate(plate));
}
