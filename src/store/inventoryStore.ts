import { create } from 'zustand';
import type { CatalogItem } from '../components/catalog/catalogData';

type ImportMode = 'create-update' | 'create-only' | 'replace-vendor';
type InventoryState = {
  items: CatalogItem[];
  lastImportAt: string | null;
  upsert: (items: CatalogItem[], mode: ImportMode) => { created: number; updated: number; skipped: number };
  removeIds: (ids: string[]) => void;
  removeVendor: (vendorId: string) => void;
  clear: () => void;
};

const STORAGE = 'roomcraft-vendor-inventory-v1';
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? '[]') as CatalogItem[];
  } catch {
    return [];
  }
};

const persist = (items: CatalogItem[]) => localStorage.setItem(STORAGE, JSON.stringify(items));

const initialItems = typeof window === 'undefined' ? [] : read();

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: initialItems,
  lastImportAt:
    typeof window === 'undefined' ? null : localStorage.getItem(`${STORAGE}-date`),
  upsert: (incoming, mode) => {
    let items = [...get().items];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    if (mode === 'replace-vendor') {
      const vendors = new Set(incoming.map((i) => i.vendorId).filter(Boolean));
      items = items.filter((i) => !i.vendorId || !vendors.has(i.vendorId));
    }
    for (const item of incoming) {
      const index = items.findIndex(
        (existing) =>
          (existing.vendorId ?? existing.brand) === (item.vendorId ?? item.brand) &&
          (existing.sku ?? existing.id) === (item.sku ?? item.id),
      );
      if (index < 0) {
        items.push(item);
        created++;
      } else if (mode === 'create-only') {
        skipped++;
      } else {
        items[index] = { ...items[index], ...item };
        updated++;
      }
    }
    const lastImportAt = new Date().toISOString();
    persist(items);
    localStorage.setItem(`${STORAGE}-date`, lastImportAt);
    set({ items, lastImportAt });
    return { created, updated, skipped };
  },
  removeIds: (ids) => {
    if (!ids.length) return;
    const drop = new Set(ids);
    const items = get().items.filter((i) => !drop.has(i.id));
    persist(items);
    set({ items });
  },
  removeVendor: (vendorId) => {
    const items = get().items.filter((i) => i.vendorId !== vendorId);
    persist(items);
    set({ items });
  },
  clear: () => {
    persist([]);
    set({ items: [], lastImportAt: null });
  },
}));
