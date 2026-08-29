/** Platinum baseline contract — included selection tiers for delta pricing. */
import type { PriceUnit } from '../../components/catalog/catalogTypes';

export type ConfiguratorRole = 'client' | 'designer' | 'admin';

export type PricingCategory =
  | 'countertops-kitchen'
  | 'countertops-bath'
  | 'floor-tile'
  | 'wall-tile-shower'
  | 'backsplash'
  | 'shower-pan'
  | 'interior-doors'
  | 'cabinetry'
  | 'plumbing-fixtures'
  | 'stone-veneer'
  | 'trim'
  | 'pavers'
  | 'windows'
  | 'outdoor-kitchen';

export type ContractIncludedLevel = {
  pricingCategory: PricingCategory;
  sourceTab?: string;
  includedLevel: string;
  label: string;
  priceUnit: PriceUnit;
};

export type ContractSnapshot = {
  id: string;
  name: string;
  planRef?: string;
  lotRef?: string;
  baseline: 'platinum';
  includedLevels: ContractIncludedLevel[];
  verifiedAt: string;
  notes?: string;
};

export type SelectionProject = {
  id: string;
  name: string;
  planRef: string;
  lotRef?: string;
  contract: ContractSnapshot;
  createdAt: string;
};

export const PLATINUM_INCLUDED_LEVELS: ContractIncludedLevel[] = [
  { pricingCategory: 'countertops-kitchen', sourceTab: 'Countertops', includedLevel: 'Level 5', label: 'Kitchen countertops (3cm granite/quartz)', priceUnit: 'sq ft' },
  { pricingCategory: 'countertops-bath', sourceTab: 'Countertops', includedLevel: 'Level 4', label: 'Bathroom countertops', priceUnit: 'sq ft' },
  { pricingCategory: 'floor-tile', sourceTab: 'Tile-Floor', includedLevel: 'Level 3', label: 'Platinum porcelain floor tile', priceUnit: 'sq ft' },
  { pricingCategory: 'wall-tile-shower', sourceTab: 'Tile-Wall', includedLevel: 'Level 5', label: 'Shower / tub wall tile to 8\'', priceUnit: 'sq ft' },
  { pricingCategory: 'backsplash', sourceTab: 'Tile - Backsplash', includedLevel: 'Level 4', label: 'Kitchen backsplash', priceUnit: 'sq ft' },
  { pricingCategory: 'shower-pan', sourceTab: 'Tile - Pan', includedLevel: 'Level 4', label: 'Shower floor tile', priceUnit: 'sq ft' },
  { pricingCategory: 'interior-doors', sourceTab: 'Interior Doors', includedLevel: 'Level 3', label: 'Interior raised-panel doors', priceUnit: 'each' },
  { pricingCategory: 'cabinetry', sourceTab: 'Shaker Drs', includedLevel: 'Level 4', label: 'Maple raised-panel cabinetry', priceUnit: 'each' },
  { pricingCategory: 'plumbing-fixtures', sourceTab: 'Plumbing', includedLevel: 'Level 3', label: 'Plumbing fixtures package', priceUnit: 'each' },
  { pricingCategory: 'stone-veneer', sourceTab: 'Stone-Eldorado', includedLevel: 'Level 3', label: 'Eldorado stone accents', priceUnit: 'sq ft' },
  { pricingCategory: 'trim', sourceTab: 'Trim Material', includedLevel: 'Level 3', label: 'Decorative trim package', priceUnit: 'linear ft' },
  { pricingCategory: 'windows', sourceTab: 'PGT Windows', includedLevel: 'Level 3', label: 'PGT window package', priceUnit: 'each' },
  { pricingCategory: 'outdoor-kitchen', sourceTab: 'Summer Kitchen', includedLevel: 'Level 3', label: 'Summer kitchen allowance', priceUnit: 'each' },
  { pricingCategory: 'pavers', sourceTab: 'Pavers', includedLevel: 'Level 2', label: 'Paver hardscape', priceUnit: 'sq ft' },
];

export const PRICING_CATEGORIES: PricingCategory[] = PLATINUM_INCLUDED_LEVELS.map((r) => r.pricingCategory);

export const INCLUDED_LEVEL_OPTIONS = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Allowance'] as const;

export const PRICE_UNIT_OPTIONS: PriceUnit[] = ['each', 'set', 'box', 'sq ft', 'linear ft', 'allowance'];

export function platinumLabelForCategory(category: PricingCategory): string {
  return PLATINUM_INCLUDED_LEVELS.find((r) => r.pricingCategory === category)?.label ?? category;
}

export function platinumSourceTabForCategory(category: PricingCategory): string | undefined {
  return PLATINUM_INCLUDED_LEVELS.find((r) => r.pricingCategory === category)?.sourceTab;
}
export function createPlatinumContract(name: string, planRef?: string, lotRef?: string): ContractSnapshot {
  return {
    id: `contract-${slug(name)}`,
    name,
    planRef,
    lotRef,
    baseline: 'platinum',
    includedLevels: PLATINUM_INCLUDED_LEVELS.map((row) => ({ ...row })),
    verifiedAt: new Date().toISOString().slice(0, 10),
    notes: 'Platinum Features baseline — delta pricing shows upgrade above included tier.',
  };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const STILLWATER_183_PROJECT: SelectionProject = {
  id: 'stillwater-183-veranda-bay',
  name: '183 Stillwater · Veranda Bay Lot 181',
  planRef: 'Veranda Model 183 Stillwater',
  lotRef: 'Veranda Bay · Lot 181',
  contract: createPlatinumContract('183 Stillwater COF #1', 'Veranda Model 183 Stillwater', 'Veranda Bay · Lot 181'),
  createdAt: '2026-07-27T00:00:00.000Z',
};
