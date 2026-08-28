/** Shared Olsen Cost Library → Build catalog mapping (used by build-olsen-catalog.mjs). */

/** Client-facing selection tabs — excludes pure labor / GPS / structural cost tables. */
export const SELECTION_SOURCE_TABS = new Set([
  'Countertops',
  'Tile-Floor',
  'Tile-Wall',
  'Tile - Backsplash',
  'Tile - Pan',
  'Tile - Listel 4"',
  'Interior Doors',
  'Ext. Door Install',
  'PGT Windows',
  'Stone',
  'Stone-Eldorado',
  'Plumbing',
  'Trim Material',
  'Shaker Drs',
  'Upgrade Shaker Drs',
  'Shelves - Mantles - Beams',
  'Summer Kitchen',
  'Railing - Shutters',
  'Specialties',
  'Tankless Heater',
  'Pavers',
]);

export const EXCLUDED_SECTION_PATTERNS = [
  /labor/i,
  /rate table/i,
  /historical/i,
  /electrical gps/i,
  /material pricing$/i,
  /roofing rate/i,
];

/** Representative proxy dimensions in meters [width, depth, height]. */
export const DEFAULT_DIMS = {
  countertop: [3.048, 0.6477, 0.03],
  tile: [0.4572, 0.012, 0.4572],
  tileListel: [0.1016, 0.025, 0.0508],
  door: [0.9144, 0.0445, 2.1336],
  window: [1.2192, 0.127, 1.524],
  plumbing: [0.22, 0.18, 0.25],
  cabinet: [0.9144, 0.6096, 0.8763],
  stonePanel: [1.2192, 0.0175, 2.4384],
  trim: [1, 0.015, 0.09],
  appliance: [0.9144, 0.6096, 2.1336],
  default: [0.6, 0.6, 0.6],
};

export const TAB_CATEGORY = {
  Countertops: { category: 'Surfaces', subcategory: 'Countertop' },
  'Tile-Floor': { category: 'Tile', subcategory: 'Floor' },
  'Tile-Wall': { category: 'Tile', subcategory: 'Wall' },
  'Tile - Backsplash': { category: 'Tile', subcategory: 'Backsplash' },
  'Tile - Pan': { category: 'Tile', subcategory: 'Shower pan' },
  'Tile - Listel 4"': { category: 'Trim', subcategory: 'Tile listel' },
  'Interior Doors': { category: 'Doors', subcategory: 'Interior' },
  'Ext. Door Install': { category: 'Doors', subcategory: 'Exterior' },
  'PGT Windows': { category: 'Windows', subcategory: 'PGT' },
  Stone: { category: 'Surfaces', subcategory: 'Stone' },
  'Stone-Eldorado': { category: 'Paneling', subcategory: 'Eldorado stone' },
  Plumbing: { category: 'Plumbing', subcategory: 'Fixtures' },
  'Trim Material': { category: 'Trim', subcategory: 'Material' },
  'Shaker Drs': { category: 'Cabinetry', subcategory: 'Shaker doors' },
  'Upgrade Shaker Drs': { category: 'Cabinetry', subcategory: 'Upgrade shaker' },
  'Shelves - Mantles - Beams': { category: 'Decor', subcategory: 'Millwork' },
  'Summer Kitchen': { category: 'Appliances', subcategory: 'Outdoor kitchen' },
  'Railing - Shutters': { category: 'Exterior', subcategory: 'Railing' },
  Specialties: { category: 'Specialties', subcategory: 'Misc' },
  'Tankless Heater': { category: 'Plumbing', subcategory: 'Water heater' },
  Pavers: { category: 'Surfaces', subcategory: 'Pavers' },
};

export const TAB_ROOMS = {
  Countertops: ['Kitchen', 'Bathroom', 'Laundry'],
  'Tile-Floor': ['Bathroom', 'Kitchen', 'Laundry', 'Hallway', 'Living room'],
  'Tile-Wall': ['Bathroom', 'Kitchen', 'Laundry'],
  'Tile - Backsplash': ['Kitchen', 'Bathroom', 'Laundry'],
  'Tile - Pan': ['Bathroom'],
  'Tile - Listel 4"': ['Bathroom', 'Kitchen'],
  'Interior Doors': ['Bedroom', 'Hallway', 'Bathroom', 'Office', 'Laundry'],
  'Ext. Door Install': ['Hallway', 'Outdoor'],
  'PGT Windows': ['Bedroom', 'Living room', 'Kitchen', 'Bathroom', 'Office'],
  Plumbing: ['Bathroom', 'Kitchen', 'Laundry'],
  'Trim Material': ['Bedroom', 'Living room', 'Dining room', 'Hallway', 'Kitchen', 'Bathroom'],
  'Shaker Drs': ['Kitchen', 'Bathroom', 'Laundry'],
  'Upgrade Shaker Drs': ['Kitchen', 'Bathroom', 'Laundry'],
  'Stone-Eldorado': ['Living room', 'Outdoor', 'Hallway'],
  'Summer Kitchen': ['Outdoor', 'Kitchen'],
};

export const TAB_PLACEMENT = {
  Countertops: { placementMode: 'floor-fill', mountingType: 'floor', surfaces: ['floor'] },
  'Tile-Floor': { placementMode: 'floor-fill', mountingType: 'floor', surfaces: ['floor'] },
  'Tile-Wall': { placementMode: 'wall-art', mountingType: 'wall', surfaces: ['wall'] },
  'Tile - Backsplash': { placementMode: 'wall-art', mountingType: 'wall', surfaces: ['wall'] },
  'Tile - Pan': { placementMode: 'floor-fill', mountingType: 'floor', surfaces: ['floor'] },
  'Tile - Listel 4"': { placementMode: 'floor-perimeter', mountingType: 'floor', surfaces: ['floor'] },
  'Interior Doors': { mountingType: 'floor', surfaces: ['floor'] },
  'Ext. Door Install': { mountingType: 'floor', surfaces: ['floor'] },
  'PGT Windows': { mountingType: 'wall', surfaces: ['wall'] },
  'Trim Material': { placementMode: 'floor-perimeter', mountingType: 'floor', surfaces: ['floor'] },
};

export const UNIT_MAP = {
  SF: 'sq ft',
  TSF: 'sq ft',
  SQ: 'sq ft',
  LF: 'linear ft',
  EA: 'each',
  TOTAL: 'each',
  'PER BOX': 'box',
};

export const TEXTURE_BY_TAB = {
  Countertops: {
    textureUrl: '/catalog/floors/pbr/stone-tile-color.jpg',
    roughnessMapUrl: '/catalog/floors/pbr/stone-tile-rough.jpg',
    normalMapUrl: '/catalog/floors/pbr/stone-tile-normal.jpg',
    textureRepeat: 1.2,
    roughness: 0.35,
    thumbnailUrl: '/catalog/thumbs/floor-stone.svg',
  },
  'Tile-Floor': {
    textureUrl: '/catalog/floors/pbr/porcelain-color.jpg',
    roughnessMapUrl: '/catalog/floors/pbr/porcelain-rough.jpg',
    normalMapUrl: '/catalog/floors/pbr/porcelain-normal.jpg',
    textureRepeat: 0.9,
    roughness: 0.55,
    thumbnailUrl: '/catalog/thumbs/floor-tile.svg',
  },
  'Tile-Wall': {
    textureUrl: '/catalog/floors/pbr/ceramic-color.jpg',
    roughnessMapUrl: '/catalog/floors/pbr/ceramic-rough.jpg',
    textureRepeat: 0.75,
    roughness: 0.5,
    thumbnailUrl: '/catalog/thumbs/floor-tile.svg',
  },
  'Tile - Backsplash': {
    textureUrl: '/catalog/floors/pbr/ceramic-color.jpg',
    roughnessMapUrl: '/catalog/floors/pbr/ceramic-rough.jpg',
    textureRepeat: 0.5,
    roughness: 0.45,
    thumbnailUrl: '/catalog/thumbs/floor-tile.svg',
  },
  'Tile - Pan': {
    textureUrl: '/catalog/floors/pbr/porcelain-color.jpg',
    roughnessMapUrl: '/catalog/floors/pbr/porcelain-rough.jpg',
    textureRepeat: 0.8,
    roughness: 0.4,
    thumbnailUrl: '/catalog/thumbs/floor-tile.svg',
  },
};

export function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
}

export function hashColor(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  const r = 120 + (hash & 0x3f);
  const g = 110 + ((hash >> 6) & 0x3f);
  const b = 100 + ((hash >> 12) & 0x3f);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function dimsForTab(tab) {
  if (tab === 'Countertops') return DEFAULT_DIMS.countertop;
  if (tab.startsWith('Tile-Floor') || tab === 'Tile - Pan' || tab === 'Pavers') return DEFAULT_DIMS.tile;
  if (tab === 'Tile - Listel 4"') return DEFAULT_DIMS.tileListel;
  if (tab.includes('Door')) return DEFAULT_DIMS.door;
  if (tab.includes('Window')) return DEFAULT_DIMS.window;
  if (tab === 'Plumbing' || tab === 'Tankless Heater') return DEFAULT_DIMS.plumbing;
  if (tab.includes('Shaker')) return DEFAULT_DIMS.cabinet;
  if (tab.includes('Stone')) return DEFAULT_DIMS.stonePanel;
  if (tab === 'Trim Material') return DEFAULT_DIMS.trim;
  if (tab === 'Summer Kitchen') return DEFAULT_DIMS.appliance;
  return DEFAULT_DIMS.default;
}

export function mapUnit(unit) {
  if (!unit) return 'each';
  return UNIT_MAP[String(unit).trim().toUpperCase()] ?? 'each';
}

export function shouldIncludeRow(row) {
  const tab = row.Source_Tab;
  if (!SELECTION_SOURCE_TABS.has(tab)) return false;
  const vendor = String(row.Vendor_Source ?? '').trim();
  if (/^ocr parsed/i.test(vendor)) return false;
  const section = String(row.Section ?? '');
  if (EXCLUDED_SECTION_PATTERNS.some((re) => re.test(section))) return false;
  if (/^ocr parsed/i.test(section)) return false;
  const amount = row.Amount;
  if (amount == null || amount === '' || Number.isNaN(Number(amount))) return false;
  if (Number(amount) <= 0) return false;
  return true;
}
