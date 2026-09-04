import * as THREE from 'three';

/** Warm stucco exterior wall. */
export function exteriorWallMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#e8e2d6',
    roughness: 0.88,
    metalness: 0.02,
  });
}

/** Interior partition wall. */
const interiorMatSolid = new THREE.MeshStandardMaterial({
  color: '#f5f2eb',
  roughness: 0.9,
  metalness: 0,
});

const interiorMatGhost = new THREE.MeshStandardMaterial({
  color: '#f5f2eb',
  roughness: 0.9,
  metalness: 0,
  transparent: true,
  opacity: 0.14,
  depthWrite: false,
});

export function interiorWallMaterial(opacity = 1): THREE.MeshStandardMaterial {
  if (opacity >= 0.99) return interiorMatSolid;
  return interiorMatGhost;
}

/** Tile roof surface. */
export function tileRoofMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#8b7355',
    roughness: 0.82,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
}

/** Metal roof accent (dormers). */
export function metalRoofMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#64748b',
    roughness: 0.35,
    metalness: 0.55,
    side: THREE.DoubleSide,
  });
}

/** Window glass. */
export function windowGlassMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#87ceeb',
    roughness: 0.05,
    metalness: 0.2,
    transparent: true,
    opacity: 0.42,
    envMapIntensity: 1.2,
  });
}

/** Window/door frame. */
export function openingFrameMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#4a5568',
    roughness: 0.65,
    metalness: 0.08,
  });
}

/** Door slab. */
export function doorMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#3d3429',
    roughness: 0.72,
    metalness: 0.05,
  });
}

/** Stone veneer from elevation layers. */
export function stoneMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#9ca3af',
    roughness: 0.92,
    metalness: 0.01,
  });
}

/** Procedural stucco noise texture (cached). */
let stuccoTex: THREE.CanvasTexture | null = null;

export function stuccoNormalTexture(): THREE.CanvasTexture {
  if (stuccoTex) return stuccoTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 800; i++) {
    const g = 110 + Math.floor(Math.random() * 35);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  stuccoTex = new THREE.CanvasTexture(canvas);
  stuccoTex.wrapS = stuccoTex.wrapT = THREE.RepeatWrapping;
  stuccoTex.repeat.set(4, 2);
  return stuccoTex;
}

let exteriorTexMat: THREE.MeshStandardMaterial | null = null;

export function exteriorWallMaterialTextured(): THREE.MeshStandardMaterial {
  if (!exteriorTexMat) {
    const bump = stuccoNormalTexture();
    exteriorTexMat = new THREE.MeshStandardMaterial({
      color: '#ebe5d9',
      roughness: 0.92,
      metalness: 0.02,
      bumpMap: bump,
      bumpScale: 0.015,
    });
  }
  return exteriorTexMat;
}

/** Layer-aware facade material (cached by key). */
const facadeMatCache = new Map<string, THREE.MeshStandardMaterial>();

export function facadeMaterialForLayer(role: string, layer: string): THREE.MeshStandardMaterial {
  const u = layer.toUpperCase();
  const key = `${role}:${u.slice(0, 24)}`;
  const hit = facadeMatCache.get(key);
  if (hit) return hit;

  let mat: THREE.MeshStandardMaterial;
  if (/ROOF|TRUSS|RAFTER|GABLE|SOFFIT|TILE/i.test(u)) {
    mat = tileRoofMaterial();
  } else if (/METAL/i.test(u)) {
    mat = metalRoofMaterial();
  } else if (role === 'opening' || /WINDOW|GLAZ/i.test(u)) {
    mat = windowGlassMaterial();
  } else if (/DOOR|GARAGE|OPEN/i.test(u)) {
    mat = doorMaterial();
  } else if (/STONE|BRG|COLUMN|PORCH|HATCH/i.test(u)) {
    mat = stoneMaterial();
  } else {
    mat = exteriorWallMaterialTextured();
  }
  facadeMatCache.set(key, mat);
  return mat;
}

export function clearFacadeMaterialCache(): void {
  facadeMatCache.forEach((m) => m.dispose());
  facadeMatCache.clear();
}

const paintCache = new Map<string, THREE.MeshStandardMaterial>();

/** CAD Studio wall paint / finish presets. */
export function wallPaintMaterial(
  materialId: string | undefined,
  assembly?: string,
  opacity = 1,
): THREE.MeshStandardMaterial {
  if (!materialId || materialId === 'interior') {
    return interiorWallMaterial(opacity);
  }
  if (materialId === 'stucco' && (!assembly || assembly === 'exterior')) {
    return exteriorWallMaterialTextured();
  }
  const key = `${materialId}:${opacity.toFixed(2)}`;
  const hit = paintCache.get(key);
  if (hit) return hit;

  const presets: Record<string, { color: string; roughness: number; metalness: number }> = {
    stucco: { color: '#ebe5d9', roughness: 0.92, metalness: 0.02 },
    paint: { color: '#f8fafc', roughness: 0.86, metalness: 0 },
    brick: { color: '#b4532a', roughness: 0.9, metalness: 0.02 },
    stone: { color: '#9ca3af', roughness: 0.93, metalness: 0.01 },
    wood: { color: '#a16207', roughness: 0.78, metalness: 0.04 },
  };
  const p = presets[materialId] ?? presets.paint!;
  const mat = new THREE.MeshStandardMaterial({
    color: p.color,
    roughness: p.roughness,
    metalness: p.metalness,
    transparent: opacity < 0.99,
    opacity,
    depthWrite: opacity >= 0.99,
  });
  paintCache.set(key, mat);
  return mat;
}

export const CAD_WALL_MATERIALS = [
  { id: 'stucco', label: 'Stucco' },
  { id: 'paint', label: 'Paint' },
  { id: 'brick', label: 'Brick' },
  { id: 'stone', label: 'Stone' },
  { id: 'wood', label: 'Wood' },
  { id: 'interior', label: 'Interior' },
] as const;

export function wallStrokeForMaterial(materialId: string | undefined, exterior?: boolean): string {
  switch (materialId) {
    case 'brick':
      return '#b4532a';
    case 'stone':
      return '#78716c';
    case 'wood':
      return '#a16207';
    case 'paint':
      return '#64748b';
    case 'stucco':
      return '#92400e';
    default:
      return exterior ? '#1e293b' : '#334155';
  }
}
