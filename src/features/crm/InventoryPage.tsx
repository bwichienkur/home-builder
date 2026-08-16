import { FormEvent, useState } from 'react';
import type { InventoryRecord } from '../../lib/crm/types';
import { useCrmStore } from '../../store/crmStore';
import { CustomFieldsInputs, EntityCrmPage, EntityDrawer } from './EntityCrmPage';

const empty = (): Partial<InventoryRecord> & { sku: string; name: string; category: string } => ({
  sku: '',
  name: '',
  category: 'Furniture',
  vendorName: '',
  description: '',
  width: 0,
  depth: 0,
  height: 0,
  unit: 'm',
  currency: 'USD',
  active: true,
  customFields: {},
});

export function InventoryPage() {
  const inventory = useCrmStore((s) => s.inventory.filter((i) => !i.archived));
  const fields = useCrmStore((s) => s.customFields);
  const upsert = useCrmStore((s) => s.upsertInventory);
  const archive = useCrmStore((s) => s.archiveEntity);
  const [draft, setDraft] = useState<(Partial<InventoryRecord> & { sku: string; name: string; category: string }) | null>(
    null,
  );

  return (
    <>
      <EntityCrmPage
        entity="inventory"
        title="Inventory"
        lede="Product SKUs for quoting and the Build catalog bridge. Template CSV, import, and manual add."
        fields={fields}
        rows={inventory}
        templateExample={[
          'SOFA-01',
          'Lounge sofa',
          'Roomcraft Home',
          'Furniture',
          '3-seat',
          '2.2',
          '0.9',
          '0.8',
          'm',
          '899',
          'USD',
          'true',
        ]}
        columns={[
          { key: 'sku', label: 'SKU', render: (r) => r.sku },
          { key: 'name', label: 'Name', render: (r) => r.name },
          { key: 'vendorName', label: 'Vendor', render: (r) => r.vendorName || '—' },
          { key: 'category', label: 'Category', render: (r) => r.category },
          {
            key: 'price',
            label: 'Price',
            render: (r) => (r.price != null ? `${r.currency} ${r.price}` : '—'),
          },
        ]}
        onAdd={() => setDraft(empty())}
        onEdit={(row) => setDraft({ ...row })}
        onArchive={(id) => archive('inventory', id)}
        onImportRows={(objects) => {
          const errors: string[] = [];
          let created = 0;
          for (const { row, values } of objects) {
            if (!values.sku || !values.name || !values.category) {
              errors.push(`Row ${row}: sku, name, category required`);
              continue;
            }
            const customFields: Record<string, string> = {};
            for (const [k, v] of Object.entries(values)) {
              if (k.startsWith('custom.')) customFields[k.slice(7)] = v;
            }
            upsert({
              sku: values.sku,
              name: values.name,
              category: values.category,
              vendorName: values.vendorName ?? '',
              description: values.description ?? '',
              width: Number(values.width || 0),
              depth: Number(values.depth || 0),
              height: Number(values.height || 0),
              unit: values.unit || 'm',
              price: values.price ? Number(values.price) : undefined,
              currency: values.currency || 'USD',
              active: String(values.active ?? 'true').toLowerCase() !== 'false',
              customFields,
            });
            created++;
          }
          return { created, errors };
        }}
      />
      <EntityDrawer
        title={draft?.id ? 'Edit inventory item' : 'Add inventory item'}
        open={!!draft}
        onClose={() => setDraft(null)}
      >
        {draft && (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              upsert(draft);
              setDraft(null);
            }}
          >
            <label>
              SKU
              <input required value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
            </label>
            <label>
              Name
              <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label>
              Category
              <input
                required
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
            </label>
            <label>
              Vendor
              <input
                value={draft.vendorName ?? ''}
                onChange={(e) => setDraft({ ...draft, vendorName: e.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                value={draft.description ?? ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label>
              Width
              <input
                type="number"
                step="any"
                value={draft.width ?? 0}
                onChange={(e) => setDraft({ ...draft, width: Number(e.target.value) })}
              />
            </label>
            <label>
              Depth
              <input
                type="number"
                step="any"
                value={draft.depth ?? 0}
                onChange={(e) => setDraft({ ...draft, depth: Number(e.target.value) })}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                step="any"
                value={draft.height ?? 0}
                onChange={(e) => setDraft({ ...draft, height: Number(e.target.value) })}
              />
            </label>
            <label>
              Price
              <input
                type="number"
                step="any"
                value={draft.price ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, price: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </label>
            <CustomFieldsInputs
              entity="inventory"
              fields={fields}
              values={draft.customFields ?? {}}
              onChange={(customFields) => setDraft({ ...draft, customFields })}
            />
            <div className="data-form-actions">
              <button type="submit" className="primary">
                Save
              </button>
              <button type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </EntityDrawer>
    </>
  );
}
