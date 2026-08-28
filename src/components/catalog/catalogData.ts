import type { CatalogPlacementMode, PriceUnit } from './catalogTypes';
import { getOlsenCatalogSeed } from '../../lib/catalog/catalogSource';

export type { CatalogPlacementMode, PriceUnit } from './catalogTypes';

export type CatalogItem = {
  id: string;
  sku?: string;
  vendorId?: string;
  name: string;
  brand?: string;
  model?: string;
  category: string;
  subcategory?: string;
  roomTypes?: string[];
  tags?: string[];
  dims: [number, number, number];
  color: string;
  price?: number;
  msrp?: number;
  cost?: number;
  laborCost?: number;
  currency?: string;
  priceUnit?: PriceUnit;
  priceVerifiedAt?: string;
  sellable?: boolean;
  placeholderOnly?: boolean;
  mountingType?: string;
  placementSurfaces?: string[];
  placementMode?: CatalogPlacementMode;
  finish?: string;
  material?: string;
  variantGroup?: string;
  variantName?: string;
  availability?: string;
  leadTimeDays?: number;
  thumbnailUrl?: string;
  textureUrl?: string;
  roughnessMapUrl?: string;
  normalMapUrl?: string;
  metalnessMapUrl?: string;
  textureRepeat?: number;
  roughness?: number;
  modelUrl?: string;
  lowPolyModelUrl?: string;
  emoji: string;
  sourceUrl?: string;
  sourceLabel?: string;
  note?: string;
  /** Olsen tier e.g. "Level 5" — used for contract delta pricing. */
  level?: string;
  sourceTab?: string;
  section?: string;
};

/** Default catalog: baked Olsen Cost Library selections (~800 SKUs). */
export const catalog: CatalogItem[] = getOlsenCatalogSeed();

/** Legacy starter inventory seeding removed — Olsen catalog is the source of truth. */
export function starterInventoryItems(): CatalogItem[] {
  return [];
}
