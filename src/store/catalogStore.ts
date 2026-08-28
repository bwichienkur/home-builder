import { create } from 'zustand';
import { useMemo } from 'react';
import type { CatalogItem } from '../components/catalog/catalogData';
import { useInventoryStore } from './inventoryStore';
import { getCatalog } from '../api/client';
import {
  buildCatalogView,
  getOlsenCatalogSeed,
  mapApiProductToCatalogItem,
  type ApiCatalogProduct,
} from '../lib/catalog/catalogSource';

type CatalogState = {
  seed: CatalogItem[];
  apiItems: CatalogItem[];
  ready: boolean;
  loading: boolean;
  source: 'seed' | 'api' | 'seed+api';
  error: string | null;
  hydrate: () => Promise<void>;
  items: () => CatalogItem[];
};

async function fetchAllApiCatalog(): Promise<CatalogItem[]> {
  const out: CatalogItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const pageData = await getCatalog<ApiCatalogProduct>('', cursor);
    if (!pageData.items?.length) break;
    out.push(...pageData.items.map(mapApiProductToCatalogItem));
    if (!pageData.nextCursor) break;
    cursor = pageData.nextCursor;
  }
  return out;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  seed: getOlsenCatalogSeed(),
  apiItems: [],
  ready: false,
  loading: false,
  source: 'seed',
  error: null,
  items: () => get().seed,
  hydrate: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const apiItems = await fetchAllApiCatalog();
      if (apiItems.length) {
        set({ apiItems, ready: true, loading: false, source: 'seed+api' });
      } else {
        set({ ready: true, loading: false, source: 'seed' });
      }
    } catch (err) {
      set({
        ready: true,
        loading: false,
        source: 'seed',
        error: err instanceof Error ? err.message : 'Catalog API unavailable',
      });
    }
  },
}));

/** Merged catalog for Build: Olsen seed, optional API overlay, optional inventory. */
export function useBuildCatalog(inventory: CatalogItem[] = []): CatalogItem[] {
  const seed = useCatalogStore((s) => s.seed);
  const apiItems = useCatalogStore((s) => s.apiItems);
  return buildCatalogView(seed, apiItems, inventory);
}

export function useCatalogById(): Map<string, CatalogItem> {
  const inventory = useInventoryStore((s) => s.items);
  const items = useBuildCatalog(inventory);
  return useMemo(() => new Map(items.map((c) => [c.id, c])), [items]);
}

export function getStaticCatalog(): CatalogItem[] {
  return getOlsenCatalogSeed();
}
