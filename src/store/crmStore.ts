import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Client,
  CustomFieldDefinition,
  EntityKind,
  HousePlanMeta,
  InventoryRecord,
  Vendor,
} from '../lib/crm/types';
import { clientSchema, inventoryRecordSchema, vendorSchema } from '../lib/crm/types';

function now() {
  return new Date().toISOString();
}

type CrmState = {
  clients: Client[];
  vendors: Vendor[];
  inventory: InventoryRecord[];
  customFields: CustomFieldDefinition[];
  housePlans: HousePlanMeta[];
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

export const useCrmStore = create<CrmState>()(
  persist(
    (set, get) => ({
      clients: [],
      vendors: [],
      inventory: [],
      customFields: [],
      housePlans: [],
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
      },
      upsertCustomField: (field) => {
        const existing = get().customFields.find((f) => f.id === field.id);
        set({
          customFields: existing
            ? get().customFields.map((f) => (f.id === field.id ? field : f))
            : [...get().customFields, field],
        });
      },
      archiveCustomField: (id) => {
        set({
          customFields: get().customFields.map((f) => (f.id === id ? { ...f, archived: true } : f)),
        });
      },
      upsertHousePlan: (plan) => {
        const existing = get().housePlans.find((p) => p.id === plan.id);
        set({
          housePlans: existing
            ? get().housePlans.map((p) => (p.id === plan.id ? plan : p))
            : [plan, ...get().housePlans],
        });
      },
      removeHousePlan: (id) => set({ housePlans: get().housePlans.filter((p) => p.id !== id) }),
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
    }),
    { name: 'mahnikka-crm-v1' },
  ),
);
