import type { CatalogItem } from '../../components/catalog/catalogData';
import type { RoomType } from '../../types';

/** Category affinities for “works with” suggestions (IKEA-style complements). */
const AFFINITY: Record<string, string[]> = {
  Bedroom: ['Lighting', 'Storage', 'Decor', 'Tables'],
  Storage: ['Lighting', 'Decor', 'Bedroom'],
  Cabinetry: ['Lighting', 'Surfaces', 'Plumbing'],
  Seating: ['Tables', 'Lighting', 'Decor'],
  Tables: ['Seating', 'Lighting', 'Decor'],
  Lighting: ['Decor', 'Bedroom', 'Seating'],
  Decor: ['Lighting', 'Bedroom', 'Seating'],
  Plumbing: ['Cabinetry', 'Surfaces', 'Tile'],
  Appliances: ['Cabinetry', 'Surfaces'],
  Surfaces: ['Cabinetry', 'Tile'],
  Tile: ['Plumbing', 'Surfaces'],
  Paneling: ['Lighting', 'Decor'],
};

export function complementCategories(category: string): string[] {
  return AFFINITY[category] ?? ['Lighting', 'Decor', 'Storage'];
}

export function complementaryProducts(
  product: Pick<CatalogItem, 'id' | 'category' | 'roomTypes'>,
  catalog: CatalogItem[],
  roomType: RoomType,
  limit = 4,
): CatalogItem[] {
  const wanted = new Set(complementCategories(product.category));
  const scored = catalog
    .filter((item) => item.id !== product.id && wanted.has(item.category))
    .filter((item) => !item.roomTypes?.length || item.roomTypes.includes(roomType))
    .map((item) => {
      let score = 0;
      if (item.price != null) score += 2;
      if (item.thumbnailUrl || item.modelUrl) score += 1;
      if (item.roomTypes?.includes(roomType)) score += 2;
      if (item.category === complementCategories(product.category)[0]) score += 1;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || (a.item.price ?? 1e9) - (b.item.price ?? 1e9));

  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  for (const { item } of scored) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
