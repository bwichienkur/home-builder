/** CC0 surface packs (ambientCG) for proxy millwork / soft goods. */
export type SurfacePack = {
  textureUrl: string;
  roughnessMapUrl: string;
  normalMapUrl: string;
  metalnessMapUrl?: string;
  textureRepeat: number;
  roughness: number;
  metalness?: number;
};

export const SURFACE_PACKS = {
  oak: {
    textureUrl: '/catalog/materials/pbr/oak/color.jpg',
    roughnessMapUrl: '/catalog/materials/pbr/oak/rough.jpg',
    normalMapUrl: '/catalog/materials/pbr/oak/normal.jpg',
    textureRepeat: 0.45,
    roughness: 0.7,
  },
  walnut: {
    textureUrl: '/catalog/materials/pbr/walnut/color.jpg',
    roughnessMapUrl: '/catalog/materials/pbr/walnut/rough.jpg',
    normalMapUrl: '/catalog/materials/pbr/walnut/normal.jpg',
    textureRepeat: 0.5,
    roughness: 0.65,
  },
  painted: {
    textureUrl: '/catalog/materials/pbr/painted/color.jpg',
    roughnessMapUrl: '/catalog/materials/pbr/painted/rough.jpg',
    normalMapUrl: '/catalog/materials/pbr/painted/normal.jpg',
    textureRepeat: 1.2,
    roughness: 0.55,
  },
  marble: {
    textureUrl: '/catalog/materials/pbr/marble/color.jpg',
    roughnessMapUrl: '/catalog/materials/pbr/marble/rough.jpg',
    normalMapUrl: '/catalog/materials/pbr/marble/normal.jpg',
    textureRepeat: 0.9,
    roughness: 0.28,
  },
  quartz: {
    textureUrl: '/catalog/materials/pbr/quartz/color.jpg',
    roughnessMapUrl: '/catalog/materials/pbr/quartz/rough.jpg',
    normalMapUrl: '/catalog/materials/pbr/quartz/normal.jpg',
    textureRepeat: 0.85,
    roughness: 0.35,
  },
  metal: {
    textureUrl: '/catalog/materials/pbr/metal/color.jpg',
    roughnessMapUrl: '/catalog/materials/pbr/metal/rough.jpg',
    normalMapUrl: '/catalog/materials/pbr/metal/normal.jpg',
    metalnessMapUrl: '/catalog/materials/pbr/metal/metal.jpg',
    textureRepeat: 0.6,
    roughness: 0.35,
    metalness: 0.85,
  },
  fabric: {
    textureUrl: '/catalog/materials/pbr/fabric/color.jpg',
    roughnessMapUrl: '/catalog/materials/pbr/fabric/rough.jpg',
    normalMapUrl: '/catalog/materials/pbr/fabric/normal.jpg',
    textureRepeat: 0.35,
    roughness: 0.92,
  },
} as const satisfies Record<string, SurfacePack>;

export type SurfacePackId = keyof typeof SURFACE_PACKS;

/** Poly Haven CC0 glTF (1K) under /public/catalog/models. */
export const MODEL_PACKS = {
  sofa: {
    modelUrl: '/catalog/models/sofa/sofa.gltf',
    lowPolyModelUrl: '/catalog/models/sofa/sofa.gltf',
  },
  sofaAlt: {
    modelUrl: '/catalog/models/sofa-alt/sofa-alt.gltf',
    lowPolyModelUrl: '/catalog/models/sofa-alt/sofa-alt.gltf',
  },
  diningTable: {
    modelUrl: '/catalog/models/dining-table/dining-table.gltf',
    lowPolyModelUrl: '/catalog/models/dining-table/dining-table.gltf',
  },
  coffeeTable: {
    modelUrl: '/catalog/models/coffee-table/coffee-table.gltf',
    lowPolyModelUrl: '/catalog/models/coffee-table/coffee-table.gltf',
  },
  console: {
    modelUrl: '/catalog/models/console/console.gltf',
    lowPolyModelUrl: '/catalog/models/console/console.gltf',
  },
  armchair: {
    modelUrl: '/catalog/models/armchair/armchair.gltf',
    lowPolyModelUrl: '/catalog/models/armchair/armchair.gltf',
  },
  loungeChair: {
    modelUrl: '/catalog/models/lounge-chair/lounge-chair.gltf',
    lowPolyModelUrl: '/catalog/models/lounge-chair/lounge-chair.gltf',
  },
  sideTable: {
    modelUrl: '/catalog/models/side-table/side-table.gltf',
    lowPolyModelUrl: '/catalog/models/side-table/side-table.gltf',
  },
} as const;

type Enrichable = {
  id: string;
  name: string;
  category: string;
  color: string;
  textureUrl?: string;
  roughnessMapUrl?: string;
  normalMapUrl?: string;
  metalnessMapUrl?: string;
  textureRepeat?: number;
  roughness?: number;
  modelUrl?: string;
  lowPolyModelUrl?: string;
  placeholderOnly?: boolean;
  placementMode?: string;
};

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.6;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function withSurface<T extends Enrichable>(item: T, pack: SurfacePack): T {
  if (item.textureUrl) return item;
  return { ...item, ...pack };
}

function withModel<T extends Enrichable>(item: T, pack: { modelUrl: string; lowPolyModelUrl: string }): T {
  if (item.modelUrl) return item;
  return { ...item, ...pack, placeholderOnly: false };
}

/**
 * Attach free CC0 materials / hero GLBs to residential catalog rows.
 * Brand SKUs in the legacy catalog are enriched separately where safe.
 */
export function enrichCatalogSurfaces<T extends Enrichable>(items: T[]): T[] {
  return items.map((item) => {
    const id = item.id;
    const name = item.name.toLowerCase();
    const cat = item.category.toLowerCase();

    // Hero furniture — Poly Haven glTF
    if (id === 'sofa-three-seat' || id === 'linen-sofa') return withModel(item, MODEL_PACKS.sofa);
    if (id === 'loveseat' || id === 'sectional-chaise') return withModel(item, MODEL_PACKS.sofaAlt);
    if (id.startsWith('dining-table-')) return withModel(item, MODEL_PACKS.diningTable);
    if (id === 'coffee-table-rectangular' || id === 'coffee-table-round') return withModel(item, MODEL_PACKS.coffeeTable);
    if (id === 'console-entry' || id === 'console-living' || id === 'media-console' || id === 'sideboard') {
      return withModel(item, MODEL_PACKS.console);
    }
    if (id === 'dining-side-chair' || id === 'office-task-chair') return withModel(item, MODEL_PACKS.armchair);
    if (id === 'accent-lounge-chair') return withModel(item, MODEL_PACKS.loungeChair);
    if (id === 'nightstand-drawer' || id === 'end-table') return withModel(item, MODEL_PACKS.sideTable);

    // Millwork / soft-goods proxies — ambientCG PBR
    if (cat === 'trim' || name.includes('crown') || name.includes('baseboard') || name.includes('chair rail')) {
      return withSurface(item, SURFACE_PACKS.painted);
    }
    if (
      cat === 'cabinetry' ||
      name.includes('cabinet') ||
      name.includes('vanity') ||
      name.includes('pantry') ||
      (name.includes('island') && !name.includes('top'))
    ) {
      return withSurface(item, luminance(item.color) > 0.72 ? SURFACE_PACKS.painted : SURFACE_PACKS.oak);
    }
    if (
      name.includes('counter') ||
      name.includes('countertop') ||
      name.includes('island top') ||
      name.includes('vanity top') ||
      (cat.includes('surface') && !name.includes('paint'))
    ) {
      return withSurface(item, luminance(item.color) > 0.75 ? SURFACE_PACKS.marble : SURFACE_PACKS.quartz);
    }
    if (name.includes('bed') || cat === 'bedroom') {
      return withSurface(item, SURFACE_PACKS.oak);
    }
    if (name.includes('dresser') || name.includes('bookshelf') || name.includes('bookcase') || name.includes('desk')) {
      return withSurface(item, SURFACE_PACKS.walnut);
    }
    if (name.includes('fridge') || name.includes('dishwasher') || name.includes('range') || name.includes('washer') || name.includes('dryer')) {
      return withSurface(item, SURFACE_PACKS.metal);
    }
    if ((cat.includes('seating') || name.includes('sofa') || name.includes('chair')) && !item.modelUrl) {
      return withSurface(item, SURFACE_PACKS.fabric);
    }
    if (name.includes('table') || name.includes('console')) {
      return withSurface(item, SURFACE_PACKS.oak);
    }
    return item;
  });
}
