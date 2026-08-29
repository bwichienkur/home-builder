import type { CatalogItem, PriceUnit } from '../../components/catalog/catalogData';
import type { ConfiguratorRole, ContractIncludedLevel, ContractSnapshot, PricingCategory } from './contractTypes';
import type { ContractLevelOverride } from './projectTypes';
import { effectiveIncludedLevel } from './projectTypes';

const LEVEL_NUM = /level\s*(\d+)/i;

export function parseLevelNumber(level?: string | null): number | null {
  if (!level) return null;
  const m = level.match(LEVEL_NUM);
  return m ? Number(m[1]) : null;
}

export function pricingCategoryForItem(item: Pick<CatalogItem, 'sourceTab' | 'category' | 'subcategory' | 'roomTypes'>): PricingCategory | null {
  const tab = item.sourceTab ?? '';
  let map: Record<string, PricingCategory> = {
    Countertops: item.roomTypes?.includes('Kitchen') ? 'countertops-kitchen' : 'countertops-bath',
    'Tile-Floor': 'floor-tile',
    'Tile-Wall': 'wall-tile-shower',
    'Tile - Backsplash': 'backsplash',
    'Tile - Pan': 'shower-pan',
    'Interior Doors': 'interior-doors',
    'Ext. Door Install': 'interior-doors',
    Plumbing: 'plumbing-fixtures',
    'Shaker Drs': 'cabinetry',
    'Upgrade Shaker Drs': 'cabinetry',
    'Stone-Eldorado': 'stone-veneer',
    Stone: 'stone-veneer',
    'Trim Material': 'trim',
    'PGT Windows': 'windows',
    'Summer Kitchen': 'outdoor-kitchen',
    Pavers: 'pavers',
  };
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('olsen-org-config-v1') : null;
    if (raw) {
      const parsed = JSON.parse(raw) as {
        tabMappings?: { sourceTab: string; pricingCategory: string; kitchenBathSplit?: boolean }[];
      };
      if (parsed.tabMappings?.length) {
        const fromOrg: Record<string, PricingCategory> = {};
        for (const m of parsed.tabMappings) {
          if (m.kitchenBathSplit && m.sourceTab === 'Countertops') {
            fromOrg.Countertops = item.roomTypes?.includes('Kitchen')
              ? 'countertops-kitchen'
              : 'countertops-bath';
          } else {
            fromOrg[m.sourceTab] = m.pricingCategory;
          }
        }
        map = { ...map, ...fromOrg };
      }
    }
  } catch {
    /* keep defaults */
  }
  if (map[tab]) return map[tab];
  if (item.category === 'Tile' && item.subcategory === 'Floor') return 'floor-tile';
  if (item.category === 'Surfaces' && item.subcategory === 'Countertop') return 'countertops-kitchen';
  return null;
}

export function includedLevelForItem(
  contract: ContractSnapshot | null | undefined,
  item: CatalogItem,
  levelOverrides: ContractLevelOverride[] = [],
): ContractIncludedLevel | undefined {
  if (!contract) return undefined;
  const category = pricingCategoryForItem(item);
  if (!category) return undefined;
  const base = contract.includedLevels.find((row) => {
    if (row.pricingCategory !== category) return false;
    if (row.sourceTab && item.sourceTab && row.sourceTab !== item.sourceTab) return false;
    return true;
  });
  if (!base) return undefined;
  const overrideLevel = effectiveIncludedLevel(contract, category, levelOverrides);
  return overrideLevel ? { ...base, includedLevel: overrideLevel } : base;
}

export function baseItemName(name: string): string {
  return name.replace(/\s·\sLevel\s*\d+.*$/i, '').trim();
}

export function findIncludedPriceRow(
  item: CatalogItem,
  catalog: CatalogItem[],
  contract: ContractSnapshot,
  levelOverrides: ContractLevelOverride[] = [],
): CatalogItem | undefined {
  const included = includedLevelForItem(contract, item, levelOverrides);
  if (!included) return undefined;
  const base = baseItemName(item.name).toLowerCase();
  const tab = item.sourceTab;
  const unit = item.priceUnit ?? 'each';
  return catalog.find((row) => {
    if (row.sourceTab !== tab) return false;
    if ((row.priceUnit ?? 'each') !== unit) return false;
    if (row.level !== included.includedLevel) return false;
    if (base.length > 4 && baseItemName(row.name).toLowerCase() === base) return true;
    return base.length <= 4 || baseItemName(row.name).toLowerCase().includes(base.slice(0, 8));
  });
}

export type CatalogPriceView = {
  showPrice: boolean;
  label: string;
  detail?: string;
  delta?: number;
  included: boolean;
  priceUnit?: PriceUnit;
};

export function formatCatalogPrice(
  item: CatalogItem,
  catalog: CatalogItem[],
  contract: ContractSnapshot | null | undefined,
  role: ConfiguratorRole,
  levelOverrides: ContractLevelOverride[] = [],
): CatalogPriceView {
  const unit = item.priceUnit ?? 'each';
  const price = item.price ?? item.cost;
  if (role === 'client') {
    let hidePricing = true;
    try {
      const raw = localStorage.getItem('olsen-org-config-v1');
      if (raw) {
        const parsed = JSON.parse(raw) as { clientRules?: { hidePricing?: boolean } };
        if (parsed.clientRules?.hidePricing === false) hidePricing = false;
      }
    } catch {
      /* default hide */
    }
    if (hidePricing) {
      return {
        showPrice: false,
        label: item.level ? `${item.level} selection` : 'Included in survey',
        included: true,
        priceUnit: unit,
      };
    }
  }

  if (price == null) {
    return { showPrice: true, label: 'Quote required', included: false, priceUnit: unit };
  }

  if (!contract) {
    return { showPrice: true, label: `$${price.toLocaleString()} / ${unit}`, included: false, priceUnit: unit };
  }

  const includedRow = includedLevelForItem(contract, item, levelOverrides);
  const selectedLevel = parseLevelNumber(item.level);
  const includedLevelNum = parseLevelNumber(includedRow?.includedLevel);
  const includedPriceRow = findIncludedPriceRow(item, catalog, contract, levelOverrides);
  const includedPrice = includedPriceRow?.price ?? includedPriceRow?.cost;

  if (includedRow && selectedLevel != null && includedLevelNum != null && selectedLevel <= includedLevelNum) {
    return {
      showPrice: true,
      label: 'Included',
      detail: `${includedRow.includedLevel} contract baseline`,
      included: true,
      priceUnit: unit,
    };
  }

  if (includedPrice != null) {
    const delta = Math.round((price - includedPrice) * 100) / 100;
    if (delta > 0) {
      return {
        showPrice: true,
        label: `+$${delta.toLocaleString()} / ${unit}`,
        detail: `Above ${includedRow?.includedLevel ?? 'contract'} (${includedPrice.toLocaleString()} / ${unit})`,
        delta,
        included: false,
        priceUnit: unit,
      };
    }
    if (delta < 0) {
      return {
        showPrice: true,
        label: `−$${Math.abs(delta).toLocaleString()} / ${unit} credit`,
        detail: `Below ${includedRow?.includedLevel ?? 'contract'} (${includedPrice.toLocaleString()} / ${unit})`,
        delta,
        included: false,
        priceUnit: unit,
      };
    }
    return {
      showPrice: true,
      label: 'Included',
      detail: `Matches ${includedRow?.includedLevel ?? 'contract'} price`,
      included: true,
      priceUnit: unit,
    };
  }

  return {
    showPrice: true,
    label: `$${price.toLocaleString()} / ${unit}`,
    detail: includedRow ? `Contract baseline: ${includedRow.includedLevel}` : undefined,
    included: false,
    priceUnit: unit,
  };
}
