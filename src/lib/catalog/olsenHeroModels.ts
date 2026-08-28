/** Assign CC0 hero GLB proxies to Olsen catalog rows by tab/category/name. */
import type { CatalogItem } from '../../components/catalog/catalogData';
import { MODEL_PACKS } from '../../components/catalog/materialPacks';

type ModelPack = { modelUrl: string; lowPolyModelUrl: string };

function pick(pack: ModelPack): Pick<CatalogItem, 'modelUrl' | 'lowPolyModelUrl' | 'placeholderOnly'> {
  return {
    modelUrl: pack.modelUrl,
    lowPolyModelUrl: pack.lowPolyModelUrl,
    placeholderOnly: false,
  };
}

export function heroModelsForOlsenItem(item: Pick<CatalogItem, 'name' | 'category' | 'sourceTab' | 'subcategory'>): Partial<CatalogItem> | null {
  const name = item.name.toLowerCase();
  const tab = item.sourceTab ?? '';
  const cat = item.category.toLowerCase();

  if (tab === 'Plumbing' || cat === 'plumbing') {
    if (name.includes('toilet')) return pick(MODEL_PACKS.toilet);
    if (name.includes('tub') || name.includes('bath')) return pick(MODEL_PACKS.bathtub);
    if (name.includes('shower')) return pick(MODEL_PACKS.shower);
    if (name.includes('sink') || name.includes('faucet') || name.includes('lav')) return pick(MODEL_PACKS.sink);
    if (name.includes('mirror')) return pick(MODEL_PACKS.bathMirror);
    if (name.includes('towel')) return pick(MODEL_PACKS.towel);
    return pick(MODEL_PACKS.sink);
  }

  if (tab.includes('Shaker') || cat === 'cabinetry') {
    if (name.includes('pantry') || name.includes('tall') || name.includes('wall')) return pick(MODEL_PACKS.cabinetTall);
    return pick(MODEL_PACKS.cabinetBase);
  }

  if (tab === 'Summer Kitchen' || tab === 'Tankless Heater' || cat === 'appliances') {
    if (name.includes('fireplace')) return pick(MODEL_PACKS.bookshelf); // tall massing proxy
    return pick(MODEL_PACKS.washer);
  }

  if (tab === 'Shelves - Mantles - Beams' || name.includes('mantle') || name.includes('mantel')) {
    return pick(MODEL_PACKS.console);
  }

  if (name.includes('bookcase') || name.includes('bookshelf')) return pick(MODEL_PACKS.bookshelf);

  if (cat === 'seating' || name.includes('chair')) return pick(MODEL_PACKS.armchair);
  if (name.includes('sofa') || name.includes('sectional')) return pick(MODEL_PACKS.sofa);
  if (name.includes('table')) return pick(MODEL_PACKS.diningTable);

  return null;
}

export function enrichOlsenCatalogItem<T extends CatalogItem>(item: T): T {
  if (item.modelUrl || item.placementMode === 'floor-fill') return item;
  const hero = heroModelsForOlsenItem(item);
  if (!hero) return item;
  return { ...item, ...hero };
}

export function enrichOlsenCatalog<T extends CatalogItem>(items: T[]): T[] {
  return items.map(enrichOlsenCatalogItem);
}
