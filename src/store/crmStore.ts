import { create } from 'zustand';
import type {
  Client,
  CustomFieldDefinition,
  EntityKind,
  HousePlanMeta,
  InventoryRecord,
  Vendor,
} from '../lib/crm/types';
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
      set({
        clients: Array.isArray(data.clients) ? data.clients : [],
        vendors: Array.isArray(data.vendors) ? data.vendors : [],
        inventory: Array.isArray(data.inventory) ? data.inventory : [],
        customFields: Array.isArray(data.customFields) ? data.customFields : [],
        housePlans: Array.isArray(data.housePlans) ? data.housePlans : [],
        ready: true,
      });
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
      category: input.category,
      description: input.description ?? existing?.description ?? '',
      width: input.width ?? existing?.width ?? 0,
      depth: input.depth ?? existing?.depth ?? 0,
      height: input.height ?? existing?.height ?? 0,
      unit: input.unit ?? existing?.unit ?? 'm',
      price: input.price ?? existing?.price,
      currency: input.currency ?? existing?.currency ?? 'USD',
      active: input.active ?? existing?.active ?? true,
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
    schedulePersist(get);
    return row;
  },
  archiveEntity: (kind, id) => {
    if (kind === 'client') {
      set({ clients: get().clients.map((c) => (c.id === id ? { ...c, archived: true, updatedAt: now() } : c)) });
    } else if (kind === 'vendor') {
      set({ vendors: get().vendors.map((v) => (v.id === id ? { ...v, archived: true, updatedAt: now() } : v)) });
    } else {
      set({
        inventory: get().inventory.map((v) => (v.id === id ? { ...v, archived: true, updatedAt: now() } : v)),
      });
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
