import { create } from 'zustand';
import type {
  Client,
  CustomFieldDefinition,
  EntityKind,
  HousePlanMeta,
  InventoryRecord,
  Vendor,
} from '../lib/crm/types';
import {
  removeInventoryFromCatalog,
  syncAllInventoryToCatalog,
  syncInventoryToCatalog,
} from '../lib/crm/inventoryCatalogBridge';
import { clientSchema, inventoryRecordSchema, vendorSchema } from '../lib/crm/types';
import type { CrmSnapshot } from '../lib/platform/crmProvider';
import { getCrmProvider } from '../lib/platform/getCrmProvider';

function now() {
  return new Date().toISOString();
}

type CrmState = CrmSnapshot & {
  ready: boolean;
  hydrate: () => Promise<void>;
  upsertClient: (input: Partial<Client> & { name: string }) => Client;
  upsertVendor: (input: Partial<Vendor> & { name: string }) => Vendor;
  upsertInventory: (input: Partial<InventoryRecord> & { sku: string; name: string; category: string }) => InventoryRecord;
  archiveEntity: (kind: EntityKind, id: string) => void;
  upsertCustomField: (field: CustomFieldDefinition) => void;
  archiveCustomField: (id: string) => void;
  upsertHousePlan: (plan: HousePlanMeta) => void;
  removeHousePlan: (id: string) => void;
  importClients: (rows: Client[]) => { created: number };
  importVendors: (rows: Vendor[]) => { created: number };
  importInventory: (rows: InventoryRecord[]) => { created: number };
};

function snapshot(s: CrmState): CrmSnapshot {
  return {
    clients: s.clients,
    vendors: s.vendors,
    inventory: s.inventory,
    customFields: s.customFields,
    housePlans: s.housePlans,
  };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(get: () => CrmState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void getCrmProvider().save(snapshot(get())).catch((err) => {
      console.warn('CRM persist failed', err);
    });
  }, 120);
}

export const useCrmStore = create<CrmState>((set, get) => ({
  ready: false,
  clients: [],
  vendors: [],
  inventory: [],
  customFields: [],
  housePlans: [],
  hydrate: async () => {
    try {
      const data = await getCrmProvider().load();
      const inventory = (Array.isArray(data.inventory) ? data.inventory : [])
        .map((row) => {
          try {
            return inventoryRecordSchema.parse(row);
          } catch {
            return null;
          }
        })
        .filter((row): row is NonNullable<typeof row> => row != null);
      set({
        clients: Array.isArray(data.clients) ? data.clients : [],
        vendors: Array.isArray(data.vendors) ? data.vendors : [],
        inventory,
        customFields: Array.isArray(data.customFields) ? data.customFields : [],
        housePlans: Array.isArray(data.housePlans) ? data.housePlans : [],
        ready: true,
      });
      syncAllInventoryToCatalog(inventory);
    } catch (err) {
      console.warn('CRM hydrate failed', err);
      set({ ready: true });
    }
  },
  upsertClient: (input) => {
    const existing = input.id ? get().clients.find((c) => c.id === input.id) : undefined;
    const row = clientSchema.parse({
      id: existing?.id ?? input.id ?? crypto.randomUUID(),
      name: input.name,
      email: input.email ?? existing?.email ?? '',
      phone: input.phone ?? existing?.phone ?? '',
      company: input.company ?? existing?.company ?? '',
      address: input.address ?? existing?.address ?? '',
      notes: input.notes ?? existing?.notes ?? '',
      customFields: input.customFields ?? existing?.customFields ?? {},
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
      archived: input.archived ?? existing?.archived ?? false,
    });
    set({
      clients: existing
        ? get().clients.map((c) => (c.id === row.id ? row : c))
        : [row, ...get().clients],
    });
    schedulePersist(get);
    return row;
  },
  upsertVendor: (input) => {
    const existing = input.id ? get().vendors.find((v) => v.id === input.id) : undefined;
    const row = vendorSchema.parse({
      id: existing?.id ?? input.id ?? crypto.randomUUID(),
      name: input.name,
      email: input.email ?? existing?.email ?? '',
      phone: input.phone ?? existing?.phone ?? '',
      website: input.website ?? existing?.website ?? '',
      contactName: input.contactName ?? existing?.contactName ?? '',
      notes: input.notes ?? existing?.notes ?? '',
      customFields: input.customFields ?? existing?.customFields ?? {},
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
      archived: input.archived ?? existing?.archived ?? false,
    });
    set({
      vendors: existing
        ? get().vendors.map((v) => (v.id === row.id ? row : v))
        : [row, ...get().vendors],
    });
    schedulePersist(get);
    return row;
  },
  upsertInventory: (input) => {
    const existing = input.id
      ? get().inventory.find((v) => v.id === input.id)
      : get().inventory.find((v) => v.sku === input.sku && !v.archived);
    const row = inventoryRecordSchema.parse({
      id: existing?.id ?? input.id ?? crypto.randomUUID(),
      sku: input.sku,
      name: input.name,
      vendorName: input.vendorName ?? existing?.vendorName ?? '',
      brand: input.brand ?? existing?.brand ?? '',
      model: input.model ?? existing?.model ?? '',
      category: input.category,
      subcategory: input.subcategory ?? existing?.subcategory ?? '',
      description: input.description ?? existing?.description ?? '',
      note: input.note ?? existing?.note ?? '',
      width: input.width ?? existing?.width ?? 0,
      depth: input.depth ?? existing?.depth ?? 0,
      height: input.height ?? existing?.height ?? 0,
      unit: input.unit ?? existing?.unit ?? 'm',
      color: input.color ?? existing?.color ?? '#b9b9b2',
      mountingType: input.mountingType ?? existing?.mountingType ?? 'floor',
      placementSurfaces: input.placementSurfaces ?? existing?.placementSurfaces ?? ['floor'],
      placementMode: 'placementMode' in input ? input.placementMode || undefined : existing?.placementMode,
      roomTypes: input.roomTypes ?? existing?.roomTypes ?? [],
      tags: input.tags ?? existing?.tags ?? [],
      price: 'price' in input ? input.price : existing?.price,
      priceUnit: input.priceUnit ?? existing?.priceUnit ?? 'each',
      currency: input.currency ?? existing?.currency ?? 'USD',
      msrp: 'msrp' in input ? input.msrp : existing?.msrp,
      cost: 'cost' in input ? input.cost : existing?.cost,
      laborCost: 'laborCost' in input ? input.laborCost : existing?.laborCost,
      priceVerifiedAt: input.priceVerifiedAt ?? existing?.priceVerifiedAt ?? '',
      sellable: input.sellable ?? existing?.sellable ?? true,
      placeholderOnly: input.placeholderOnly ?? existing?.placeholderOnly ?? false,
      active: input.active ?? existing?.active ?? true,
      finish: input.finish ?? existing?.finish ?? '',
      material: input.material ?? existing?.material ?? '',
      variantGroup: input.variantGroup ?? existing?.variantGroup ?? '',
      variantName: input.variantName ?? existing?.variantName ?? '',
      availability: input.availability ?? existing?.availability ?? '',
      leadTimeDays: 'leadTimeDays' in input ? input.leadTimeDays : existing?.leadTimeDays,
      thumbnailUrl: input.thumbnailUrl ?? existing?.thumbnailUrl ?? '',
      textureUrl: input.textureUrl ?? existing?.textureUrl ?? '',
      textureRepeat: 'textureRepeat' in input ? input.textureRepeat : existing?.textureRepeat,
      roughness: 'roughness' in input ? input.roughness : existing?.roughness,
      modelUrl: input.modelUrl ?? existing?.modelUrl ?? '',
      lowPolyModelUrl: input.lowPolyModelUrl ?? existing?.lowPolyModelUrl ?? '',
      emoji: input.emoji ?? existing?.emoji ?? '▧',
      sourceUrl: input.sourceUrl ?? existing?.sourceUrl ?? '',
      sourceLabel: input.sourceLabel ?? existing?.sourceLabel ?? '',
      customFields: input.customFields ?? existing?.customFields ?? {},
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
      archived: input.archived ?? existing?.archived ?? false,
    });
    set({
      inventory: existing
        ? get().inventory.map((v) => (v.id === row.id ? row : v))
        : [row, ...get().inventory],
    });
    syncInventoryToCatalog(row);
    schedulePersist(get);
    return row;
  },
  archiveEntity: (kind, id) => {
    if (kind === 'client') {
      set({ clients: get().clients.map((c) => (c.id === id ? { ...c, archived: true, updatedAt: now() } : c)) });
    } else if (kind === 'vendor') {
      set({ vendors: get().vendors.map((v) => (v.id === id ? { ...v, archived: true, updatedAt: now() } : v)) });
    } else {
      const row = get().inventory.find((v) => v.id === id);
      set({
        inventory: get().inventory.map((v) => (v.id === id ? { ...v, archived: true, updatedAt: now() } : v)),
      });
      if (row) removeInventoryFromCatalog(row);
    }
    schedulePersist(get);
  },
  upsertCustomField: (field) => {
    const existing = get().customFields.find((f) => f.id === field.id);
    set({
      customFields: existing
        ? get().customFields.map((f) => (f.id === field.id ? field : f))
        : [...get().customFields, field],
    });
    schedulePersist(get);
  },
  archiveCustomField: (id) => {
    set({
      customFields: get().customFields.map((f) => (f.id === id ? { ...f, archived: true } : f)),
    });
    schedulePersist(get);
  },
  upsertHousePlan: (plan) => {
    const existing = get().housePlans.find((p) => p.id === plan.id);
    set({
      housePlans: existing
        ? get().housePlans.map((p) => (p.id === plan.id ? plan : p))
        : [plan, ...get().housePlans],
    });
    schedulePersist(get);
  },
  removeHousePlan: (id) => {
    set({ housePlans: get().housePlans.filter((p) => p.id !== id) });
    schedulePersist(get);
  },
  importClients: (rows) => {
    let created = 0;
    for (const row of rows) {
      get().upsertClient(row);
      created++;
    }
    return { created };
  },
  importVendors: (rows) => {
    let created = 0;
    for (const row of rows) {
      get().upsertVendor(row);
      created++;
    }
    return { created };
  },
  importInventory: (rows) => {
    let created = 0;
    for (const row of rows) {
      get().upsertInventory(row);
      created++;
    }
    return { created };
  },
}));
